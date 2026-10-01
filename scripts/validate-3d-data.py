"""Check geographic coverage, source provenance and separation of height/depth.
Read-only: does not change collected data or manual reviews.
"""
from pathlib import Path
from datetime import datetime
import hashlib, json, math

ROOT=Path(__file__).resolve().parents[1]
def load(name):return json.loads((ROOT/name).read_text(encoding='utf-8'))
data=load('data/metro-3d.json')
base=load('data/stations.json')
stations={s['id']:s for s in data['stations']}
lines={l['id']:l for l in data['lines']}
sources={s['id']:s for s in data['sources']}
assert len(stations)==len(data['stations'])==263
assert set(stations)=={s['id'] for s in base['stations']}
assert set(lines)=={l['id'] for l in base['lines']}
assert data['scope']['route_display']=='ground_projection_only'
assert data['stats']['rail_elevations_ready_for_geometry']==0
assert data['stats']['located_stations']==sum(s['coordinate'] is not None for s in stations.values())
assert data['stats']['human_verified']==0
assert data['collection_issues']['missing_station_coordinates']==[s['name'] for s in stations.values() if not s['coordinate']]

for s in stations.values():
    assert s['human_verified'] is False
    assert s['rail_elevation_m'] is None and s['rail_vertical_datum'] is None
    assert set(s['line_ids'])<=set(lines)
    c=s['coordinate']
    if c:
        assert c['crs']=='EPSG:4326' and c['human_verified'] is False
        assert 118<c['longitude']<120 and 31<c['latitude']<33
        assert c['source_id'] in sources and math.isfinite(s['ground_elevation_m'])
    else:
        assert s['ground_elevation_m'] is None and s['ground_quality']=='missing_coordinate'
    for observation in s['engineering_observations']:
        assert observation['human_verified'] is False and observation['source_id'] in sources
        assert observation['line_id'] in s['line_ids']
        if observation['kind']=='rail_design_elevation':
            assert observation['used_for_rail_geometry'] is False
            assert observation['vertical_datum']=='unspecified_in_source'
        else:
            assert observation['reference']=='local_ground' and observation['value_m']>0

terrain=data['terrain'];bounds=terrain['bounds'];heights=terrain['elevations_m']
assert len(heights)==terrain['columns']*terrain['rows']
assert all(math.isfinite(h) and -500<h<3000 for h in heights)
assert terrain['min_elevation_m']==min(heights) and terrain['max_elevation_m']==max(heights)
assert terrain['suspect_sample_indices']==[i for i,h in enumerate(heights) if h<0]
assert terrain['display_policy']['suspect_render_height_m']==0
assert data['stats']['suspect_terrain_samples']==len(terrain['suspect_sample_indices'])
assert data['stats']['suspect_way_vertices']==sum(len(w['suspect_ground_vertex_indices']) for w in data['ways'])
assert len({w['osm_way_id'] for w in data['ways']})==len(data['ways'])==data['stats']['ways']
for w in data['ways']:
    assert w['human_verified'] is False and w['rail_elevation_m'] is None
    assert w['source_id'] in sources and set(w['line_ids'])<=set(lines)
    assert len(w['geometry'])>=2
    for lon,lat,height in w['geometry']:
        assert bounds[0]<=lon<=bounds[2] and bounds[1]<=lat<=bounds[3]
        assert math.isfinite(height) and -500<height<3000
    assert w['suspect_ground_vertex_indices']==[i for i,p in enumerate(w['geometry']) if p[2]<0]
for line in lines.values():
    assert line['station_ids'] and set(line['station_ids'])<=set(stations)
    assert line['osm_relation_ids'] and any(line['id'] in w['line_ids'] for w in data['ways'])
    assert all(line['id'] in stations[id]['line_ids'] for id in line['station_ids'])

for src in sources.values():
    if src.get('collection_status')=='not_collected':
        assert src['collected_at'] is None
        continue
    datetime.fromisoformat(src['collected_at'])
    if 'cache_file' in src:
        assert hashlib.sha256((ROOT/src['cache_file']).read_bytes()).hexdigest()==src['sha256']
    for tile in src.get('tiles',[]):
        file=ROOT/f"data/sources/3d/terrain/{src['zoom']}-{tile['x']}-{tile['y']}.png"
        assert hashlib.sha256(file.read_bytes()).hexdigest()==tile['sha256']
        assert tile['last_modified'] and tile['imagery_sources']
        datetime.fromisoformat(tile['collected_at'])

mochou=next(s for s in stations.values() if s['name']=='莫愁湖')
reference=next(o for o in mochou['engineering_observations'] if o['kind']=='rail_design_elevation')
assert reference['value_m']==-24 and mochou['rail_elevation_m'] is None
print(f"PASS: {len(lines)} lines, {len(stations)} stations, {data['stats']['located_stations']} located, {len(data['ways'])} track ways.")
print('PASS: cached source hashes, null rail elevations, engineering references and suspect DEM values preserved.')
