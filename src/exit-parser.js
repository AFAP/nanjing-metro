'use strict';
/* Turns the official per-station "nearby" text in data/stations.json into
   structured spots: {station, lines, category, exit, name, distance}.

   The source strings are written by hand and wildly inconsistent, e.g.
     2号口-红山动物园站（500米）（2）学校：66中学、实验二小  （3）医院：2号口-武警医院（150米）
     4号B口—大钟亭（300米）
     2号口左侧-工商银行（200米）、中国银行（300米）
     苏宁环球·名都汇（1公里）
     3、4、5、16号出口-东方商城
     苏豪大厦（3号口出）
   so this parser is deliberately tolerant and prefers keeping a readable name
   over dropping a row. Anything it cannot understand stays in the raw source
   text, which the pages still show next to the parsed result. */
(function (global) {
  var NUM_LIST = '[0-9]+(?:\\s*[、,，和及]\\s*[0-9]+)*';
  // "2号口" / "4号B口" / "4A口" / "16号出口" / "3、4、5、16号出口" / "2号口和6号口"
  var EXIT = '(?:' + NUM_LIST + '\\s*号?\\s*[A-Za-z]?\\s*(?:出口|口)\\s*(?:[和及、,，]\\s*)?)+';

  var CATEGORIES = [
    '景点', '商业设施', '公共设施', '医院', '学校', '政府机构',
    '大楼', '大型企业', '小区', '企业单位', '企业', '办公楼', '文娱设施'
  ];
  // Label spellings that appear in the source but are not categories of their own.
  var LABELS = CATEGORIES.concat(['政府设施', '文体设施', '宾馆', '酒店', '金融设施', '教育', '医疗']);
  var LABEL_ALIAS = {'政府设施': '政府机构', '文体设施': '文娱设施', '宾馆': '商业设施', '酒店': '商业设施', '金融设施': '公共设施'};
  var LABEL_PATTERN = LABELS.join('|');
  // Section headings such as "（3）医院：" separate the blocks of one long blob.
  var SEP = '\u0001';
  // "商业" / "其他" and friends leak through as names when a label had no content.
  var NOT_A_NAME = /^(商业|其他|无|未知|待定|其它|学校|医院|银行|超市)$/;

  function normalize(text) {
    return String(text == null ? '' : text).replace(/[０-９]/g, function (digit) {
      return String.fromCharCode(digit.charCodeAt(0) - 0xFEE0);
    });
  }

  /* Split one description into fragments. A fragment starts at an exit marker
     ("2号口-"), after a separator ("、；,"), or after a "）" that is followed by
     more text — the source often runs two entries together with no separator. */
  function splitFragments(text) {
    var fragmentStart = new RegExp('^' + EXIT);
    var out = [];
    var current = '';
    for (var i = 0; i < text.length; i++) {
      var character = text[i];
      var match = text.slice(i).match(fragmentStart);
      if (match) {
        if (current.trim()) out.push(current);
        current = match[0];
        i += match[0].length - 1;
        continue;
      }
      if ('、，,；;'.indexOf(character) !== -1) {
        out.push(current);
        current = '';
        continue;
      }
      if (character === '）' || character === ')') {
        current += character;
        var next = text[i + 1];
        if (next && '（(、，,；;'.indexOf(next) === -1) {
          out.push(current);
          current = '';
        }
        continue;
      }
      current += character;
    }
    if (current.trim()) out.push(current);
    return out.map(function (s) { return s.trim(); }).filter(Boolean);
  }

  function parseFragment(fragment, previousExit) {
    var exit = previousExit;
    var body = fragment.trim();

    // "2号楼-和燕路小区" is a building number, not the end of a fragment.
    var ordinal = false;
    for (var guard = 0; guard < 3; guard++) {
      var stripped = body.replace(/[（(]\s*[0-9]\s*[）)]\s*[。.；;，,]?\s*$/, '');
      if (stripped === body) { ordinal = true; break; }
      body = stripped;
    }

    var exitPrefix = body.match(new RegExp('^(' + EXIT + ')'));
    if (exitPrefix && !(ordinal && /^[0-9]+\s*号?楼/.test(body))) {
      exit = exitPrefix[1].replace(/[和及、,，\s]+$/, '');
      body = body.slice(exitPrefix[0].length);
    }
    // "苏豪大厦（3号口出）" puts the exit at the end instead.
    var exitSuffix = body.match(new RegExp('[（(]\\s*(' + EXIT + ')\\s*出\\s*[）)]\\s*$'));
    if (exitSuffix) {
      exit = exitSuffix[1].replace(/[和及、,，\s]+$/, '');
      body = body.slice(0, exitSuffix.index);
    }

    // "3A号口-夫子庙秦淮风光带" keeps its marker when the source had no
    // separator before it, because then it never started a new fragment.
    var exitAhead = body.match(new RegExp('^(' + EXIT + ')\\s*[-—–－]\\s*'));
    if (exitAhead) {
      exit = exitAhead[1].replace(/[和及、,，\s]+$/, '');
      body = body.slice(exitAhead[0].length);
    }

    var label = null;
    var labelMatch = body.match(/^\s*([\u4e00-\u9fa5]{2,6})\s*[：:]\s*/);
    if (labelMatch) {
      label = labelMatch[1];
      body = body.slice(labelMatch[0].length);
    }

    body = body.replace(/^\s*[-—–－~～至]{1,2}\s*/, '')
      .replace(/^[左右]侧\s*[-—–－]?\s*/, '')
      .trim();

    var distance = null;
    var withUnit = body.match(new RegExp('[（(]\\s*([0-9]+(?:\\.[0-9]+)?)\\s*(米|公里|千米|km|m)\\s*[）)]\\s*[。.；;，,]?\\s*$'));
    if (withUnit) {
      var value = Number(withUnit[1]);
      distance = Math.round(withUnit[2] === '公里' || withUnit[2] === '千米' || withUnit[2] === 'km' ? value * 1000 : value);
      body = body.slice(0, withUnit.index);
    } else {
      // "武定门公园（300）" — a unitless distance. Two digits or more, so that a
      // single digit stays available as the section heading handled above.
      var bare = body.match(/[（(]\s*([0-9]{2,})\s*[）)]\s*[。.；;，,]?\s*$/);
      if (bare) {
        distance = Number(bare[1]);
        body = body.slice(0, bare.index);
      }
    }

    body = body.replace(/^[左右]侧\s*[-—–－]?\s*/, '')
      .replace(/[\s。.；;，,、\-—–]+$/, '')
      .trim();

    return {exit: exit || null, name: body, label: label, distance: distance};
  }

  function categoryFor(label, fallback) {
    if (!label) return fallback;
    if (LABEL_ALIAS[label]) return LABEL_ALIAS[label];
    if (CATEGORIES.indexOf(label) !== -1) return label;
    return fallback;
  }

  /* dataset = the parsed data/stations.json */
  function spots(dataset) {
    var stations = (dataset && dataset.stations) || [];
    var collected = [];
    stations.forEach(function (station) {
      (station.nearby || []).forEach(function (entry) {
        var text = normalize(entry.description);
        // Promote inline section headings ("（3）医院：") into separators so the
        // category of each block survives the split.
        text = text.replace(new RegExp('[（(]\\s*[0-9]{1,2}\\s*[）)]\\s*(' + LABEL_PATTERN + ')\\s*[：:]', 'g'), SEP + '$1' + SEP);
        text = text.replace(new RegExp('(' + LABEL_PATTERN + ')\\s*[：:]', 'g'), SEP + '$1' + SEP);

        var category = entry.category;
        var previousExit = null;
        text.split(SEP).forEach(function (chunk) {
          var piece = chunk.trim();
          if (!piece) return;
          if (new RegExp('^(' + LABEL_PATTERN + ')$').test(piece)) {
            category = categoryFor(piece, category);
            return;
          }
          splitFragments(piece).forEach(function (fragment) {
            var parsed = parseFragment(fragment, previousExit);
            if (parsed.exit) previousExit = parsed.exit;
            var name = parsed.name === station.name + '站' ? station.name : parsed.name;
            if (!name || name.length < 2 || name.length > 26) return;
            if (NOT_A_NAME.test(name)) return;
            if (/[：:]/.test(name)) return;
            collected.push({
              station: station.name,
              lines: station.line_ids || [],
              category: categoryFor(parsed.label, category),
              exit: parsed.exit,
              name: name,
              distance: parsed.distance
            });
          });
        });
      });
    });

    var seen = {};
    return collected.filter(function (spot) {
      var key = spot.station + '|' + spot.category + '|' + spot.name + '|' + spot.exit;
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }

  function byStation(list) {
    var grouped = new Map();
    list.forEach(function (spot) {
      if (!grouped.has(spot.station)) grouped.set(spot.station, []);
      grouped.get(spot.station).push(spot);
    });
    return grouped;
  }

  function byExit(list) {
    var grouped = new Map();
    list.slice().sort(function (a, b) {
      return (a.distance == null ? Infinity : a.distance) - (b.distance == null ? Infinity : b.distance);
    }).forEach(function (spot) {
      var key = spot.exit || '未注明出口';
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(spot);
    });
    return grouped;
  }

  function formatDistance(metres) {
    if (metres == null) return '距离未注明';
    if (metres >= 1000) return (metres / 1000).toFixed(1).replace(/\.0$/, '') + ' 公里';
    return metres + ' 米';
  }

  global.MetroExits = {
    CATEGORIES: CATEGORIES,
    spots: spots,
    byStation: byStation,
    byExit: byExit,
    formatDistance: formatDistance
  };
})(typeof window !== 'undefined' ? window : globalThis);
