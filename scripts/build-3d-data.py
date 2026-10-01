"""Build geographic geometry + sampled terrain. Never invent railway elevations.
Public OSM snapshots are cached separately; DEM tiles are downloaded once.
Requires Pillow, standard library. Sources and vertical references stay explicit.
"""
from pathlib import Path
from datetime import datetime, timezone
from urllib.request import Request, urlopen
from concurrent.futures import ThreadPoolExecutor, as_completed
from PIL import Image
import json, math, re, hashlib, time

ROOT=Path(__file__).resolve().parents[1]
CACHE=ROOT/'data/sources/3d'
NOW=datetime.now(timezone.utc).isoformat()
def read(path): return json.loads(path.read_text(encoding='utf-8'))
def save(path,value):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(value,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
def normalize(value): return re.sub(r'[\s·•・（）()]','',value).removesuffix('站')
def stamp(path): return datetime.fromtimestamp(path.stat().st_mtime,timezone.utc).isoformat()
def source_file(id,title,url,filename,kind,**extra):
    path=CACHE/filename
    if not path.exists(): return {'id':id,'title':title,'url':url,'kind':kind,'collected_at':None,'collection_status':'not_collected',**extra}
    return {'id':id,'title':title,'url':url,'kind':kind,'collected_at':stamp(path),'cache_file':str(path.relative_to(ROOT)).replace('\\','/'),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),**extra}

base=read(ROOT/'data/stations.json')
osm=read(CACHE/'osm-metro.json')
details=read(CACHE/'osm-track-details.json')
all_elements={ (e['type'],e['id']):e for e in osm['elements']+details['elements'] }
line_ids={line['id'] for line in base['lines']}
relations=[e for e in osm['elements'] if e['type']=='relation' and e.get('tags',{}).get('type')=='route' and e['tags'].get('ref') in line_ids]
lookup={}
for e in all_elements.values():
    tags=e.get('tags',{})
    if e['type']=='relation' or tags.get('railway')!='station': continue
    for key in ['name','name:zh','alt_name','short_name']:
        for name in tags.get(key,'').split(';'):
            if name: lookup.setdefault(normalize(name),{})[(e['type'],e['id'])]=e
lookup['草场门']=lookup['草场门南艺二师']
lookup['徐庄']=lookup['徐庄苏宁总部']

def center(e):
    if 'lon' in e:return [e['lon'],e['lat']]
    geom=e.get('geometry',[])
    if geom:return [sum(g['lon'] for g in geom)/len(geom),sum(g['lat'] for g in geom)/len(geom)]
    return None

stations=[]
for s in base['stations']:
    candidates={}
    for name in [s['name'],*s['aliases']]:candidates.update(lookup.get(normalize(name),{}))
    nodes=[e for e in candidates.values() if e['type']=='node']
    selected=nodes or [e for e in candidates.values() if center(e)]
    coords=[center(e) for e in selected]
    point=[round(sum(c[i] for c in coords)/len(coords),7) for i in range(2)] if coords else None
    stations.append({'id':s['id'],'name':s['name'],'line_ids':s['line_ids'],'coordinate':{'longitude':point[0],'latitude':point[1],'crs':'EPSG:4326','method':'osm_station_nodes_mean' if nodes else 'osm_station_geometry_centroid','source_id':'osm-metro','osm_entities':[{'type':e['type'],'id':e['id'],'name':e.get('tags',{}).get('name')} for e in selected],'human_verified':False} if point else None,'ground_elevation_m':None,'ground_vertical_datum':'EGM96_geoid','ground_source_id':'mapzen-terrain','rail_elevation_m':None,'rail_vertical_datum':None,'rail_elevation_status':'missing','engineering_observations':[],'human_verified':False})

# One station is absent from the public OSM station snapshot. Use its official
# address and the shared OSM road junction, explicitly as an approximate location.
roads=read(CACHE/'hongshan-roads.json') if (CACHE/'hongshan-roads.json').exists() else {'elements':[]}
groups={name:{} for name in ['恒嘉路','大壮观路']}
road_ids=[]
for road in roads['elements']:
    name=road.get('tags',{}).get('name')
    if name in groups:
        groups[name].update({node:[p['lon'],p['lat']] for node,p in zip(road['nodes'],road['geometry'])})
        road_ids.append(road['id'])
