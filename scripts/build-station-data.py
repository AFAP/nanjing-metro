"""Build the auditable station dataset. Human reviews live separately and survive rebuilds."""
from pathlib import Path
from datetime import datetime, timezone
import json, re, hashlib
ROOT = Path(__file__).resolve().parents[1]
NOW = datetime.now(timezone.utc).isoformat()
def read(name): return json.loads((ROOT/'data'/name).read_text(encoding='utf-8'))
def modified(name): return datetime.fromtimestamp((ROOT/'data'/name).stat().st_mtime,timezone.utc).isoformat()
def canon(name):
    name = re.sub(r'[\s·•・]', '', name)
    if name.endswith('站') and name not in ('南京站','南京南站','南京西站'): name = name[:-1]
    return name
def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

roster, articles, map_data, supplements = read('official-roster.json'), read('official-articles.json')['articles'], read('map-toilets.json'), read('toilet-supplements.json')
sources = {s['id']:s for s in supplements['sources']}
sources[map_data['source']['id']] = {**map_data['source'], 'collected_at':map_data['source'].get('collected_at') or modified('sources/nanjinger-dec2024.pdf')}
for source in sources.values():
    cached = ROOT/source.get('cache_file','_missing')
    if cached.is_file():
        source.setdefault('collected_at',datetime.fromtimestamp(cached.stat().st_mtime,timezone.utc).isoformat())
        source.setdefault('sha256',hashlib.sha256(cached.read_bytes()).hexdigest())
    else: source.setdefault('collected_at',modified('toilet-supplements.json'))
stations, line_list = {}, []
for line in roster:
    sources[line['source']['id']] = line['source']
    station_ids = []
    for raw in sorted(line['stations'],key=lambda s:s['stationOrder']):
        name = canon(raw['stationName'])
        if name not in stations:
            stations[name] = {'id':'njm-'+hashlib.sha1(name.encode()).hexdigest()[:12], 'name':name, 'aliases':[], 'line_ids':[], 'official_station_ids':[], 'introduction':[], 'nearby':[], 'toilets':{'availability':'unknown','by_line':[], 'locations':[], 'nearby_alternatives':[], 'notes':[]}, 'human_verified':False, 'verification':{'verified_at':None,'reviewer':None,'notes':'','toilet_location':'','toilet_availability':None}, 'source_ids':[], 'collected_at':NOW}
        s = stations[name]
        s['aliases'] = list(dict.fromkeys(s['aliases']+[raw['stationName'],name if name.endswith('站') else name+'站']))
        s['line_ids'].append(line['id'])
        s['official_station_ids'].append({'line_id':line['id'],'station_id':raw['rowId'],'order':raw['stationOrder']})
        s['source_ids'].append(line['source']['id'])
        station_ids.append(s['id'])
    line_list.append({'id':line['id'],'name':line['name'],'station_ids':station_ids, 'source_id':line['source']['id'], 'scope':'official_public_directory'})
unmatched = []
for article in articles:
    name = canon(article['title'])
    name = {'苏宁总部徐庄':'徐庄','徐庄站苏宁总部':'徐庄','临江青奥体育公园':'临江','方洲广场':'方州广场','莫愁路':'莫愁湖'}.get(name,name)
    if name not in stations:
        unmatched.append(article['title']); continue
    s, source = stations[name], article['source']
    sources[source['id']] = source
    s['source_ids'].append(source['id'])
    s['aliases'] = list(dict.fromkeys(s['aliases']+[article['title']]))
    if source['kind']=='intro':
        # Preserve a concise location/layout fact; complete original remains in the cache.
        text = ' '.join(article['paragraphs'])
        sentences = [x+'。' for x in re.split('。',text) if x.strip()]
        location = next((x for x in sentences if '位于' in x),None)
        layout = next((x for x in sentences if '岛式' in x or '侧式' in x or '站台层' in x),None)
        summary = ' '.join(dict.fromkeys(x for x in [location,layout] if x)) or (sentences[0] if sentences else '')
        s['introduction'].append({'text':summary[:450], 'source_id':source['id']})
    else:
        categories = []
        for paragraph in article['paragraphs']:
            match = re.match(r'[（(]\d+[）)]\s*([^：:]+)[：:](.*)',paragraph)
            if match:
                categories.append({'category':match[1].strip(),'description':match[2].strip(), 'source_id':source['id']})
            elif categories:
                categories[-1]['description'] += ' '+paragraph
        s['nearby'].extend(c for c in categories if c['description'].strip() not in ('','无','暂无','无。'))

