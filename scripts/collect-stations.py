"""Collect public Nanjing Metro station directories. Raw pages are cached for audit.
Run with Python + lxml. Four workers, a short pause, and bounded retries.
"""
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.parse import urljoin, parse_qs, urlsplit
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import json, hashlib, re, time
from lxml import html

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / 'data' / 'sources'
BASE = 'https://www.njmetro.com.cn'
NOW = datetime.now(timezone.utc).isoformat()
def get(url, filename):
    target = CACHE / filename
    target.parent.mkdir(parents=True, exist_ok=True)
    if not target.exists():
        for attempt in range(3):
            try:
                with urlopen(Request(url, headers={'User-Agent': 'NanjingMetroAtlas/1.0 (public station facility research)'}), timeout=25) as response:
                    raw = response.read()
                target.write_bytes(raw)
                break
            except Exception:
                if attempt == 2: raise
                time.sleep(1 + attempt)
        time.sleep(.18)
    raw = target.read_bytes()
    collected = datetime.fromtimestamp(target.stat().st_mtime, timezone.utc).isoformat()
    return raw.decode('utf-8-sig'), {'url': url, 'collected_at': collected, 'cache_file': str(target.relative_to(ROOT)).replace('\\', '/'), 'sha256': hashlib.sha256(raw).hexdigest(), 'published_at': None}

def directory(filename, kind):
    tree = html.fromstring((CACHE / filename).read_bytes())
    urls = list(dict.fromkeys(urljoin(BASE, a.get('href')) for a in tree.xpath('//area[@href]') if 'main-article-detail.do' in a.get('href')))
    return [(u, kind) for u in urls]

def article(task):
    url, kind = task
    row = parse_qs(urlsplit(url).query)['rowId'][0]
    content, source = get(url, f'{kind}/{row}.html')
    tree = html.fromstring(content)
    titles = tree.xpath('//div[contains(concat(" ", normalize-space(@class), " "), " font14blueb ")]')
    if not titles: raise ValueError(f'No station title: {url}')
    title = ''.join(titles[0].itertext()).strip()
    block = titles[0].getparent().getparent()
    paragraphs = [''.join(p.itertext()).strip() for p in block.xpath('./p')]
    if not paragraphs:
        paragraphs = [re.sub(r'\s+', ' ', ''.join(block.itertext())).replace(title, '', 1).strip()]
    source.update({'id': kind + '-' + row, 'publisher': '南京地铁集团有限公司', 'title': title + (' · 车站简介' if kind == 'intro' else ' · 出站指南'), 'kind': kind})
    return {'title': title, 'paragraphs': [p for p in paragraphs if p], 'source': source}

def main():
    service = html.fromstring((CACHE / 'njmetro-service.html').read_bytes())
    lines = list(dict.fromkeys((o.get('value'), ''.join(o.itertext()).strip()) for o in service.xpath('//option[starts-with(@value,"L")]')))
    roster = []
    for line_id, label in lines:
        body, source = get(BASE + '/njdtweb/portal/get-stationList.do?reLineId=' + line_id, 'lines/' + line_id + '.json')
        rows = json.loads(body)['stationList']
        roster.append({'id': line_id[1:], 'name': label, 'stations': rows, 'source': {**source, 'id': 'roster-' + line_id, 'publisher': '南京地铁集团有限公司', 'title': label + ' · 车站目录', 'kind': 'roster'}})
        print(label, len(rows), flush=True)
    (ROOT / 'data' / 'official-roster.json').write_text(json.dumps(roster, ensure_ascii=False, indent=2), encoding='utf-8')
    tasks = directory('njmetro-station-widget.html', 'intro') + directory('njmetro-exits-widget.html', 'exits')
    articles, errors = [], []
    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = {pool.submit(article, task): task for task in tasks}
        for i, future in enumerate(as_completed(futures), 1):
            try: articles.append(future.result())
            except Exception as error: errors.append({'url': futures[future][0], 'error': str(error)})
            if i % 40 == 0: print(f'Articles {i}/{len(tasks)}, errors {len(errors)}', flush=True)
    articles.sort(key=lambda a: a['source']['id'])
    (ROOT / 'data' / 'official-articles.json').write_text(json.dumps({'collected_at': NOW, 'articles': articles, 'errors': errors}, ensure_ascii=False, indent=2), encoding='utf-8')
    print('Saved', len(articles), 'articles;', len(errors), 'errors', flush=True)

if __name__ == '__main__': main()
