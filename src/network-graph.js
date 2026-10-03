'use strict';
/*
 * Graph operations over the official station directory (data/stations.json).
 *
 * This is deliberately sourced from the directory rather than from the 2D
 * schematic: the directory is the newer record (collected 2026-10, 15 lines /
 * 263 stations, including 6号线) while the schematic is a 2026-04 snapshot of
 * 14 lines. Planning a journey against the snapshot would miss 6号线 entirely
 * and would still call 吉印大道 a single-line station, so the directory wins.
 *
 * A state here is a (line, station) pair. Riding one stop costs one stop;
 * boarding a different line at the same station costs one transfer. That models
 * the real network, including out-of-station interchanges, which are ordinary
 * transfers here and reported separately in the interface.
 *
 * Two orderings are offered because they give genuinely different advice:
 * fewest transfers (the usual question) and fewest stops (sometimes an extra
 * change avoids a long loop).
 */
(function (global) {
  // Cost weights. A stop is the unit of "distance"; a transfer is priced high
  // enough that minimising transfers always wins, and low enough in the
  // stops-first search that it only breaks ties between equal-length routes.
  var TRANSFER_WEIGHT = 10000;
  var STOP_WEIGHT = 1000;

  // Treat 草场门/草场门·南艺·二师 and a trailing 站 as the same station name.
  function normalize(value) {
    return String(value == null ? '' : value).replace(/[\s·]/g, '').replace(/站$/, '');
  }

  function build(dataset) {
    if (!dataset || !Array.isArray(dataset.lines) || !Array.isArray(dataset.stations)) {
      throw new Error('线网数据格式不正确');
    }

    var stationById = new Map();
    var stationByName = new Map();
    for (var i = 0; i < dataset.stations.length; i++) {
      var record = dataset.stations[i];
      stationById.set(record.id, record);
      if (!stationByName.has(record.name)) stationByName.set(record.name, record);
    }

    var colors = global.LINE_COLORS || {};
    var fallbackColor = global.LINE_FALLBACK_COLOR || '#66736a';

    var lineById = new Map();
    var sequenceByLine = new Map();
    var positionByLine = new Map();
    var linesAtStation = new Map();
    var lines = [];

    for (var l = 0; l < dataset.lines.length; l++) {
      var lineRecord = dataset.lines[l];
      var names = lineRecord.station_ids.map(function (id) {
        var station = stationById.get(id);
        if (!station) throw new Error('线路 ' + lineRecord.id + ' 引用了未知车站 ' + id);
        return station.name;
      });
      if (!names.length) throw new Error('线路 ' + lineRecord.id + ' 没有车站');
      var displayName = lineRecord.name || lineRecord.id + '号线';
      var line = {
        id: lineRecord.id,
        name: displayName,
        shortName: displayName.replace(/号线$/, ''),
        color: colors[lineRecord.id] || fallbackColor,
        from: names[0],
        to: names[names.length - 1],
        stops: names
      };
      lines.push(line);
      lineById.set(line.id, line);
      sequenceByLine.set(line.id, names);

      var positions = new Map();
      for (var p = 0; p < names.length; p++) {
        positions.set(names[p], p);
        var bucket = linesAtStation.get(names[p]);
        if (!bucket) linesAtStation.set(names[p], (bucket = []));
        if (bucket.indexOf(line.id) === -1) bucket.push(line.id);
      }
      positionByLine.set(line.id, positions);
    }

    var stationNames = Array.from(linesAtStation.keys()).sort(function (a, b) {
      return a.localeCompare(b, 'zh-Hans-CN');
    });

    var interchangeStations = stationNames
      .filter(function (name) { return linesAtStation.get(name).length > 1; })
      .map(function (name) {
        var station = stationByName.get(name);
        return {name: name, lineIds: linesAtStation.get(name).slice(), stationId: station ? station.id : null};
      })
      .sort(function (a, b) {
        return b.lineIds.length - a.lineIds.length || a.name.localeCompare(b.name, 'zh-Hans-CN');
      });

    function linesAt(name) { return linesAtStation.get(name) || []; }
    function isInterchange(name) { return linesAt(name).length > 1; }

    function push(heap, item) {
      heap.push(item);
      var index = heap.length - 1;
      while (index > 0) {
        var parent = (index - 1) >> 1;
        if (heap[parent].cost <= heap[index].cost) break;
        var swap = heap[parent]; heap[parent] = heap[index]; heap[index] = swap;
        index = parent;
      }
    }

    function pop(heap) {
      var top = heap[0];
      var last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        var index = 0;
        for (;;) {
          var left = 2 * index + 1, right = left + 1, min = index;
          if (left < heap.length && heap[left].cost < heap[min].cost) min = left;
          if (right < heap.length && heap[right].cost < heap[min].cost) min = right;
          if (min === index) break;
          var swap = heap[min]; heap[min] = heap[index]; heap[index] = swap;
          index = min;
        }
      }
      return top;
    }

    function stateKey(lineId, name) { return lineId + '\u0000' + name; }

    // Lexicographic shortest path. The two weights decide which cost dominates:
    // (10000, 1) minimises transfers first, (1, 1000) minimises stops first and
    // only uses transfers to break ties.
    function search(from, to, transferWeight, stopWeight) {
      var startLines = linesAt(from);
      if (!startLines.length || !linesAt(to).length) return null;

      var best = new Map();
      var cameFrom = new Map();
      var heap = [];
      for (var s = 0; s < startLines.length; s++) {
        var startKey = stateKey(startLines[s], from);
        best.set(startKey, 0);
        cameFrom.set(startKey, null);
        push(heap, {lineId: startLines[s], name: from, cost: 0, transfers: 0, stops: 0});
      }

      var goalKey = null;
      while (heap.length) {
        var current = pop(heap);
        var currentKey = stateKey(current.lineId, current.name);
        if (current.cost !== best.get(currentKey)) continue;
        if (current.name === to) { goalKey = currentKey; break; }

        var positions = positionByLine.get(current.lineId);
        var names = sequenceByLine.get(current.lineId);
        var at = positions.get(current.name);
        for (var n = 0; n < 2; n++) {
          var neighbour = n === 0 ? names[at - 1] : names[at + 1];
          if (neighbour === undefined) continue;
          var rideKey = stateKey(current.lineId, neighbour);
          var rideCost = current.cost + stopWeight;
          if (!best.has(rideKey) || rideCost < best.get(rideKey)) {
            best.set(rideKey, rideCost);
            cameFrom.set(rideKey, currentKey);
            push(heap, {lineId: current.lineId, name: neighbour, cost: rideCost, transfers: current.transfers, stops: current.stops + 1});
          }
        }

        var alternatives = linesAt(current.name);
        for (var a = 0; a < alternatives.length; a++) {
          if (alternatives[a] === current.lineId) continue;
          var changeKey = stateKey(alternatives[a], current.name);
          var changeCost = current.cost + transferWeight;
          if (!best.has(changeKey) || changeCost < best.get(changeKey)) {
            best.set(changeKey, changeCost);
            cameFrom.set(changeKey, currentKey);
            push(heap, {lineId: alternatives[a], name: current.name, cost: changeCost, transfers: current.transfers + 1, stops: current.stops});
          }
        }
      }

      if (!goalKey) return null;

      var chain = [];
      for (var cursor = goalKey; cursor; cursor = cameFrom.get(cursor)) {
        var parts = cursor.split('\u0000');
        chain.unshift({lineId: parts[0], name: parts[1]});
      }

      var legs = [];
      var leg = {lineId: chain[0].lineId, from: chain[0].name, to: chain[0].name, stops: 0};
      for (var c = 1; c < chain.length; c++) {
        if (chain[c].lineId === leg.lineId) {
          leg.stops += 1;
          leg.to = chain[c].name;
        } else {
          legs.push(leg);
          leg = {lineId: chain[c].lineId, from: chain[c].name, to: chain[c].name, stops: 0};
        }
      }
      legs.push(leg);

      var stops = 0;
      for (var t = 0; t < legs.length; t++) stops += legs[t].stops;
      return {legs: legs, transfers: legs.length - 1, stops: stops};
    }

    // Changing at 竹山路 between 1号线 and 5号线 means leaving the paid area.
    var OUT_OF_STATION = [{
      station: '竹山路',
      lineIds: ['1', '5'],
      note: '竹山路站的 1 号线与 5 号线需要出站换乘。出站后再进站，请预留步行、安检与再次刷卡的时间。'
    }];

    function outOfStationNotices(legs) {
      var notices = [];
      for (var i = 0; i < legs.length - 1; i++) {
        var from = legs[i].lineId, to = legs[i + 1].lineId, at = legs[i].to;
        for (var j = 0; j < OUT_OF_STATION.length; j++) {
          var rule = OUT_OF_STATION[j];
          if (rule.station !== at) continue;
          if (rule.lineIds.indexOf(from) === -1 || rule.lineIds.indexOf(to) === -1) continue;
          notices.push({station: at, from: from, to: to, note: rule.note});
        }
      }
      return notices;
    }

    function plan(from, to) {
      if (!linesAt(from).length || !linesAt(to).length) return {ok: false, reason: 'unknown-station'};
      if (from === to) return {ok: false, reason: 'same-station'};
      var fewestTransfers = search(from, to, TRANSFER_WEIGHT, 1);
      if (!fewestTransfers) return {ok: false, reason: 'unreachable'};
      fewestTransfers.outOfStation = outOfStationNotices(fewestTransfers.legs);

      // The primary route already minimises transfers, so an alternative is only
      // worth showing when it genuinely rides fewer stops.
      var fewestStops = search(from, to, 1, STOP_WEIGHT);
      var alternative = null;
      if (fewestStops && fewestStops.stops < fewestTransfers.stops) {
        alternative = fewestStops;
        alternative.outOfStation = outOfStationNotices(fewestStops.legs);
      }
      return {ok: true, primary: fewestTransfers, alternative: alternative};
    }

    // Everything the records page reports is counted here, so the page cannot
    // state a fact the directory does not contain.
    function buildStats() {
      var serviceStations = 0;
      var lineLengths = lines.map(function (line) {
        serviceStations += line.stops.length;
        return {id: line.id, name: line.name, color: line.color, count: line.stops.length};
      });

      var interchangeCountByLine = new Map();
      for (var i = 0; i < interchangeStations.length; i++) {
        var ids = interchangeStations[i].lineIds;
        for (var j = 0; j < ids.length; j++) {
          interchangeCountByLine.set(ids[j], (interchangeCountByLine.get(ids[j]) || 0) + 1);
        }
      }
      var lineInterchangeRanking = lines.map(function (line) {
        return {id: line.id, name: line.name, color: line.color, interchanges: interchangeCountByLine.get(line.id) || 0};
      }).sort(function (a, b) { return b.interchanges - a.interchanges || a.id.localeCompare(b.id); });

      var byNameLength = stationNames.slice().sort(function (a, b) {
        return b.length - a.length || a.localeCompare(b, 'zh-Hans-CN');
      });

      var characterCounts = new Map();
      for (var s = 0; s < stationNames.length; s++) {
        var seen = new Set();
        var chars = Array.from(stationNames[s]);
        for (var c = 0; c < chars.length; c++) {
          var ch = chars[c];
          if (ch === '·' || seen.has(ch)) continue;
          seen.add(ch);
          characterCounts.set(ch, (characterCounts.get(ch) || 0) + 1);
        }
      }
      var commonCharacters = Array.from(characterCounts.entries())
        .map(function (entry) { return {character: entry[0], count: entry[1]}; })
        .sort(function (a, b) { return b.count - a.count || a.character.localeCompare(b.character); });

      function countWhere(fragment) {
        return stationNames.filter(function (name) { return name.indexOf(fragment) !== -1; });
      }

      return {
        lineCount: lines.length,
        uniqueStations: stationNames.length,
        serviceStations: serviceStations,
        interchangeCount: interchangeStations.length,
        singleLineStations: stationNames.length - interchangeStations.length,
        maxLinesAtOneStation: interchangeStations.length ? interchangeStations[0].lineIds.length : 0,
        lineLengths: lineLengths.slice().sort(function (a, b) { return b.count - a.count || a.id.localeCompare(b.id); }),
        lineInterchangeRanking: lineInterchangeRanking,
        longestNames: byNameLength.slice(0, 5),
        shortestNames: byNameLength.slice(-5).reverse(),
        commonCharacters: commonCharacters.slice(0, 12),
        busiestInterchange: interchangeStations.slice(0, 10),
        suffix: {
          men: countWhere('门'),
          shan: countWhere('山'),
          qiao: countWhere('桥'),
          nan: countWhere('南'),
          dong: countWhere('东')
        }
      };
    }

    return {
      lines: lines,
      lineById: lineById,
      datasetMeta: {
        collectedAt: dataset.collected_at || null,
        scope: (dataset.scope && dataset.scope.description) || null,
        declaredStations: dataset.stations.length,
        declaredLines: dataset.lines.length
      },
      sequence: function (lineId) { return (sequenceByLine.get(lineId) || []).slice(); },
      stationNames: stationNames,
      station: function (name) { return stationByName.get(name) || null; },
      linesAt: linesAt,
      isInterchange: isInterchange,
      interchangeStations: interchangeStations,
      outOfStationRules: OUT_OF_STATION,
      outOfStationNotices: outOfStationNotices,
      plan: plan,
      stats: buildStats()
    };
  }

  function load(url) {
    if (typeof global.fetch !== 'function') return Promise.reject(new Error('当前环境不支持 fetch'));
    // Fall back to the published dataset so a bare load() cannot end up
    // requesting the literal path "undefined".
    var target = url || (global.MetroGraph && global.MetroGraph.DATA_URL);
    return global.fetch(target, {cache: 'no-cache'}).then(function (response) {
      if (!response.ok) throw new Error('线网数据加载失败（HTTP ' + response.status + '）');
      return response.json();
    }).then(build);
  }

  global.MetroGraph = {build: build, load: load, normalize: normalize, DATA_URL: 'data/stations.json'};
})(typeof window !== 'undefined' ? window : globalThis);
