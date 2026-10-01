"""Derive an ordered geographic cruise path from the cached OSM track graph.
No straight lines are invented between disconnected track components.
Distances are horizontal map distances; third coordinates are ground estimates.
"""
from pathlib import Path
from datetime import datetime, timezone
from collections import defaultdict
import heapq, hashlib, json, math

ROOT=Path(__file__).resolve().parents[1]
source_path=ROOT/'data/metro-3d.json'
data=json.loads(source_path.read_text(encoding='utf-8'))
stations={s['id']:s for s in data['stations']}
graph_source=ROOT/'data/sources/3d/osm-track-details.json'
raw_ways={e['id']:e for e in json.loads(graph_source.read_text(encoding='utf-8'))['elements'] if e['type']=='way'}
way_by_id={w['osm_way_id']:w for w in data['ways']}

def distance(a,b):
    lat=(a[1]+b[1])*.5*math.pi/180
    return math.hypot((a[0]-b[0])*111195*math.cos(lat),(a[1]-b[1])*111195)

def projection(point,a,b):
    cosine=math.cos(math.radians(point[1]))
    dx=(b[0]-a[0])*cosine;dy=b[1]-a[1]
    t=max(0,min(1,((point[0]-a[0])*cosine*dx+(point[1]-a[1])*dy)/(dx*dx+dy*dy))) if dx or dy else 0
    q=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t]
    return distance(point,q),t,q

def shortest(graph,start,end):
    queue=[(0,start)];cost={start:0};previous={}
    while queue:
        total,node=heapq.heappop(queue)
        if total!=cost[node]:continue
        if node==end:
            result=[end]
            while result[-1]!=start:result.append(previous[result[-1]])
            return list(reversed(result))
        for other,weight in graph[node].items():
            candidate=total+weight
            if candidate<cost.get(other,float('inf')):
                cost[other]=candidate;previous[other]=node;heapq.heappush(queue,(candidate,other))
    raise ValueError('Disconnected track graph')