line_one = [stations[next(n for n,s in stations.items() if s['id']==sid)]['name'] for l in line_list if l['id']=='1' for sid in l['station_ids']]
one_wc = set(line_one[:5]+['鼓楼','新街口','三山街'])
one_wc.update(line_one[line_one.index('天隆寺'):line_one.index('小龙湾')+1])
one_wc.update(line_one[line_one.index('天印大道'):])
for s in stations.values():
    for line in s['line_ids']:
        available = (s['name'] in one_wc) if line=='1' else not (line=='10' and s['name']=='小行')
        s['toilets']['by_line'].append({'line_id':line,'availability':'available' if available else 'unavailable','source_id':'official-toilets','method':'official_summary_rule','human_verified':False})
    s['toilets']['availability'] = 'available' if any(x['availability']=='available' for x in s['toilets']['by_line']) else 'unavailable'
    s['source_ids'].append('official-toilets')
    if any(x['availability']=='unavailable' for x in s['toilets']['by_line']) and s['toilets']['availability']=='available':
        s['toilets']['notes'].append('部分线路站层未设厕所；请查看本站其他线路的位置，不能按未设厕所的线路直接寻找。')

for entry in map_data['entries']:
    s = stations.get(canon(entry['station_name']))
    if not s or s['toilets']['availability']!='available': continue
    for at_platform in dict.fromkeys(x['at_platform'] for x in entry['symbols']):
        label_note = ('图上站名为“'+entry['source_label']+'”，按同线路站序与官网名称对应；原图存在错字。') if canon(entry['source_label'])!=s['name'] else ''
        s['toilets']['locations'].append({'line_ids':s['line_ids'] if len(s['line_ids'])==1 else [],'level':'platform' if at_platform else 'non_platform','floor':None,'paid_area':'unknown','description':'站台层。' if at_platform else '非站台层，具体楼层与入口待补充。','precision':'level' if at_platform else 'non_platform_only','source_id':'nanjinger-2024-12','human_verified':False,'notes':'2024 年 12 月地图标注；换乘站的图标未逐线路区分，不能套用到每条线路。'+label_note,'map_evidence':{'page':1,'label_bbox':entry['label_bbox'],'source_label':entry['source_label'],'symbol_bboxes':[x['bbox'] for x in entry['symbols'] if x['at_platform']==at_platform]}})
    s['source_ids'].append('nanjinger-2024-12')

# The 2018 report explicitly distinguishes concourse/platform for these sections.
for line_id, boundary in [('S3','刘村'),('S9',None)]:
    line = next(l for l in line_list if l['id']==line_id)
    passed = line_id=='S9'
    for sid in line['station_ids']:
        s = next(s for s in stations.values() if s['id']==sid)
        if s['name']==boundary: passed=True
        platform = not passed
        s['toilets']['locations'].append({'line_ids':[line_id],'level':'platform' if platform else 'concourse','floor':None,'paid_area':'unknown','description':('站台层。' if platform else '站厅层。'),'precision':'level','source_id':'jschina-2018','human_verified':False,'notes':'2018 年报道，具体方位和现状待核对。'})
        s['source_ids'].append('jschina-2018')

for loc in supplements['locations']:
    s = stations[canon(loc['station'])]
    s['toilets']['locations'].insert(0,{k:v for k,v in loc.items() if k!='station'} | {'human_verified':False})
    s['source_ids'].append(loc['source_id'])
if '小市' in stations:
    s=stations['小市']; source_id=next(x['source_id'] for x in s['nearby'] if '公共厕所' in x['description'])
    s['toilets']['locations'].append({'line_ids':[], 'level':'outside','floor':None,'paid_area':'outside','description':'站外公共厕所：1 号出口附近，官方出站指南标注约 30 米。','precision':'exit','source_id':source_id,'human_verified':False,'notes':'这是站外补充选项，与站内厕所分别记录。'})
stations['奥体东']['toilets']['notes'].append('2020 年攻略曾标为无厕所；当前官网卫生间提示将 2 号线全线列为有厕所。以当前官方总表为准，具体位置优先人工核对。')
for s in stations.values():
    s['source_ids']=list(dict.fromkeys(s['source_ids']))
    s['collected_at']=max(sources[source_id]['collected_at'] for source_id in s['source_ids'])
    s['toilets']['location_status']='collected' if s['toilets']['locations'] else 'not_applicable' if s['toilets']['availability']=='unavailable' else 'missing'
    if s['toilets']['availability']=='unavailable':
        for lid in s['line_ids']:
            ids=next(l['station_ids'] for l in line_list if l['id']==lid); at=ids.index(s['id'])
            for delta in (-1,1):
                for step in range(1,len(ids)):
                    index=at+delta*step
                    if not 0<=index<len(ids): break
                    other=next(t for t in stations.values() if t['id']==ids[index])
                    if other['toilets']['availability']=='available':
                        same_line = next(x['availability'] for x in other['toilets']['by_line'] if x['line_id']==lid)
                        s['toilets']['nearby_alternatives'].append({'station_id':other['id'],'station_name':other['name'],'line_id':lid,'stops':step,'note':'该线路站层未设厕所，需前往本站其他线路站层。' if same_line=='unavailable' else ''})
                        break
