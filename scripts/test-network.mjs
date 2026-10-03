// Acceptance checks for the network graph built from the official directory.
// Run with: node scripts/test-network.mjs
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import '../src/line-colors.js';
import '../src/network-graph.js';

const dataset = JSON.parse(await readFile(new URL('../data/stations.json', import.meta.url), 'utf8'));
const graph = globalThis.MetroGraph.build(dataset);

// --- shape ----------------------------------------------------------------
assert.equal(graph.lines.length, 15, 'the directory lists 15 services');
assert.equal(graph.stats.uniqueStations, 263, 'the directory lists 263 stations');
assert.equal(dataset.lines.length, 15);
assert.ok(graph.lines.some((l) => l.id === '6'), '6号线 must be part of the network');
assert.ok(graph.lines.every((l) => /^#[0-9a-f]{6}$/i.test(l.color)), 'every line has a colour');

// Every station in the directory must belong to at least one line sequence.
for (const station of dataset.stations) {
  assert.ok(graph.linesAt(station.name).length > 0, `${station.name} is not on any line`);
}
// Station names must be unique, otherwise name-based lookups would be ambiguous.
assert.equal(new Set(dataset.stations.map((s) => s.name)).size, dataset.stations.length, 'station names are unique');
for (const line of graph.lines) {
  const sequence = graph.sequence(line.id);
  assert.equal(new Set(sequence).size, sequence.length, `line ${line.id} repeats a station`);
  assert.equal(sequence[0], line.from);
  assert.equal(sequence.at(-1), line.to);
}

// --- known hubs, checked against the directory ----------------------------
assert.deepEqual(graph.linesAt('南京南站').slice().sort(), ['1', '3', '6', 'S1', 'S3'], '南京南站 is a five-line hub');
assert.deepEqual(graph.linesAt('吉印大道').slice().sort(), ['5', 'S1'], '吉印大道 links 5号线 and S1');
assert.deepEqual(graph.linesAt('新街口').slice().sort(), ['1', '2']);
assert.deepEqual(graph.linesAt('竹山路').slice().sort(), ['1', '5']);
assert.equal(graph.isInterchange('禄口机场'), false);
assert.equal(graph.interchangeStations[0].name, '南京南站');
assert.equal(graph.stats.maxLinesAtOneStation, 5);
assert.ok(graph.stats.interchangeCount > 0 && graph.stats.singleLineStations > 0);

// --- the network is one connected component -------------------------------
// plan() only returns a route when both ends are reachable, so sweeping every
// station against one fixed origin is a real connectivity check.
const origin = graph.stationNames[0];
const unreachable = graph.stationNames.filter((name) => name !== origin && !graph.plan(origin, name).ok);
assert.deepEqual(unreachable, [], `unreachable from ${origin}: ${unreachable.join(', ')}`);

// --- planner: straight through, no change ---------------------------------
const indexOf = (lineId, name) => graph.sequence(lineId).indexOf(name);
const direct = graph.plan('南京南站', '新街口');
assert.equal(direct.ok, true);
assert.equal(direct.primary.transfers, 0, '1号线 runs straight through');
assert.equal(direct.primary.legs.length, 1);
assert.equal(direct.primary.legs[0].lineId, '1');
assert.equal(direct.primary.stops, Math.abs(indexOf('1', '新街口') - indexOf('1', '南京南站')));
assert.deepEqual(direct.primary.outOfStation, []);

// --- planner: 6号线 must actually be usable -------------------------------
const lineSix = graph.plan('南京南站', '栖霞山');
assert.equal(lineSix.ok, true);
assert.equal(lineSix.primary.transfers, 0, '6号线 runs 南京南站 to 栖霞山 directly');
assert.equal(lineSix.primary.legs[0].lineId, '6');

// --- planner: out-of-station interchange at 竹山路 ------------------------
const outOfStation = graph.plan('吉印大道', '中国药科大学');
assert.equal(outOfStation.ok, true);
assert.equal(outOfStation.primary.transfers, 1, '吉印大道 to 中国药科大学 changes once');
assert.equal(outOfStation.primary.stops, 10, 'the 5号线 change at 竹山路 is the shorter of the two one-change routes');
assert.equal(outOfStation.primary.outOfStation.length, 1, 'the change is the 竹山路 out-of-station one');
assert.equal(outOfStation.primary.outOfStation[0].station, '竹山路');
assert.match(outOfStation.primary.outOfStation[0].note, /出站换乘/);

// --- planner: legs describe real, adjacent stations -----------------------
for (const [from, to] of [['禄口机场', '金牛湖'], ['经天路', '高淳'], ['林场', '无想山'], ['栖霞山', '太白']]) {
  const result = graph.plan(from, to);
  assert.equal(result.ok, true, `${from} -> ${to} should be routable`);
  for (const leg of result.primary.legs) {
    const sequence = graph.sequence(leg.lineId);
    assert.ok(sequence.includes(leg.from) && sequence.includes(leg.to), `leg on ${leg.lineId} uses real stations`);
    assert.equal(Math.abs(sequence.indexOf(leg.from) - sequence.indexOf(leg.to)), leg.stops, `leg on ${leg.lineId} stop count`);
  }
  assert.equal(result.primary.legs[0].from, from);
  assert.equal(result.primary.legs.at(-1).to, to);
}

// --- planner: the fewer-stops alternative, when it exists -----------------
let alternativesSeen = 0;
for (const from of ['禄口机场', '金牛湖', '高淳', '经天路', '林场', '栖霞山', '泰冯路']) {
  for (const to of ['中国药科大学', '秣陵', '无想山', '太白', '鱼嘴', '仙林湖', '吉印大道']) {
    const result = graph.plan(from, to);
    if (!result.ok || !result.alternative) continue;
    alternativesSeen += 1;
    assert.ok(result.alternative.stops < result.primary.stops, 'an alternative must ride fewer stops');
    assert.equal(result.alternative.legs[0].from, from);
    assert.equal(result.alternative.legs.at(-1).to, to);
  }
}
assert.ok(alternativesSeen > 0, 'expected at least one pair to offer a fewer-stops alternative');

// --- planner: degenerate and unknown inputs -------------------------------
assert.equal(graph.plan('新街口', '新街口').reason, 'same-station');
assert.equal(graph.plan('新街口', '不存在的站').reason, 'unknown-station');
assert.equal(graph.plan('新街口', '不存在a').ok, false);

// --- derived records are self-consistent ---------------------------------
const stats = graph.stats;
assert.equal(stats.lineCount, 15);
assert.equal(stats.interchangeCount, graph.interchangeStations.length);
assert.equal(stats.singleLineStations + stats.interchangeCount, stats.uniqueStations);
assert.equal(stats.lineLengths[0].count, Math.max(...graph.lines.map((l) => graph.sequence(l.id).length)));
assert.equal(stats.lineInterchangeRanking.length, 15);
assert.ok(stats.lineInterchangeRanking.every((entry) => entry.interchanges > 0), 'every line meets an interchange');
assert.equal(stats.busiestInterchange[0].name, '南京南站');
assert.ok(stats.longestNames[0].length >= stats.shortestNames[0].length);
assert.ok(stats.commonCharacters[0].count >= stats.commonCharacters.at(-1).count);
assert.ok(stats.serviceStations > stats.uniqueStations, 'interchanges are counted once per service');

// --- palette: every line has a colour, and chip text stays readable --------
const palette = globalThis.LINE_COLORS;
function contrastRatio(a, b) {
  const la = globalThis.LINE_LUMINANCE(a);
  const lb = globalThis.LINE_LUMINANCE(b);
  const high = Math.max(la, lb);
  const low = Math.min(la, lb);
  return (high + 0.05) / (low + 0.05);
}
for (const line of graph.lines) {
  assert.ok(palette[line.id], `no colour defined for line ${line.id}`);
  const ink = globalThis.LINE_INK(palette[line.id]);
  const ratio = contrastRatio(palette[line.id], ink);
  assert.ok(ratio >= 4.5, `line ${line.id} chip contrast is only ${ratio.toFixed(2)}:1 with ink ${ink}`);
}

console.log(`PASS: ${stats.lineCount} lines / ${stats.uniqueStations} stations / ${stats.interchangeCount} interchanges (max ${stats.maxLinesAtOneStation} lines at one station), all reachable; planner, 6号线, 竹山路 out-of-station change and palette contrast verified.`);
