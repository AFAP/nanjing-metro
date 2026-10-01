"""Read the publisher's 2024-12 PDF toilet symbols, preserving page coordinates.
Only associate symbols on the exact Chinese label row; ambiguous matches stay out.
The PDF uses Raleway '^' upright/inverted for platform/not-platform toilets.
"""
from pathlib import Path
import json, re, hashlib
import pdfplumber
ROOT = Path(__file__).resolve().parents[1]
path = ROOT / 'data/sources/nanjinger-dec2024.pdf'
roster = json.loads((ROOT / 'data/official-roster.json').read_text(encoding='utf-8'))
names = set(s['stationName'].strip() for line in roster for s in line['stations'])
aliases = {'天隆寺':'天龙寺','南大仙林校区':'南京仙林校区','西安门':'西安们','柳洲东路':'柳州东路','泰冯路':'泰冯院','晓庄':'骁庄','嘉陵江东街':'嘉陵江冻结','雨山路':'雨山麓','河海大学佛城西路':'渤海大学佛城西路','双垅':'双龙','百水桥':'白水桥','幸庄':'幸状'}
page = pdfplumber.open(path).pages[0]
han = [c for c in page.chars if re.fullmatch('[\u4e00-\u9fff]',c['text'])]
text = ''.join(c['text'] for c in han)
symbols = [c for c in page.chars if c['text']=='^' and abs(c['matrix'][0])>.99 and c['top']<690]
entries, missed = [], []
for name in sorted(names):
    label = aliases.get(name,name).replace('·','')
    found = []
    for match in re.finditer(re.escape(label),text):
        chars = han[match.start():match.end()]
        box = [min(c['x0'] for c in chars),min(c['top'] for c in chars),max(c['x1'] for c in chars),max(c['bottom'] for c in chars)]
        if box[3]-box[1]>8 or box[2]-box[0]>100: continue
        center_y = (box[1]+box[3])/2
        near = [c for c in symbols if abs((c['top']+c['bottom'])/2-center_y)<5.5 and box[0]-8 < (c['x0']+c['x1'])/2 < box[2]+8]
        if near: found.append({'label_bbox':box,'symbols':[{'at_platform':c['matrix'][0]>0,'bbox':[c['x0'],c['top'],c['x1'],c['bottom']]} for c in near]})
    if len(found)==1:
        entries.append({'station_name':name, 'source_label':label, 'page':1, **found[0], 'human_verified':False})
    else: missed.append(name)
output = {'source': {'id':'nanjinger-2024-12', 'title':'The Nanjinger · 南京地铁双语地图（2024 年 12 月版）', 'url':'https://www.thenanjinger.com/wp-content/uploads/2024/07/metro-map-nanjinger-dec2024.pdf', 'publisher':'The Nanjinger', 'published_at':'2024-12', 'cache_file':'data/sources/nanjinger-dec2024.pdf', 'sha256':hashlib.sha256(path.read_bytes()).hexdigest(), 'kind':'map'},'entries':entries,'unmatched':missed}
(ROOT/'data/map-toilets.json').write_text(json.dumps(output,ensure_ascii=False,indent=2),encoding='utf-8')
print('Matched',len(entries),'stations; unmatched',len(missed))
print('Not platform:', ', '.join(e['station_name'] for e in entries if any(not s['at_platform'] for s in e['symbols'])))
print('Unmatched:', ', '.join(missed))
