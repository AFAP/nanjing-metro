"""Read-only checks of route provenance, continuity, station ordering and tags."""
from pathlib import Path
import hashlib, json, math

ROOT=Path(__file__).resolve().parents[1]
def read(name):return json.loads((ROOT/name).read_text(encoding='utf-8'))
data=read('data/cruise-routes.json');base=read('data/metro-3d.json')
assert hashlib.sha256((ROOT/data['source_file']).read_bytes()).hexdigest()==data['source_sha256'], 'Rebuild cruise data after changing metro-3d.json'
assert hashlib.sha256((ROOT/data['graph_source_cache_file']).read_bytes()).hexdigest()==data['graph_source_sha256']
lines={l['id']:l for l in base['lines']};stations={s['id']:s for s in base['stations']};ways={w['osm_way_id']:w for w in base['ways']}
assert {r['line_id'] for r in data['routes']}==set(lines)

def length(a,b):
    lon1,lat1,lon2,lat2=map(math.radians,[a[0],a[1],b[0],b[1]])
    h=math.sin((lat2-lat1)/2)**2+math.cos(lat1)*math.cos(lat2)*math.sin((lon2-lon1)/2)**2
    return 6371000*2*math.asin(min(1,math.sqrt(h)))
def on_segment(point,a,b):
    c=math.cos(math.radians(point[1]));dx=(b[0]-a[0])*c;dy=b[1]-a[1]
    t=max(0,min(1,((point[0]-a[0])*c*dx+(point[1]-a[1])*dy)/(dx*dx+dy*dy))) if dx or dy else 0
    projected=[a[i]+(b[i]-a[i])*t for i in range(3)]
    return length(point,projected)<.12 and abs(point[2]-projected[2])<.2

segments=0
for route in data['routes']:
    id=route['line_id'];geometry=route['geometry'];distance=route['cumulative_distance_m'];events=route['stations']
    assert route['human_verified'] is False and route['vertical_meaning']=='interpolated_ground_projection_only'
    assert len(geometry)==len(distance)>=2 and len(route['segment_tags'])==len(geometry)-1
    assert distance[0]==0 and distance[-1]==route['length_m'] and route['length_m']>1000
    assert all(a<=b for a,b in zip(distance,distance[1:]))
    assert all(len(p)==3 and all(math.isfinite(v) for v in p) for p in geometry)
    calculated=sum(length(a,b) for a,b in zip(geometry,geometry[1:]))
    assert abs(calculated-route['length_m'])<max(4,calculated*.0001)
    # These are end-to-end lines. A huge terminal detour between adjacent
    # parallel tracks must not masquerade as a much longer cruise route.
    assert route['length_m']<length(geometry[0],geometry[-1])*3.5
    assert all(a['distance_m']<=b['distance_m']+.03 for a,b in zip(events,events[1:]))
    assert set(s['station_id'] for s in events)|set(s['station_id'] for s in route['excluded_stations'])==set(lines[id]['station_ids'])
    for event in events:
        station=stations[event['station_id']]
        assert event['human_verified'] is False and event['snap_distance_m']<=500
        assert event['name']==station['name'] and event['ground_elevation_m']==station['ground_elevation_m']
        assert -.03<=event['distance_m']<=route['length_m']+.03 and id in station['line_ids']
    for a,b,tag in zip(geometry,geometry[1:],route['segment_tags']):
        assert tag['human_verified'] is False and tag['osm_way_ids']
        source=[ways[w] for w in tag['osm_way_ids']]
        assert all(id in w['line_ids'] for w in source)
        assert tag['structures']==sorted({w['structure'] for w in source})
        assert tag['relative_layers']==sorted({w['relative_layer'] for w in source if w['relative_layer'] is not None})
        assert any(on_segment(a,p,q) and on_segment(b,p,q) for w in source for p,q in zip(w['geometry'],w['geometry'][1:])), (id,a,b,'No matching original OSM segment')
        segments+=1
print(f'PASS: {len(data["routes"])} routes, {segments} source-backed segments, complete station accounting and ordered map distances.')
print('PASS: no invented connectors, parallel-track terminal detours or converted railway elevations.')
