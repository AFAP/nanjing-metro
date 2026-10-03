'use strict';
/* Transfer lab: plan a journey, then report the interchange structure. */
(() => {
  const $ = (selector) => document.querySelector(selector);
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  };

  const fromInput = $('#from-input');
  const toInput = $('#to-input');
  const errorBox = $('#planner-error');
  const routeBox = $('#route');
  const optionList = $('#station-options');

  // Well-known stations make "随机来一段" produce journeys worth reading.
  const NOTABLE = ['新街口', '南京南站', '南京站', '鼓楼', '鸡鸣寺', '夫子庙', '大行宫', '玄武门', '禄口机场',
    '栖霞山', '金牛湖', '高淳', '无想山', '经天路', '鱼嘴', '林场', '句容', '太白', '竹山路', '泰冯路', '元通', '马群'];

  let graph = null;

  function colorOf(lineId) {
    const line = graph.lineById.get(lineId);
    return line ? line.color : '#66736a';
  }

  function chip(lineId) {
    const node = el('span', 'line-chip', lineId);
    const color = colorOf(lineId);
    node.style.setProperty('--line-color', color);
    node.style.setProperty('--line-ink', LINE_INK(color));
    return node;
  }

  function resolve(value) {
    const raw = String(value == null ? '' : value).trim();
    if (!raw) return null;
    if (graph.stationNames.indexOf(raw) !== -1) return raw;
    const wanted = MetroGraph.normalize(raw);
    return graph.stationNames.find((name) => MetroGraph.normalize(name) === wanted) || null;
  }

  function figure(count, unit) {
    const node = el('span');
    node.append(el('span', 'count', String(count)), el('span', 'unit', unit));
    return node;
  }

  function buildSummary(from, to, route) {
    const summary = el('p', 'route-summary');
    summary.append(figure(route.transfers, '次换乘'), figure(route.stops, '站'));
    const journey = el('span', 'journey', `${from} → ${to}`);
    summary.append(journey);
    const lines = el('span', 'chip-row');
    route.legs.forEach((leg, index) => {
      if (index) lines.append(document.createTextNode('→'));
      lines.append(chip(leg.lineId));
    });
    summary.append(lines);
    return summary;
  }

  function buildChange(station, nextLineId) {
    const item = el('li', 'leg-change');
    item.style.setProperty('--change-color', colorOf(nextLineId));
    const mark = el('span', 'change-mark');
    mark.setAttribute('aria-hidden', 'true');
    const text = el('p');
    text.append(el('span', 'marker-label', '在 '), el('b', null, station), el('span', 'marker-label', ' 换乘 '), chip(nextLineId), el('span', 'marker-label', '号线'));
    item.append(mark, text);
    return item;
  }

  function buildLegs(route) {
    const list = el('ol', 'legs');
    route.legs.forEach((leg, index) => {
      const line = graph.lineById.get(leg.lineId);
      const item = el('li', 'leg');
      item.style.setProperty('--line-color', line.color);
      const rail = el('span', 'leg-rail');
      rail.setAttribute('aria-hidden', 'true');
      const body = el('div', 'leg-body');
      const stations = el('p', 'leg-stations');
      stations.append(el('b', null, leg.from), el('span', 'to', '→'), el('b', null, leg.to));
      const meta = el('p', 'leg-meta');
      meta.append(chip(leg.lineId), el('span', null, `${line.name} · 乘坐 ${leg.stops} 站`));
      body.append(stations, meta);
      item.append(rail, body);
      list.append(item);
      if (index < route.legs.length - 1) list.append(buildChange(leg.to, route.legs[index + 1].lineId));
    });
    return list;
  }

  function buildAlert(route) {
    const node = el('p', 'route-alert');
    if (!route.outOfStation.length) return node;
    const notice = route.outOfStation[0];
    node.append(el('b', null, '这一程需要出站换乘：'), document.createTextNode(notice.note));
    return node;
  }

  function buildAlternative(route) {
    const node = el('p', 'route-alternative');
    if (!route) return node;
    node.append(el('span', null, '另一种走法：'), figure(route.transfers, '次换乘'), figure(route.stops, '站'));
    const lines = el('span', 'chip-row');
    route.legs.forEach((leg, index) => {
      if (index) lines.append(document.createTextNode('→'));
      lines.append(chip(leg.lineId));
    });
    node.append(lines);
    if (route.outOfStation.length) node.append(el('span', null, '（其中一次需出站换乘）'));
    return node;
  }

  function renderRoute() {
    const rawFrom = fromInput.value.trim();
    const rawTo = toInput.value.trim();
    const from = resolve(rawFrom);
    const to = resolve(rawTo);

    fromInput.setAttribute('aria-invalid', String(Boolean(rawFrom) && !from));
    toInput.setAttribute('aria-invalid', String(Boolean(rawTo) && !to));

    routeBox.hidden = true;
    routeBox.textContent = '';

    if (!rawFrom && !rawTo) { errorBox.textContent = ''; return; }
    if (!from || !to) {
      // One field may simply still be empty while the other is filled in.
      const missing = !from ? rawFrom : rawTo;
      errorBox.textContent = missing
        ? `没有找到「${missing}」这一站。试试输入完整站名，或从联想列表里选择。`
        : '';
      return;
    }

    const result = graph.plan(from, to);
    if (!result.ok) {
      errorBox.textContent = result.reason === 'same-station'
        ? '起点和终点是同一站，换一段试试。'
        : '这两站之间没有找到可行路径。';
      return;
    }

    errorBox.textContent = '';
    routeBox.hidden = false;
    routeBox.append(
      buildSummary(from, to, result.primary),
      buildLegs(result.primary),
      buildAlert(result.primary),
      buildAlternative(result.alternative)
    );
  }

  function renderInterchanges() {
    const stats = graph.stats;
    const busiest = stats.busiestInterchange[0];
    $('#hub-intro').textContent = `全网络 ${stats.uniqueStations} 座车站里，${stats.interchangeCount} 座有两条以上线路经过。`
      + `${busiest.name}以 ${busiest.lineIds.length} 条线路成为全网络交汇最多的车站。`;

    const hubRows = $('#hub-rows');
    hubRows.textContent = '';
    graph.interchangeStations.forEach((hub, index) => {
      const row = el('tr');
      row.append(el('td', 'rank', String(index + 1)));
      const nameCell = el('td');
      const link = el('a', null, hub.name);
      link.href = `./?station=${encodeURIComponent(hub.name)}#station-info`;
      nameCell.append(link);
      const linesCell = el('td');
      const chips = el('span', 'chip-row');
      hub.lineIds.forEach((id) => chips.append(chip(id)));
      linesCell.append(chips);
      row.append(nameCell, linesCell, el('td', 'num', String(hub.lineIds.length)));
      hubRows.append(row);
    });

    const lineRows = $('#line-hub-rows');
    lineRows.textContent = '';
    stats.lineInterchangeRanking.forEach((entry, index) => {
      const line = graph.lineById.get(entry.id);
      const row = el('tr');
      row.append(el('td', 'rank', String(index + 1)));
      const nameCell = el('td');
      const chips = el('span', 'chip-row');
      chips.append(chip(entry.id), el('span', null, line.name));
      nameCell.append(chips);
      row.append(nameCell, el('td', 'optional', `${line.from} — ${line.to}`), el('td', 'num', String(entry.interchanges)));
      lineRows.append(row);
    });

    // Several lines share each extreme (2/5/7 sit at 10 interchange stations;
    // S2/S6/S7/S8/S9 sit at 1), so name every line tied at that count instead
    // of presenting one of them as the sole winner.
    const ranking = stats.lineInterchangeRanking;
    const describe = (count) => {
      const entries = ranking.filter((entry) => entry.interchanges === count);
      const names = entries.map((entry) => entry.name).join('、');
      return entries.length > 1 ? `${names}，并列 ${count} 座` : `${names}（${count} 座）`;
    };
    $('#single-line-note').textContent = `换乘站最多的是 ${describe(ranking[0].interchanges)}；`
      + `最少的是 ${describe(ranking[ranking.length - 1].interchanges)}。`
      + `另外 ${stats.singleLineStations} 座车站只有一条线路经过。`;

    const meta = graph.datasetMeta;
    const collected = meta.collectedAt ? new Date(meta.collectedAt).toLocaleDateString('zh-CN') : '不详';
    $('#data-scope').textContent = `规划基于南京地铁官网票务车站目录：${meta.declaredLines} 条线路、${meta.declaredStations} 座车站，采集于 ${collected}。`
      + `站序与线路归属以该目录为准，不含站内步行时间与首末班时刻。`;
  }

  function randomRoute() {
    const pool = NOTABLE.filter((name) => graph.stationNames.indexOf(name) !== -1);
    const source = pool.length >= 2 ? pool : graph.stationNames;
    const a = source[Math.floor(Math.random() * source.length)];
    let b = a;
    while (b === a) b = source[Math.floor(Math.random() * source.length)];
    fromInput.value = a;
    toInput.value = b;
    renderRoute();
  }

  function wire() {
    optionList.textContent = '';
    for (const name of graph.stationNames) {
      const option = document.createElement('option');
      option.value = name;
      optionList.append(option);
    }
    for (const input of [fromInput, toInput]) {
      input.addEventListener('input', renderRoute);
      input.addEventListener('change', renderRoute);
    }
    $('#swap').addEventListener('click', () => {
      const held = fromInput.value;
      fromInput.value = toInput.value;
      toInput.value = held;
      renderRoute();
    });
    $('#random-route').addEventListener('click', randomRoute);
    $('#clear-route').addEventListener('click', () => {
      fromInput.value = '';
      toInput.value = '';
      renderRoute();
      fromInput.focus();
    });
  }

  function fail(error) {
    errorBox.textContent = `线网数据没能载入：${error.message}。请刷新页面重试。`;
    for (const control of [fromInput, toInput, $('#swap'), $('#random-route'), $('#clear-route')]) control.disabled = true;
  }

  MetroGraph.load(MetroGraph.DATA_URL).then((loaded) => {
    graph = loaded;
    errorBox.textContent = '';
    wire();
    renderInterchanges();
    // Honour ?from=&to= so a route can be linked to directly.
    const params = new URLSearchParams(location.search);
    if (params.get('from')) fromInput.value = params.get('from');
    if (params.get('to')) toInput.value = params.get('to');
    if (fromInput.value || toInput.value) renderRoute();
  }).catch(fail);
})();
