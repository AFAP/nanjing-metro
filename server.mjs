import http from 'node:http';
import {readFile, writeFile, rename, copyFile, mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const project = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(project, 'src');
const dataRoot = process.env.METRO_DATA_DIR || path.join(project, 'data');
const port = Number(process.env.METRO_PORT || 4173);
const reviewFile = path.join(dataRoot, 'manual-reviews.json');
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.jpg':'image/jpeg','.svg':'image/svg+xml'};
let writeQueue = Promise.resolve();
const json = (res, status, value, headers = {}) => { res.writeHead(status, {'Content-Type':types['.json'],'Cache-Control':'no-store',...headers}); res.end(JSON.stringify(value)); };
const readData = async () => JSON.parse(await readFile(path.join(dataRoot, 'stations.json'), 'utf8'));
async function readReviews() {
  try {
    const data = JSON.parse(await readFile(reviewFile, 'utf8'));
    if (!data.reviews || typeof data.reviews !== 'object' || Array.isArray(data.reviews)) throw new Error('Invalid review file');
    return data;
  } catch (error) {
    if (error.code === 'ENOENT') return {schema_version:'1.0.0',reviews:{}};
    throw error;
  }
}
function validateReview(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.human_verified !== 'boolean') return false;
  if (Object.keys(value).some(key => !['human_verified','toilet_location','toilet_availability','notes'].includes(key))) return false;
  if (typeof value.toilet_location !== 'string' || value.toilet_location.length > 2000 || typeof value.notes !== 'string' || value.notes.length > 4000) return false;
  return [null,'available','unavailable','unknown'].includes(value.toilet_availability);
}
async function saveReview(id, input) {
  const data = await readData();
  if (!data.stations.some(s => s.id === id)) return null;
  const document = await readReviews();
  const previous = document.reviews[id];
  const now = new Date().toISOString();
  const saved = {...input,reviewer:input.human_verified ? 'local-user' : null,verified_at:input.human_verified ? (previous?.human_verified ? previous.verified_at : now) : null,updated_at:now};
  document.reviews[id] = saved;
  await mkdir(dataRoot, {recursive:true});
  try { await copyFile(reviewFile, reviewFile+'.bak'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const temporary = reviewFile+'.tmp';
  await writeFile(temporary, JSON.stringify(document,null,2)+'\n', 'utf8');
  await rename(temporary, reviewFile);
  return saved;
}
http.createServer(async (req,res) => {
  try {
    if (![ `localhost:${port}`, `127.0.0.1:${port}` ].includes(req.headers.host)) return json(res,403,{error:'Invalid host'});
    const url = new URL(req.url, `http://localhost:${port}`);
    const pathname = decodeURIComponent(url.pathname);
    if (pathname === '/api/reviews' && req.method === 'GET') return json(res,200,await readReviews());
    if (pathname.startsWith('/api/reviews/') && req.method === 'PUT') {
      if (req.headers.origin && ![`http://localhost:${port}`,`http://127.0.0.1:${port}`].includes(req.headers.origin)) return json(res,403,{error:'Invalid origin'});
      if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') return json(res,415,{error:'Expected JSON'});
      const chunks = []; let bytes = 0;
      for await (const chunk of req) { bytes += chunk.length; if (bytes > 24000) return json(res,413,{error:'Review too large'}); chunks.push(chunk); }
      let input; try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return json(res,400,{error:'Invalid JSON'}); }
      if (!validateReview(input)) return json(res,400,{error:'Invalid review fields'});
      const id = pathname.slice('/api/reviews/'.length);
      const operation = writeQueue.then(() => saveReview(id,input));
      writeQueue = operation.catch(() => {});
      const saved = await operation;
      return saved ? json(res,200,saved) : json(res,404,{error:'Unknown station'});
    }
    if (pathname === '/api/stations/export' && req.method === 'GET') {
      const data = await readData(); const {reviews} = await readReviews();
      for (const station of data.stations) {
        const review = reviews[station.id];
        if (review) { station.human_verified = review.human_verified; station.verification = review; }
        station.effective_toilet_availability = review?.toilet_availability || station.toilets.availability;
        station.effective_toilet_location = review?.toilet_location?.trim() || null;
      }
      data.stats.human_verified = data.stations.filter(s => s.human_verified).length;
      data.exported_at = new Date().toISOString();
      return json(res,200,data,{'Content-Disposition':`attachment; filename="nanjing-metro-stations.json"; filename*=UTF-8''${encodeURIComponent('南京地铁-站点资料.json')}`});
    }
    if (pathname.startsWith('/api/')) return json(res,404,{error:'Not found'});
    if (!['GET','HEAD'].includes(req.method)) return json(res,405,{error:'Method not allowed'});
    if (pathname.startsWith('/data/')) {
      const name = pathname.slice('/data/'.length);
      if (!['stations.json','metro-3d.json','cruise-routes.json'].includes(name)) return json(res,404,{error:'Not found'});
      const contents = await readFile(path.join(dataRoot,name));
      res.writeHead(200,{'Content-Type':types['.json'],'Cache-Control':'no-cache'});
      return res.end(req.method === 'HEAD' ? undefined : contents);
    }
    const filename = path.resolve(root,'.'+(pathname === '/' ? '/index.html' : pathname));
    if (!filename.startsWith(root+path.sep)) return json(res,403,{error:'Forbidden'});
    const contents = await readFile(filename);
    res.writeHead(200,{'Content-Type':types[path.extname(filename)] || 'application/octet-stream','Cache-Control':'no-cache'});
    res.end(req.method === 'HEAD' ? undefined : contents);
  } catch (error) {
    if (error.code === 'ENOENT') return json(res,404,{error:'Not found'});
    console.error('Request failed:', error.message);
    json(res,500,{error:'Could not read or save local data'});
  }
}).listen(port,'127.0.0.1',() => console.log(`Nanjing Metro: http://localhost:${port}`));