routes=[]
for line in data['lines']:
    points=[];indices={};edges=set();edge_sources=defaultdict(set);original_graph=defaultdict(dict)
    def node(p,key):
        if key not in indices:indices[key]=len(points);points.append(list(p))
        return indices[key]
    def add(graph,a,b):
        if a!=b:graph[a][b]=graph[b][a]=distance(points[a],points[b])
    for way in data['ways']:
        if line['id'] not in way['line_ids']:continue
        raw=raw_ways[way['osm_way_id']];assert len(raw['nodes'])==len(way['geometry'])
        ids=[node(p,id) for p,id in zip(way['geometry'],raw['nodes'])]
        for a,b in zip(ids,ids[1:]):
            if a!=b:
                edge=tuple(sorted((a,b)));edges.add(edge);edge_sources[edge].add(way['osm_way_id']);add(original_graph,a,b)
    components=[];visited=set()
    for origin in original_graph:
        if origin in visited:continue
        component={origin};todo=[origin];visited.add(origin)
        while todo:
            for other in original_graph[todo.pop()]:
                if other not in visited:visited.add(other);component.add(other);todo.append(other)
        components.append(component)
    located=[s for id in line['station_ids'] if (s:=stations[id])['coordinate']]
    def station_point(s):return [s['coordinate']['longitude'],s['coordinate']['latitude']]
    def score(component):
        coverage=sum(min(distance(station_point(s),points[n]) for n in component)<500 for s in located)
        return coverage,len(component)
    component=max(components,key=score)
    chosen_edges=[e for e in edges if e[0] in component]
    splits=defaultdict(list);snaps={};excluded=[]
    for id in line['station_ids']:
        station=stations[id]
        if not station['coordinate']:
            excluded.append({'station_id':id,'name':station['name'],'reason':'missing_coordinate'});continue
        point=station_point(station)
        gap,ratio,projected,a,b=min((*projection(point,points[a],points[b]),a,b) for a,b in chosen_edges)
        if gap>500:
            excluded.append({'station_id':id,'name':station['name'],'reason':'far_from_selected_track_component','distance_m':round(gap,1)});continue
        if ratio<1e-8:anchor=a
        elif ratio>1-1e-8:anchor=b
        else:
            anchor=len(points);points.append(projected);splits[(a,b)].append((ratio,anchor))
        snaps[id]={'node':anchor,'snap_distance_m':round(gap,1),'station_id':id,'name':station['name'],'ground_elevation_m':station['ground_elevation_m'],'human_verified':False}
    graph=defaultdict(dict);graph_sources={}
    for a,b in chosen_edges:
        chain=[a,*[n for ratio,n in sorted(splits[(a,b)])],b]
        for start,end in zip(chain,chain[1:]):
            add(graph,start,end);graph_sources[tuple(sorted((start,end)))]=edge_sources[(a,b)]
    ordered=[snaps[id] for id in line['station_ids'] if id in snaps]
    # Pick one connected end-to-end track spine. Snapping each intermediate
    # station independently to both parallel tracks can cause huge terminal
    # detours when those tracks only connect at the ends.
    path=shortest(graph,ordered[0]['node'],ordered[-1]['node'])
    geometry=[];cumulative=[];length=0
    for i,id in enumerate(path):
        if i:length+=distance(points[path[i-1]],points[id])
        geometry.append([round(points[id][0],7),round(points[id][1],7),round(points[id][2],1)])
        cumulative.append(round(length,2))
    events=[]
    for snap in ordered:
        point=station_point(stations[snap['station_id']])
        gap,ratio,projected,index=min((*projection(point,a,b),i) for i,(a,b) in enumerate(zip(geometry,geometry[1:])))
        if gap>500:
            excluded.append({'station_id':snap['station_id'],'name':snap['name'],'reason':'far_from_end_to_end_track_spine','distance_m':round(gap,1)});continue
        events.append({key:value for key,value in snap.items() if key not in {'node','snap_distance_m'}}|{'distance_m':round(cumulative[index]+distance(geometry[index],projected),2),'snap_distance_m':round(gap,1)})
    assert all(a['distance_m']<=b['distance_m']+2 for a,b in zip(events,events[1:])), (line['id'],'Station order conflicts with geographic path')
    segment_tags=[]
    for a,b in zip(path,path[1:]):
        ids=sorted(graph_sources[tuple(sorted((a,b)))]);ways=[way_by_id[id] for id in ids]
        segment_tags.append({'osm_way_ids':ids,'structures':sorted({w['structure'] for w in ways}),'relative_layers':sorted({w['relative_layer'] for w in ways if w['relative_layer'] is not None}),'human_verified':False})
    route={'line_id':line['id'],'length_m':round(length,2),'geometry':geometry,'cumulative_distance_m':cumulative,'segment_tags':segment_tags,'stations':events,'excluded_stations':excluded,'component_count':len(components),'method':'shortest_connected_osm_node_graph_spine_with_station_projections','coordinate_crs':'EPSG:4326','vertical_meaning':'interpolated_ground_projection_only','human_verified':False}
    routes.append(route)
    print(line['id'],len(geometry),'vertices;',len(events),'/',len(line['station_ids']),'stations;',round(length/1000,2),'km; max snap',max(e['snap_distance_m'] for e in events),'m; excluded',[(s['name'],s['reason']) for s in excluded],flush=True)

result={'schema_version':'1.0.0','generated_at':datetime.now(timezone.utc).isoformat(),'source_file':'data/metro-3d.json','source_sha256':hashlib.sha256(source_path.read_bytes()).hexdigest(),'graph_source_cache_file':'data/sources/3d/osm-track-details.json','graph_source_sha256':hashlib.sha256(graph_source.read_bytes()).hexdigest(),'scope':{'description':'地理线路漫游路径；不是列车运行轨迹或时刻表。','distance_note':'沿公共轨道几何的水平图上距离，不包括纵坡，不代表官方营业里程。','height_note':'第三坐标为沿段插值的地表估值，不是隧道、桥面或轨面高程。','incomplete_path_note':'无法定位或离所选连通轨道超过 500 米的车站列入 excluded_stations；不虚构连接断裂的轨道。'},'routes':routes}
raw=json.dumps(result,ensure_ascii=False,separators=(',',':'))+'\n'
for destination in ['data/cruise-routes.json']:(ROOT/destination).write_text(raw,encoding='utf-8')
