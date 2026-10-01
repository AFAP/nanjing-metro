import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {get as httpGet} from 'node:http';
import {mkdir,readFile,writeFile,mkdtemp} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const temporaryRoot = path.join(project,'.sites-runtime');
await mkdir(temporaryRoot,{recursive:true});
const fixtureRoot = await mkdtemp(path.join(temporaryRoot,'review-test-'));
const base = {schema_version:'1.0.0',stats:{stations:2,human_verified:0},stations:[
  {id:'fixture-a',name:'测试车站甲',human_verified:false,toilets:{availability:'available',locations:[]}},
  {id:'fixture-b',name:'测试车站乙',human_verified:false,toilets:{availability:'unavailable',locations:[]}}
]};
await writeFile(path.join(fixtureRoot,'stations.json'),JSON.stringify(base));
const reviewFile = path.join(fixtureRoot,'manual-reviews.json');
const endpoint = 'http://localhost:4180';
const empty = {human_verified:false,toilet_availability:null,toilet_location:'',notes:''};
let child, checks=0;
const check = (actual,expected) => {assert.deepEqual(actual,expected);checks++;};
async function start() {
  child=spawn(process.execPath,['server.mjs'],{cwd:project,windowsHide:true,env:{...process.env,METRO_PORT:'4180',METRO_DATA_DIR:fixtureRoot},stdio:['ignore','pipe','pipe']});
  await new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(new Error('Test server did not start')),6000);
    child.stdout.on('data',chunk=>{if(chunk.toString().includes(endpoint)){clearTimeout(timeout);resolve();}});
    child.once('exit',code=>{clearTimeout(timeout);reject(new Error('Test server exited: '+code));});
  });
}
async function stop() {if(child && child.exitCode===null){const exited=once(child,'exit');child.kill();await exited;}}
const put = (id,value,headers={}) => fetch(endpoint+'/api/reviews/'+id,{method:'PUT',headers:{'Content-Type':'application/json',...headers},body:typeof value==='string'?value:JSON.stringify(value),signal:AbortSignal.timeout(5000)});
try {
  await start();
  check((await (await fetch(endpoint+'/api/reviews')).json()).reviews,{});
  check((await fetch(endpoint+'/data/manual-reviews.json')).status,404);
  check((await fetch(endpoint+'/data/sources/private.json')).status,404);
  check((await (await fetch(endpoint+'/data/stations.json')).json()).stations.length,2);
  check((await put('not-a-station',empty)).status,404);
  check((await put('fixture-a',{...empty,human_verified:'true'})).status,400);
  check((await put('fixture-a',{...empty,source_ids:[]})).status,400);
  check((await put('fixture-a',{...empty,toilet_location:'x'.repeat(2001)})).status,400);
  check((await put('fixture-a','{broken-json')).status,400);
  check((await put('fixture-a',empty,{'Content-Type':'text/plain'})).status,415);
  check((await put('fixture-a',empty,{Origin:'https://unrelated.example'})).status,403);
  const invalidHost = await new Promise((resolve,reject)=>httpGet(endpoint+'/api/reviews',{headers:{Host:'unrelated.example:4180'}},response=>{response.resume();resolve(response.statusCode);}).once('error',reject));
  check(invalidHost,403);
  const first = await (await put('fixture-a',{...empty,human_verified:true,toilet_location:'隔离测试 B2 东端',toilet_availability:'available',notes:'测试，不是真实站点核对。'})).json();
  assert.ok(first.verified_at);check(first.reviewer,'local-user');
  const second = await (await put('fixture-a',{...empty,human_verified:true,toilet_location:'隔离测试 B2 西端',toilet_availability:'available'})).json();
  check(second.verified_at,first.verified_at);
  const concurrent = await Promise.all([
    put('fixture-a',{...empty,human_verified:true,toilet_location:'甲站并发测试'}),
    put('fixture-b',{...empty,human_verified:false,toilet_availability:'unknown',notes:'乙站并发测试'})
  ]);
  check(concurrent.map(r=>r.status),[200,200]);
  const stored = JSON.parse(await readFile(reviewFile,'utf8'));
  check(Object.keys(stored.reviews).sort(),['fixture-a','fixture-b']);
  check(stored.reviews['fixture-a'].toilet_location,'甲站并发测试');
  check(stored.reviews['fixture-b'].notes,'乙站并发测试');
  assert.ok(JSON.parse(await readFile(reviewFile+'.bak','utf8')).reviews);
  await stop();await start();
  check((await (await fetch(endpoint+'/api/reviews')).json()).reviews,stored.reviews);
  const exported = await (await fetch(endpoint+'/api/stations/export')).json();
  check(exported.stats.human_verified,1);
  check(exported.stations[0].human_verified,true);
  check(exported.stations[0].effective_toilet_location,'甲站并发测试');
  check(exported.stations[1].effective_toilet_availability,'unknown');
  check(JSON.parse(await readFile(path.join(fixtureRoot,'stations.json'),'utf8')),base);
  const reverted = await (await put('fixture-a',empty)).json();
  check(reverted.verified_at,null);check(reverted.reviewer,null);
  check((await (await fetch(endpoint+'/api/stations/export')).json()).stats.human_verified,0);
  const intact = await readFile(reviewFile,'utf8');
  await writeFile(reviewFile,'{broken-test-file');
  check((await fetch(endpoint+'/api/reviews')).status,500);
  check((await put('fixture-b',empty)).status,500);
  check(await readFile(reviewFile,'utf8'),'{broken-test-file');
  await writeFile(reviewFile,intact);
  check((await put('fixture-b',empty)).status,200);
  console.log(`PASS: ${checks} persistence, restart, concurrency, export and validation checks. Real records untouched.`);
} finally {await stop();}
