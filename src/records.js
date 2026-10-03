'use strict';
/* Network records. Every number shown here is counted from data/stations.json. */
(() => {
  const $ = (selector) => document.querySelector(selector);
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  };

  const SUFFIX_QUESTIONS = [
    ['门', 'men'],
    ['山', 'shan'],
    ['桥', 'qiao'],
    ['南', 'nan'],
    ['东', 'dong']
  ];

  let graph = null;

  function chip(lineId) {
    const node = el('span', 'line-chip', lineId);
    const color = graph.lineById.get(lineId).color;
    node.style.setProperty('--line-color', color);
    node.style.setProperty('--line-ink', LINE_INK(color));
    return node;
  }

  function chipRow(lineIds) {
    const row = el('span', 'chip-row');
    lineIds.forEach((id) => row.append(chip(id)));
    return row;
  }

  function stationLink(name) {
    const link = el('a', null, name);
    link.href = `./?station=${encodeURIComponent(name)}#station-info`;
    return link;
  }

  function figure(value, unit, what, detail) {
    const node = el('div', 'figure');
    const strong = el('div', 'value', String(value));
    if (unit) strong.append(el('small', null, unit));
    node.append(strong, el('p', 'what', what));
    if (detail) node.append(el('p', 'detail', detail));
    return node;
  }

  function render() {
    const stats = graph.stats;
    const busiest = stats.busiestInterchange[0];
    const longestLine = stats.lineLengths[0];
    const shortestLine = stats.lineLengths[stats.lineLengths.length - 1];
    const mostCommon = stats.commonCharacters[0];
    const topLine = stats.lineInterchangeRanking[0];

    // --- lead -------------------------------------------------------------
    const prose = $('#records-prose');
    prose.textContent = '';
    const p1 = el('p');
    p1.append(document.createTextNode('这张网现在有 '));
    p1.append(el('b', null, `${stats.lineCount} 条线路`));
    p1.append(document.createTextNode('、'));
    p1.append(el('b', null, `${stats.uniqueStations} 座车站`));
    p1.append(document.createTextNode('。其中 '));
    p1.append(el('b', null, `${stats.interchangeCount} 座`));
    p1.append(document.createTextNode('有两条以上线路经过，剩下的 '));
    p1.append(el('b', null, `${stats.singleLineStations} 座`));
    p1.append(document.createTextNode('只服务一条线。'));
    prose.append(p1);

    const p2 = el('p');
    p2.append(document.createTextNode(`交汇最多的还是 ${busiest.name}，${busiest.lineIds.length} 条线路在这里碰头。`));
    p2.append(document.createTextNode(`线路里最长的是 ${longestLine.name}（${longestLine.count} 站），最短的是 ${shortestLine.name}（${shortestLine.count} 站）。`));
    const p2Link = el('a', null, '换乘站一览在换乘实验室');
    p2Link.href = 'transfer.html';
    p2.append(document.createTextNode('完整的'));
    p2.append(p2Link, document.createTextNode('。'));
    prose.append(p2);

    const p3 = el('p');
    p3.append(document.createTextNode('每条线都有自己的颜色，颜色只用来区分线路，不表示快慢或新旧。'));
    prose.append(p3);

    const figures = $('#records-figures');
    figures.textContent = '';
    figures.append(
      figure(stats.uniqueStations, '座', '目录里的车站总数', `${stats.lineCount} 条线路合计 ${stats.serviceStations} 个站位`),
      figure(stats.interchangeCount, '座', '换乘站', `占全部车站的 ${Math.round(stats.interchangeCount / stats.uniqueStations * 100)}%`),
      figure(busiest.lineIds.length, '条', `${busiest.name} 交汇的线路数`, '全网络最多'),
      figure(mostCommon.character, '', '站名里出现最多的字', `${mostCommon.count} 座车站的站名里有这个字`)
    );

    // --- busiest interchange ---------------------------------------------
    // 2号线、5号线、7号线 all sit at 10 interchange stations, so name every
    // line sharing the top count instead of reporting a single winner.
    const topCount = topLine.interchanges;
    const leaders = stats.lineInterchangeRanking.filter((entry) => entry.interchanges === topCount);
    $('#busy-intro').textContent = (leaders.length > 1
      ? `换乘站最多的线路是 ${leaders.map((entry) => entry.name).join('、')}，各有 ${topCount} 座换乘站。`
      : `换乘站最多的线路是 ${topLine.name}，沿线有 ${topCount} 座换乘站。`)
      + `下面按经过的线路数排列，只列出前 ${stats.busiestInterchange.length} 座。`;

    const busyRows = $('#busy-rows');
    busyRows.textContent = '';
    stats.busiestInterchange.forEach((hub) => {
      const row = el('tr');
      const nameCell = el('td');
      nameCell.append(stationLink(hub.name));
      const linesCell = el('td');
      linesCell.append(chipRow(hub.lineIds));
      row.append(nameCell, linesCell, el('td', 'num', String(hub.lineIds.length)));
      busyRows.append(row);
    });

    const lineHubRows = $('#line-hub-rows');
    lineHubRows.textContent = '';
    stats.lineInterchangeRanking.slice(0, 8).forEach((entry, position) => {
      const line = graph.lineById.get(entry.id);
      const row = el('tr');
      row.append(el('td', 'rank', String(position + 1)));
      const nameCell = el('td');
      const label = el('span', 'chip-row');
      label.append(chip(entry.id), el('span', null, line.name));
      nameCell.append(label);
      row.append(nameCell, el('td', 'num', String(entry.interchanges)));
      lineHubRows.append(row);
    });

    // --- names ------------------------------------------------------------
    const longest = stats.longestNames[0];
    $('#name-intro').textContent = `最长的站名有 ${longest.length} 个字（${longest}）。`
      + `把所有站名拆成单字来看，出现最多的是「${mostCommon.character}」。`;

    const longestList = $('#longest-names');
    longestList.textContent = '';
    stats.longestNames.forEach((name) => {
      const item = el('li');
      item.append(stationLink(name), el('span', 'length', `${name.length} 字`));
      longestList.append(item);
    });

    const shortestList = $('#shortest-names');
    shortestList.textContent = '';
    stats.shortestNames.forEach((name) => {
      const item = el('li');
      item.append(stationLink(name), el('span', 'length', `${name.length} 字`));
      shortestList.append(item);
    });

    const charList = $('#common-chars');
    charList.textContent = '';
    const peak = stats.commonCharacters[0].count;
    stats.commonCharacters.forEach((entry) => {
      const item = el('li');
      const track = el('span', 'track');
      const bar = el('span', 'fill');
      bar.style.width = `${Math.round(entry.count / peak * 100)}%`;
      track.append(bar);
      item.append(el('span', 'glyph', entry.character), track, el('span', 'amount', String(entry.count)));
      charList.append(item);
    });

    const suffixList = $('#suffix-facts');
    suffixList.textContent = '';
    SUFFIX_QUESTIONS.forEach(([character, key]) => {
      const item = el('li');
      item.append(el('span', null, `站名里有「${character}」`), el('span', 'amount', `${stats.suffix[key]} 座`));
      suffixList.append(item);
    });

    // --- scale ------------------------------------------------------------
    const lineRows = $('#line-rows');
    lineRows.textContent = '';
    stats.lineLengths.forEach((entry, position) => {
      const line = graph.lineById.get(entry.id);
      const row = el('tr');
      row.append(el('td', 'rank', String(position + 1)));
      const nameCell = el('td');
      const label = el('span', 'chip-row');
      label.append(chip(entry.id), el('span', null, line.name));
      nameCell.append(label);
      row.append(nameCell, el('td', 'optional', `${line.from} — ${line.to}`), el('td', 'num', String(entry.count)));
      lineRows.append(row);
    });

    const meta = graph.datasetMeta;
    const collected = meta.collectedAt ? new Date(meta.collectedAt).toLocaleDateString('zh-CN') : '不详';
    $('#records-scope').textContent = `统计基于南京地铁官网票务车站目录（${meta.declaredLines} 条线路、${meta.declaredStations} 座车站，采集于 ${collected}）。`
      + '本页是独立城市指南，非南京地铁官方网站。';
  }

  MetroGraph.load(MetroGraph.DATA_URL).then((loaded) => {
    graph = loaded;
    render();
  }).catch((error) => {
    $('#records-prose').textContent = `线网数据没能载入：${error.message}。请刷新页面重试。`;
  });
})();