shared=set(groups['恒嘉路']) & set(groups['大壮观路'])
hongshan=next(s for s in stations if s['name']=='红山新城')
if shared:
    points=[groups['恒嘉路'][node] for node in shared]
    hongshan['coordinate']={'longitude':round(sum(p[0] for p in points)/len(points),7),'latitude':round(sum(p[1] for p in points)/len(points),7),'crs':'EPSG:4326','method':'official_address_osm_junction_approx','source_id':'hongshan-junction','osm_entities':[{'type':'way','id':i} for i in road_ids],'notes':'官网地址为恒嘉路与大壮观路路口；按道路公共节点近似定位，未核对站体中心。','human_verified':False}

used={}
for relation in relations:
    for member in relation['members']:
        if member['type']=='way' and 'platform' not in member['role']:
            way=all_elements.get(('way',member['ref']))
            if way and way.get('geometry'):
                entry=used.setdefault(way['id'],{'way':way,'line_ids':set()})
                entry['line_ids'].add(relation['tags']['ref'])
points=[center(e['way']) for e in used.values()]+[[s['coordinate']['longitude'],s['coordinate']['latitude']] for s in stations if s['coordinate']]
all_coords=[ [p['lon'],p['lat']] for e in used.values() for p in e['way']['geometry'] ]+points
bounds=[round(min(p[0] for p in all_coords)-.045,6),round(min(p[1] for p in all_coords)-.035,6),round(max(p[0] for p in all_coords)+.045,6),round(max(p[1] for p in all_coords)+.035,6)]
ZOOM=11
def pixels(lon,lat):
    n=256*2**ZOOM
    return (lon+180)/360*n,(1-math.asinh(math.tan(math.radians(lat)))/math.pi)/2*n