result={'schema_version':'1.0.0','collected_at':NOW,'scope':{'description':'南京地铁官网票务车站目录所列 15 条线路；换乘站合并为一条记录。不包含该目录未列出的 S4 滁州段。目录收录不单独证明线路当前运营状态。','roster_source':'https://www.njmetro.com.cn/njdtweb/portal/get-lineList.do?parentId=root&tag=0jl','route_map_snapshot':'2026-04'},'stats':{'stations':len(stations),'lines':len(line_list),'toilets_available':sum(s['toilets']['availability']=='available' for s in stations.values()),'toilets_unavailable':sum(s['toilets']['availability']=='unavailable' for s in stations.values()),'location_collected':sum(s['toilets']['location_status']=='collected' for s in stations.values()),'location_missing':sum(s['toilets']['location_status']=='missing' for s in stations.values()),'precise_location_stations':sum(any(l['precision'] in ('direction','floor','exit') for l in s['toilets']['locations']) for s in stations.values()),'human_verified':0,'official_articles':len(articles)},'lines':line_list,'stations':list(stations.values()),'sources':list(sources.values()),'collection_issues':{'unmatched_article_titles':unmatched,'failed_articles':read('official-articles.json')['errors']}}
result['generated_at']=NOW
result['collected_at']=max(source['collected_at'] for source in sources.values())
save(ROOT/'data/stations.json',result)
if not (ROOT/'data/manual-reviews.json').exists(): save(ROOT/'data/manual-reviews.json',{'schema_version':'1.0.0','reviews':{}})
report=['# 站点资料采集报告','',f"采集日期：{result['collected_at'][:10]}；构建日期：{NOW[:10]}。",'',
        '官网目录 15 条线路、263 个独立车站；已保存 526 份官方车站简介与出站指南。全部机器记录标记为未人工核对。','',
        '| 覆盖项 | 站数 |','| --- | --- |',
        *[f'| {label} | {result["stats"][key]} |' for label,key in [('有厕所','toilets_available'),('未设厕所','toilets_unavailable'),('已收集位置提示','location_collected'),('有具体楼层、方向或出口提示（仍未人工核对）','precise_location_stations'),('有厕所，位置待补','location_missing')]],'',
        '位置提示包含较粗的“站台层 / 非站台层”，不能将其理解为已查到具体厕所入口。旧来源可能已发生变化。','',
        '## 位置待补清单','', '换乘站会出现在多条线路中，下表条目合计不是独立车站总数。','',
        '| 线路 | 位置待补车站 |','| --- | --- |']
for line in line_list:
    missing=[s['name'] for s in stations.values() if line['id'] in s['line_ids'] and s['toilets']['location_status']=='missing']
    report.append(f'| {line["name"]} | '+('、'.join(missing) or '暂无；已有的位置提示仍待人工核对')+' |')
report += ['', '## 优先人工核对','',
           '- 6 号线与延伸段等较新车站：2024 年地图没有完整覆盖，位置需补。',
           '- 奥体东：2020 年攻略与当前官网厕所总表存在冲突，按当前官网有厕所记录，位置待补。',
           '- 换乘站：分线路查看，不能将一条线的位置套到另一条线；尤其是 1 号线旧区段。',
           '- 天印大道、龙眠大道、高淳：旧报道涉及商业层或站厅层，是否需出付费区待现场核对。',
           '- 小市：站外 1 号出口约 30 米为额外选项，应与站内厕所分开核对。',
           '- 地图来源有站名错字，原图名称及图标坐标已留在 JSON 中；重复站名无法可靠对应的图标未使用。','',
           '## 按官方总表未设厕所','',
           '、'.join(s['name'] for s in stations.values() if s['toilets']['availability']=='unavailable')+'。网站已附沿线邻近车站，换乘站可能需要前往另一线路站层。','',
           '人工核对在网站中保存到 `manual-reviews.json`，重新采集不会覆盖。基础记录不会自动变为已核对；下载网站 JSON 可取得合并后的核对状态。','']
(ROOT/'data/collection-report.md').write_text('\n'.join(report),encoding='utf-8')
print(json.dumps(result['stats'],ensure_ascii=False,indent=2))
print('Unmatched article titles:',unmatched)
