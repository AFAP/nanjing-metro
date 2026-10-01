export function routeSegmentIndex(route,distance){
  const distances=route.cumulative_distance_m;
  const value=Math.max(0,Math.min(route.length_m,distance));
  let lo=0,hi=distances.length-1;
  while(lo+1<hi){const mid=(lo+hi)>>1;if(distances[mid]<=value)lo=mid;else hi=mid;}
  return lo;
}
export function sampleRoute(route,distance){
  const lo=routeSegmentIndex(route,distance),hi=lo+1,distances=route.cumulative_distance_m;
  const value=Math.max(0,Math.min(route.length_m,distance));
  const a=route.geometry[lo],b=route.geometry[hi],fraction=(value-distances[lo])/(distances[hi]-distances[lo]||1);
  return a.map((v,i)=>v+(b[i]-v)*fraction);
}
export function nearestStationIndex(route,distance){
  let best=0;
  route.stations.forEach((s,i)=>{if(Math.abs(s.distance_m-distance)<Math.abs(route.stations[best].distance_m-distance))best=i;});
  return best;
}
