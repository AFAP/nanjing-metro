import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {sampleRoute,routeSegmentIndex,nearestStationIndex} from '../src/cruise-path.js';

const test={length_m:8,geometry:[[0,0,-2],[3,4,10],[6,4,16]],cumulative_distance_m:[0,5,8],stations:[{distance_m:0},{distance_m:3},{distance_m:8}]};
const close=(actual,expected)=>actual.forEach((v,i)=>assert.ok(Math.abs(v-expected[i])<1e-10));
close(sampleRoute(test,-10),[0,0,-2]);close(sampleRoute(test,20),[6,4,16]);
close(sampleRoute(test,2.5),[1.5,2,4]);close(sampleRoute(test,6.5),[4.5,4,13]);
assert.equal(routeSegmentIndex(test,5),1);assert.equal(routeSegmentIndex(test,8),1);
assert.equal(nearestStationIndex(test,1.5),0);assert.equal(nearestStationIndex(test,5),1);assert.equal(nearestStationIndex(test,7),2);
const data=JSON.parse(await readFile(new URL('../data/cruise-routes.json',import.meta.url),'utf8'));
assert.equal(data.routes.length,15);
for(const r of data.routes){
  close(sampleRoute(r,0),r.geometry[0]);close(sampleRoute(r,r.length_m),r.geometry.at(-1));
  assert.equal(routeSegmentIndex(r,r.length_m),r.geometry.length-2);
  for(let i=0;i<=100;i++){
    const point=sampleRoute(r,r.length_m*i/100);assert.ok(point.every(Number.isFinite));
    const segment=routeSegmentIndex(r,r.length_m*i/100);assert.ok(r.segment_tags[segment].osm_way_ids.length);
  }
}
console.log('PASS: clamped endpoints, segment boundaries, ground interpolation, nearest stations and sampling all 15 routes.');