x0,y1=pixels(bounds[0],bounds[1]);x1,y0=pixels(bounds[2],bounds[3])
tile_keys=[(x,y) for x in range(int(x0//256),int((x1+2)//256)+1) for y in range(int(y0//256),int((y1+2)//256)+1)]
def tile(key):
    x,y=key;path=CACHE/'terrain'/f'{ZOOM}-{x}-{y}.png'
    url=f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{ZOOM}/{x}/{y}.png'
    metadata=path.with_suffix('.json')
    if not path.exists():
        path.parent.mkdir(parents=True,exist_ok=True)
        for attempt in range(3):
            try:
                with urlopen(Request(url,headers={'User-Agent':'NanjingMetroAtlas/1.0 public terrain research'}),timeout=30) as response:
                    raw=response.read();headers=dict(response.headers)
                path.write_bytes(raw)
                save(metadata,{'url':url,'collected_at':NOW,'last_modified':headers.get('Last-Modified'),'imagery_sources':headers.get('x-amz-meta-x-imagery-sources') or headers.get('X-Amz-Meta-X-Imagery-Sources'),'sha256':hashlib.sha256(raw).hexdigest()})
                break
            except Exception:
                if attempt==2:raise
                time.sleep(1+attempt)
    im=Image.open(path).convert('RGB')
    return key,im,list(im.getdata()),read(metadata) if metadata.exists() else {'url':url,'collected_at':stamp(path)}
tiles={};tile_sources=[]
print('Geographic stations:',sum(s['coordinate'] is not None for s in stations),'bounds:',bounds,'terrain tiles:',len(tile_keys),flush=True)
with ThreadPoolExecutor(max_workers=4) as pool:
    futures=[pool.submit(tile,key) for key in tile_keys]
    for i,future in enumerate(as_completed(futures),1):
        key,im,raw,meta=future.result();tiles[key]=raw;tile_sources.append({'x':key[0],'y':key[1],**meta})
        if i%12==0:print('Terrain tiles',i,'/',len(tile_keys),flush=True)
def elevation(lon,lat):
    px,py=pixels(lon,lat);ix,iy=math.floor(px),math.floor(py);fx,fy=px-ix,py-iy
    def value(x,y):
        rgb=tiles[(x//256,y//256)][(y%256)*256+x%256]
        return rgb[0]*256+rgb[1]+rgb[2]/256-32768
    # Do not substitute nodata with zero; missing terrain should stop the build.
    values=[value(ix,iy),value(ix+1,iy),value(ix,iy+1),value(ix+1,iy+1)]
    assert all(-500<v<3000 for v in values), (lon,lat,values)
    return round((values[0]*(1-fx)+values[1]*fx)*(1-fy)+(values[2]*(1-fx)+values[3]*fx)*fy,1)

for station in stations:
    if station['coordinate']:
        c=station['coordinate'];station['ground_elevation_m']=elevation(c['longitude'],c['latitude'])
    station['ground_quality']='missing_coordinate' if station['coordinate'] is None else 'suspect_negative_dem' if station['ground_elevation_m']<0 else 'sampled_unverified'
ways=[]
for entry in used.values():
    way=entry['way'];tags=way.get('tags',{})
    geometry=[[p['lon'],p['lat'],elevation(p['lon'],p['lat'])] for p in way['geometry']]
    ways.append({'osm_way_id':way['id'],'line_ids':sorted(entry['line_ids']),'structure':'tunnel' if tags.get('tunnel') not in (None,'no') else 'bridge' if tags.get('bridge') not in (None,'no') else 'surface_or_unknown','relative_layer':int(tags['layer']) if re.fullmatch(r'-?\d+',tags.get('layer','')) else None,'geometry':geometry,'suspect_ground_vertex_indices':[i for i,p in enumerate(geometry) if p[2]<0],'rail_elevation_m':None,'source_id':'osm-track-details','human_verified':False})

byname={s['name']:s for s in stations}
byname['莫愁湖']['rail_elevation_status']='reference_only'
byname['莫愁湖']['engineering_observations']=[
    {'line_id':'7','kind':'rail_design_elevation','value_m':-24.0,'vertical_datum':'unspecified_in_source','source_id':'mochou-patent','source_locator':'说明书 [0017]，PDF 第 4 页','description':'7 号线有效站台中心轨面设计标高 -24.000 米。原文未注明高程基准，尚不能与 EGM96 地表海拔直接合并。','used_for_rail_geometry':False,'human_verified':False},
    {'line_id':'7','kind':'structure_base_depth','value_m':33.56,'reference':'local_ground','source_id':'mochou-patent','source_locator':'说明书 [0017]，PDF 第 4 页','description':'标准段底板埋深 33.56 米；端头井底板底埋深 35.26 米。不是轨面埋深。','human_verified':False}]
byname['清凉山']['engineering_observations']=[{'line_id':'7','kind':'station_structure_max_depth','value_m':52.0,'reference':'local_ground','source_id':'qingliang-government','source_locator':'正文关于清凉山站段落','description':'政府报道车站地下共 7 层，最深处约 52 米；未说明对应轨面，保留为车站结构最大深度。','human_verified':False}]

nx,ny=321,481
heights=[elevation(bounds[0]+(bounds[2]-bounds[0])*x/(nx-1),bounds[3]-(bounds[3]-bounds[1])*y/(ny-1)) for y in range(ny) for x in range(nx)]
sources=[source_file('osm-metro','OpenStreetMap · 南京地铁站与路线快照','https://www.openstreetmap.org/copyright','osm-metro.json','geographic',osm_timestamp=osm['osm3s']['timestamp_osm_base'],license='ODbL-1.0'),source_file('osm-track-details','OpenStreetMap · 轨道走向、隧道及高架标签','https://wiki.openstreetmap.org/wiki/Overpass_API','osm-track-details.json','geographic',osm_timestamp=details['osm3s']['timestamp_osm_base'],license='ODbL-1.0'),source_file('hongshan-junction','红山新城 · 官网地址与 OSM 道路路口近似定位','https://www.njmetro.com.cn/njdtweb/portal/main-article-detail.do?rowId=4028dbe49fe97dec01a0ae34e7300064','hongshan-roads.json','approximate_geocoding',official_source_id='intro-4028dbe49fe97dec01a0ae34e7300064'),{'id':'mapzen-terrain','title':'Mapzen Terrain Tiles · Terrarium 栅格高程','url':'https://registry.opendata.aws/terrain-tiles/','collected_at':NOW,'kind':'dem','zoom':ZOOM,'vertical_datum':'EGM96_geoid','nominal_pixel_spacing_m':64.8,'underlying_sources':'Tile metadata lists SRTM / GMTED; source resolution varies.','notes':'地表栅格采样估值，受原始精度、植被、建筑物、地形变化与栅格插值影响；不是当前实测站外地坪标高。','tiles':sorted(tile_sources,key=lambda t:(t['x'],t['y']))},source_file('mochou-patent','公开专利 CN112376620A · 莫愁湖站工程实例','https://patents.google.com/patent/CN112376620A/zh','mochou-patent.pdf','patent',published_at='2021-02-19'),source_file('qingliang-government','南京市政府 · 清凉山站结构深度报道','https://www.nanjing.gov.cn/zgnjsjb/jrtt/202409/t20240911_4761800.html','qingliang-government.html','government',published_at='2024-09-11')]
result={'schema_version':'1.0.0','generated_at':NOW,'scope':{'description':'沿用官网目录 15 条线路、263 站；OpenStreetMap 公共坐标与线路几何。未包含 S4 滁州段。','coordinate_crs':'EPSG:4326','vertical_datum':'EGM96_geoid for sampled ground only','route_display':'ground_projection_only','route_elevation_note':'线路附带的第三坐标为地表栅格高程，绝不是隧道、桥面或轨面的绝对标高。','relative_layer_note':'OSM layer 为相对上下层级，不是以米计的深度，不用于推算轨道高程。'},'stats':{'stations':len(stations),'located_stations':sum(s['coordinate'] is not None for s in stations),'approximate_junction_stations':sum(bool(s['coordinate']) and s['coordinate']['method']=='official_address_osm_junction_approx' for s in stations),'lines':len(line_ids),'ways':len(ways),'rail_elevations_ready_for_geometry':0,'stations_with_engineering_references':sum(bool(s['engineering_observations']) for s in stations),'human_verified':0},'terrain':{'bounds':bounds,'columns':nx,'rows':ny,'ordering':'row-major, west-to-east, north-to-south','elevations_m':heights,'source_id':'mapzen-terrain','min_elevation_m':min(heights),'max_elevation_m':max(heights)},'stations':stations,'lines':[{'id':line['id'],'name':line['name'],'station_ids':line['station_ids'],'osm_relation_ids':[r['id'] for r in relations if r['tags']['ref']==line['id']]} for line in base['lines']],'ways':ways,'sources':sources,'collection_issues':{'missing_station_coordinates':[s['name'] for s in stations if s['coordinate'] is None],'osm_stations_outside_official_roster':sorted({normalize(e.get('tags',{}).get('name','')) for e in details['elements'] if e['type']=='node' and e.get('tags',{}).get('name') and e.get('tags',{}).get('public_transport')=='stop_position'}-{normalize(s['name']) for s in base['stations']})}}
# Keep historic tile collection times when rebuilding from the local cache.
next(s for s in sources if s['id']=='mapzen-terrain')['collected_at']=max(t['collected_at'] for t in tile_sources)
suspect_indices=[i for i,h in enumerate(heights) if h<0]
result['terrain']['suspect_sample_indices']=suspect_indices
result['terrain']['mesh_spacing_m_approx']=[round((bounds[2]-bounds[0])*111195*math.cos(math.radians((bounds[1]+bounds[3])/2))/(nx-1)),round((bounds[3]-bounds[1])*111195/(ny-1))]
result['terrain']['display_policy']={'suspect_threshold_m':0,'suspect_render_height_m':0,'suspect_color':'#9da8a1','notes':'南京范围内负高程采样暂列为疑似异常；保留原值。画面将其暂置于 0 米并标灰，0 米只是显示占位，不是核实后的海拔，也不代表真实河底深度。'}
result['stats']['suspect_terrain_samples']=len(suspect_indices)
result['stats']['suspect_way_vertices']=sum(len(w['suspect_ground_vertex_indices']) for w in ways)
result['collection_issues']['osm_stations_outside_official_roster']=[name for name in result['collection_issues']['osm_stations_outside_official_roster'] if name not in {'草场门南艺二师','徐庄苏宁总部'}]
result['collection_issues']['suspect_dem_note']=result['terrain']['display_policy']['notes']
save(ROOT/'data/metro-3d.json',result)
print('Saved:',json.dumps(result['stats'],ensure_ascii=False),flush=True)
print('Ground range:',min(heights),max(heights),'m',flush=True)
