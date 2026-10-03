// Acceptance checks for the exit/landmark parser behind 出站即达.
// Run with: node scripts/test-exits.mjs
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import '../src/exit-parser.js';

const dataset = JSON.parse(await readFile(new URL('../data/stations.json', import.meta.url), 'utf8'));
const parser = globalThis.MetroExits;
const spots = parser.spots(dataset);

const at = (station, name) => spots.find((s) => s.station === station && s.name === name);
const scenic = spots.filter((s) => s.category === '景点');

// --- shape ----------------------------------------------------------------
assert.ok(spots.length > 1500, `expected a large spot index, got ${spots.length}`);
assert.equal(new Set(spots.map((s) => s.station)).size, parser.byStation(spots).size, 'grouping is consistent');
for (const station of parser.byStation(spots).keys()) {
  assert.ok(dataset.stations.some((s) => s.name === station), `${station} is not a real station`);
}
for (const spot of spots) {
  assert.ok(spot.name.length >= 2 && spot.name.length <= 26, `implausible name: ${spot.name}`);
  assert.ok(!/[：:]/.test(spot.name), `label leaked into a name: ${spot.name}`);
  assert.ok(!/^[0-9]+\s*号?(出口|口)\s*[-—–]/.test(spot.name), `fragment leaked into a name: ${spot.name}`);
  assert.ok(!/[（(]\s*\d+\s*(米|公里|千米)?\s*[）)]/.test(spot.name), `distance leaked into a name: ${spot.name}`);
  assert.ok(!/[（(]\s*\d+\s*号?[A-Za-z]?\s*(出口|口)\s*[）)]/.test(spot.name), `exit leaked into a name: ${spot.name}`);
  // Zero is legitimate — the directory lists "4号口-金鹰天地（0米）" at 珠江路.
  // Keep a generous ceiling: the source contains typos such as
  // "怡水嘉园（350千米）" at 七桥瓮, which is 350000 once unit conversion runs.
  assert.ok(spot.distance == null || (spot.distance >= 0 && spot.distance <= 2000000), `implausible distance: ${spot.name} ${spot.distance}`);
}

// Every spot must keep a category we know about.
for (const spot of spots) {
  assert.ok(parser.CATEGORIES.includes(spot.category), `unknown category ${spot.category} for ${spot.name}`);
}

// --- distances ------------------------------------------------------------
// "南京云锦博物馆（10米）" is the closest landmark in the whole directory.
assert.equal(at('云锦路', '南京云锦博物馆').distance, 10);
assert.equal(at('云锦路', '侵华日军南京大屠杀遇难同胞纪念馆').distance, 200);
assert.equal(at('大行宫', '江宁织造府').distance, 30);
assert.equal(at('大行宫', '总统府').distance, 200);
assert.equal(at('玄武门', '玄武湖公园').distance, 300);
assert.equal(at('武定门', '白鹭洲公园').distance, 100);
// "武定门公园（300）" carries no unit in the source.
assert.equal(at('武定门', '武定门公园').distance, 300);
// "苏宁环球·名都汇（1公里）" must become 1000 metres, not 1.
assert.equal(at('晓庄', '苏宁环球·名都汇').distance, 1000);
assert.equal(at('鼓楼', '鼓楼公园').distance, 500);

// --- exits ----------------------------------------------------------------
assert.equal(at('玄武门', '玄武湖公园').exit, '3号口');
assert.equal(at('大行宫', '总统府').exit, '5号口');
assert.equal(at('武定门', '老门东').exit, '2号口');
assert.equal(at('三山街', '净觉寺').exit, '3号口');
// "4号B口—大钟亭（300米）" and "4号A口—建设银行（200米）"
assert.equal(at('鼓楼', '大钟亭').exit, '4号B口');
// "3、4、5、16号出口-东方商城" lists several exits for one place.
assert.equal(at('新街口', '东方商城').exit, '3、4、5、16号出口');
// "汉中门广场（50米）" plus "（3号口、4号口）"
assert.equal(at('汉中门', '汉中门广场').exit, '3号口、4号口');

// --- section headings inside one long blob ---------------------------------
// 红山动物园 packs nine numbered sections into a single "景点" entry; each
// section must be re-categorised instead of everything landing in 景点.
const hongshan = parser.byStation(spots).get('红山动物园');
assert.ok(hongshan.length > 12, `expected many spots at 红山动物园, got ${hongshan.length}`);
assert.equal(at('红山动物园', '红山动物园').category, '景点');
assert.equal(at('红山动物园', '红山动物园').distance, 500);
assert.equal(at('红山动物园', '武警医院').category, '医院');
assert.equal(at('红山动物园', '66中学').category, '学校');
assert.equal(at('红山动物园', '交警七大队').category, '政府机构');
assert.equal(at('红山动物园', '工商银行').category, '公共设施');
assert.equal(at('红山动物园', '金港大厦').category, '大楼');
// A bare "（2）" is a section number, so it must never be read as a distance.
assert.ok(!hongshan.some((s) => s.distance === 2), '（2）was mistaken for a distance');

// --- no duplicates --------------------------------------------------------
const keys = spots.map((s) => `${s.station}|${s.category}|${s.name}|${s.exit}`);
assert.equal(new Set(keys).size, keys.length, 'the index repeats a spot');

// --- usefulness -----------------------------------------------------------
// The page is built around walking distance, so the tourist categories must be
// well populated; otherwise the promise on the page would be hollow.
assert.ok(scenic.length > 100, `expected a useful number of landmarks, got ${scenic.length}`);
const walkable = scenic.filter((s) => s.distance != null && s.distance <= 500);
assert.ok(walkable.length > 25, `expected plenty of landmarks within 500m, got ${walkable.length}`);
for (const name of ['总统府', '夫子庙', '玄武湖公园', '老门东']) {
  assert.ok(walkable.some((s) => s.name === name), `${name} should be within 500m of a station`);
}
assert.ok(parser.formatDistance(10) === '10 米');
assert.ok(parser.formatDistance(1000) === '1 公里');
assert.ok(parser.formatDistance(null) === '距离未注明');

console.log(`PASS: ${spots.length} spots across ${parser.byStation(spots).size} stations; `
  + `${scenic.length} landmarks, ${walkable.length} of them within a 500 m walk; `
  + `exits, unitless distances, kilometres and inline section headings all parsed.`);
