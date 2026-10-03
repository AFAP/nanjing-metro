'use strict';
/* 出站即达 — a searchable index of the official exit information.

   Everything on this page is derived from data/stations.json by
   exit-parser.js; nothing here is authored by hand. */
(() => {
  const $ = (selector) => document.querySelector(selector);
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  };

  const DATA_URL = 'data/stations.json';
  const ROW_LIMIT = 200;
  const state = {spots: [], category: '景点', query: '', station: ''};

  function lineColor(id) {
    const palette = window.LINE_COLORS || {};
    if (palette[id]) return palette[id];
    return typeof LINE_FALLBACK_COLOR !== 'undefined' ? LINE_FALLBACK_COLOR : '#66736a';
  }

  function chip(lineId) {
    const node = el('span', 'line-chip', lineId);
    const color = lineColor(lineId);
    node.style.setProperty('--line-color', color);
    node.style.setProperty('--line-ink', window.LINE_INK ? window.LINE_INK(color) : '#ffffff');
    return node;
  }

  function stationLink(name) {
    const link = el('a', null, name);
    link.href = `./?station=${encodeURIComponent(name)}#station-info`;
    return link;
  }

  /* --- index view -------------------------------------------------------- */

  function matching() {
    const query = state.query.trim();
    return state.spots
      .filter((spot) => {
        if (state.category !== 'all' && spot.category !== state.category) return false;
        if (query && !spot.name.includes(query) && !spot.station.includes(query)) return false;
        return true;
      })
      .sort((a, b) => {
        const da = a.distance == null ? Infinity : a.distance;
        const db = b.distance == null ? Infinity : b.distance;
        return da - db || a.name.localeCompare(b.name, 'zh-Hans-CN');
      });
  }

  function renderFilters() {
    const counts = {};
    state.spots.forEach((spot) => { counts[spot.category] = (counts[spot.category] || 0) + 1; });
    const box = $('#exit-filters');
    box.textContent = '';

    const add = (value, label) => {
      const button = el('button', 'exit-filter', label);
      button.type = 'button';
      button.dataset.category = value;
      const active = state.category === value;
      button.setAttribute('aria-pressed', String(active));
      if (active) button.classList.add('is-active');
      box.append(button);
    };

    add('all', `全部 ${state.spots.length}`);
    window.MetroExits.CATEGORIES.forEach((category) => {
      if (counts[category]) add(category, `${category} ${counts[category]}`);
    });
  }

  function renderIndex() {
    const list = matching();
    const rows = $('#exit-rows');
    rows.textContent = '';

    list.slice(0, ROW_LIMIT).forEach((spot) => {
      const row = el('tr');
      row.append(el('td', null, spot.name));

      const stationCell = el('td');
      const group = el('span', 'exit-station-cell');
      group.append(stationLink(spot.station));
      const lines = el('span', 'chip-row');
      spot.lines.forEach((id) => lines.append(chip(id)));
      group.append(lines);
      stationCell.append(group);
      row.append(stationCell);

      row.append(el('td', 'optional', spot.exit || '未注明'));
      row.append(el('td', 'num', window.MetroExits.formatDistance(spot.distance)));
      rows.append(row);
    });

    const forCategory = state.category === 'all' ? '' : `「${state.category}」`;
    const query = state.query.trim();
    const forQuery = query ? `包含「${query}」的` : '';
    $('#exit-count').textContent = list.length
      ? `共 ${list.length} 条${forCategory}${forQuery}记录。`
      : `没有找到${forQuery}${forCategory}记录。换个说法，或点上面别的类别看看。`;
    $('#exit-table').hidden = list.length === 0;
    $('#exit-more').textContent = list.length > ROW_LIMIT
      ? `先列出最近的 ${ROW_LIMIT} 条，输入关键字或切换类别可以缩小范围。`
      : '';
  }

  /* --- station view ------------------------------------------------------ */

  function renderStation() {
    const station = state.station;
    const mine = state.spots.filter((spot) => spot.station === station);
    const box = $('#station-groups');
    box.textContent = '';

    if (!mine.length) {
      $('#station-title').textContent = `${station} · 出站信息`;
      const lede = $('#station-lede');
      lede.textContent = '官网目录里这一站没有留下出站地点记录，本站目前只能看厕所与车站档案。';
      const link = el('a', null, '去看这座站的档案 →');
      link.href = `./?station=${encodeURIComponent(station)}#station-info`;
      box.append(link);
      return;
    }

    $('#station-title').textContent = `${station} · 从哪个口出去`;
    const lede = $('#station-lede');
    lede.textContent = `官网在这一站记了 ${mine.length} 个地点，按出口分组，组内按步行距离排列。`;
    const lines = el('span', 'chip-row');
    mine[0].lines.forEach((id) => lines.append(chip(id)));
    lede.append(' ', lines);

    window.MetroExits.byExit(mine).forEach((spots, exit) => {
      const group = el('section', 'exit-group');
      const head = el('h3', 'exit-group-head');
      head.append(el('span', 'exit-gate', exit));
      const closest = spots.find((spot) => spot.distance != null);
      head.append(el('span', 'exit-group-meta',
        `${spots.length} 个地点${closest ? ` · 最近 ${window.MetroExits.formatDistance(closest.distance)}` : ''}`));
      group.append(head);

      const list = el('ul', 'exit-list');
      spots.forEach((spot) => {
        const item = el('li');
        item.append(el('span', 'exit-list-name', spot.name));
        item.append(el('span', 'exit-list-category', spot.category));
        item.append(el('span', 'exit-list-distance', window.MetroExits.formatDistance(spot.distance)));
        list.append(item);
      });
      group.append(list);
      box.append(group);
    });
  }

  /* --- wiring ------------------------------------------------------------ */

  function readUrl() {
    const params = new URLSearchParams(location.search);
    const station = params.get('station');
    if (station) state.station = station;
    const category = params.get('category');
    if (category && (category === 'all' || window.MetroExits.CATEGORIES.includes(category))) state.category = category;
    const query = params.get('q');
    if (query) state.query = query;
  }

  function applyMode() {
    const stationMode = Boolean(state.station);
    $('#find-section').hidden = stationMode;
    $('#station-section').hidden = !stationMode;
    if (stationMode) renderStation();
    else renderIndex();
  }

  function buildOptions() {
    const names = new Set();
    state.spots.forEach((spot) => {
      names.add(spot.name);
      names.add(spot.station);
    });
    const datalist = $('#exit-options');
    datalist.textContent = '';
    [...names].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN')).slice(0, 1200).forEach((name) => {
      const option = document.createElement('option');
      option.value = name;
      datalist.append(option);
    });
  }

  $('#exit-search').addEventListener('input', (event) => {
    state.query = event.target.value;
    renderIndex();
  });

  $('#exit-filters').addEventListener('click', (event) => {
    const button = event.target.closest('[data-category]');
    if (!button) return;
    state.category = button.dataset.category;
    renderFilters();
    renderIndex();
  });

  fetch(DATA_URL, {cache: 'no-cache'})
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then((dataset) => {
      state.spots = window.MetroExits.spots(dataset);
      readUrl();
      $('#exit-search').value = state.query;
      buildOptions();
      renderFilters();
      applyMode();

      const meta = dataset.stats || {};
      const collected = dataset.collected_at ? new Date(dataset.collected_at).toLocaleDateString('zh-CN') : '不详';
      $('#exit-scope').textContent = `整理自南京地铁官网出站信息（${meta.stations || '—'} 座车站，采集于 ${collected}）。`
        + '出口编号与距离是自动整理的，可能有错漏，出行以站内标识为准。本页是独立城市指南，非南京地铁官方网站。';
    })
    .catch((error) => {
      $('#exit-count').textContent = `出站信息没能载入：${error.message}。请刷新页面重试。`;
      $('#exit-table').hidden = true;
    });
})();
