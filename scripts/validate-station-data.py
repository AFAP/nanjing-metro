"""Check data provenance, uncertainty flags and known interchange edge cases."""
from pathlib import Path
import hashlib, json

ROOT = Path(__file__).resolve().parents[1]
raw = (ROOT/'data/stations.json').read_bytes()
data = json.loads(raw)
stations = {s['id']: s for s in data['stations']}
names = {s['name']: s for s in data['stations']}
sources = {s['id']: s for s in data['sources']}
assert len(stations) == len(names) == len(data['stations']) == 263
assert len(sources) == len(data['sources'])
assert len(data['lines']) == 15
assert not data['collection_issues']['unmatched_article_titles']
assert not data['collection_issues']['failed_articles']
for line in data['lines']:
    assert line['source_id'] in sources
    assert len(line['station_ids']) == len(set(line['station_ids']))
    for sid in line['station_ids']:
        assert line['id'] in stations[sid]['line_ids']
for s in stations.values():
    assert s['human_verified'] is False
    assert s['introduction'] and all(i['text'].strip() for i in s['introduction'])
    assert any(i.startswith('exits-') for i in s['source_ids']), s['name']
    assert len(s['line_ids']) == len(set(s['line_ids']))
    assert all(i in sources for i in s['source_ids'])
    assert len(s['toilets']['by_line']) == len(s['line_ids'])
    for fact in s['introduction'] + s['nearby'] + s['toilets']['by_line'] + s['toilets']['locations']:
        assert fact['source_id'] in s['source_ids'], (s['name'], fact)
    for fact in s['toilets']['by_line'] + s['toilets']['locations']:
        assert fact['human_verified'] is False
    for loc in s['toilets']['locations']:
        assert set(loc['line_ids']).issubset(s['line_ids'])
        assert loc['paid_area'] in ('paid','unpaid','outside','unknown')
        assert loc['description'].strip()
    if s['toilets']['location_status'] == 'missing':
        assert s['toilets']['availability'] == 'available' and not s['toilets']['locations']
    if s['toilets']['availability'] == 'unavailable':
        assert not s['toilets']['locations'] and s['toilets']['nearby_alternatives']
    for alternative in s['toilets']['nearby_alternatives']:
        target = stations[alternative['station_id']]
        assert target['toilets']['availability'] == 'available'
        line = next(l for l in data['lines'] if l['id'] == alternative['line_id'])
        assert abs(line['station_ids'].index(s['id']) - line['station_ids'].index(target['id'])) == alternative['stops']
for source in sources.values():
    assert source['url'].startswith('https://') and source['collected_at']
    if source.get('sha256'):
        assert hashlib.sha256((ROOT/source['cache_file']).read_bytes()).hexdigest() == source['sha256'], source['id']
assert {s['name'] for s in stations.values() if s['toilets']['availability']=='unavailable'} == {'迈皋桥','红山动物园','新模范马路','玄武门','珠江路','张府园','中华门','小行'}
assert names['南京站']['toilets']['availability'] == 'available'
assert {f['line_id']: f['availability'] for f in names['南京站']['toilets']['by_line']} == {'1':'unavailable','3':'available'}
assert any(l['floor']=='1F' and l['paid_area']=='unpaid' and l['source_id']=='gov-xiangyu-2025' for l in names['翔宇路南']['toilets']['locations'])
expected = {
    'location_collected': sum(bool(s['toilets']['locations']) for s in stations.values()),
    'location_missing': sum(s['toilets']['location_status']=='missing' for s in stations.values()),
    'precise_location_stations': sum(any(l['precision'] in ('direction','floor','exit') for l in s['toilets']['locations']) for s in stations.values()),
}
for key, value in expected.items(): assert data['stats'][key] == value
assert data['stats']['human_verified'] == 0
print('PASS: 263 stations, 15 lines, all provenance links/caches, uncertainty flags and interchange cases.')
print(json.dumps(data['stats'],ensure_ascii=False))
