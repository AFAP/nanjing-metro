'use strict';
(() => {
  const $ = s => document.querySelector(s);
  const html = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const normalize = s => s.replace(/[\s·•・]/g, '').replace(/站$/, '');
  const colors = {'1':'#188bc4','2':'#db4651','3':'#4f9d73','4':'#9278b5','5':'#bd9b21','6':'#42b7c6','7':'#599768','10':'#c58d30','S1':'#32a8ad','S2':'#bb5269','S3':'#b67ead','S6':'#c79bb9','S7':'#d892af','S8':'#e98a44','S9':'#dca33b'};
  const badges = ids => ids.map(id => `<span class="small-badge" style="--line-color:${colors[id] || '#66736a'}">${html(id)}</span>`).join('');
  const date = value => value ? value.slice(0,10) : '页面未注明日期';
  let data, reviews = {}, activeId, localReviews = false;
  const editMode = new URLSearchParams(location.search).get("edit") === "1";
  const publicNote = text => String(text).replace("具体位置优先人工核对", "具体位置以站内标识为准").replaceAll("待核对", "需现场确认").replace("供核对", "供对照");
  const availability = s => reviews[s.id]?.toilet_availability || s.toilets.availability;
  const hasLocation = s => availability(s) !== 'unavailable' && (Boolean(reviews[s.id]?.toilet_location?.trim()) || s.toilets.locations.length > 0);
  const statusText = s => availability(s) === 'unavailable' ? '本站未设厕所' : availability(s) === 'unknown' ? '厕所状态待确认' : hasLocation(s) ? '已有位置提示' : '有厕所 · 位置待补充';
  const reviewed = s => Boolean(reviews[s.id]?.human_verified);
  const sourceLink = id => {
    const source = data.sources.find(s => s.id === id);
    if (!source) return '';
    const asOf = source.information_as_of || source.published_at;
    return `<a href="${html(source.url)}" target="_blank" rel="noopener noreferrer">${html(source.title)} ↗</a><span>${html(asOf || '来源未标注日期')}</span>`;
  };
  function matches(s) {
    const query = normalize($('#station-search').value.trim());
    if (query && ![s.name, ...s.aliases].some(n => normalize(n).includes(query))) return false;
    const line = $('#station-line-filter').value;
    if (line !== 'all' && !s.line_ids.includes(line)) return false;
    const status = $('#station-status-filter').value;
    return status === 'all' || status === 'located' && hasLocation(s) || status === 'precise' && availability(s) !== 'unavailable' && s.toilets.locations.some(l => ['direction','floor','exit'].includes(l.precision)) || status === 'missing' && availability(s) === 'available' && !hasLocation(s) || status === 'unavailable' && availability(s) === 'unavailable';
  }
  function summary() {
    $('#station-data-summary').innerHTML = `<div><strong>${data.stats.stations}</strong><span>座车站</span></div><div><strong>${data.stations.filter(hasLocation).length}</strong><span>站有位置提示</span></div><div><strong>${data.stations.filter(s => availability(s) === 'available' && !hasLocation(s)).length}</strong><span>站位置待补</span></div><p>资料收集于 ${date(data.collected_at)}<br>具体入口与开放情况以站内标识为准</p>`;
  }
  function renderResults() {
    const stations = data.stations.filter(matches);
    $('#station-result-count').textContent = `找到 ${stations.length} 座车站`;
    $('#station-results').innerHTML = stations.length ? stations.map(s => `<button class="station-result ${s.id === activeId ? 'selected' : ''}" data-station-id="${s.id}" aria-pressed="${s.id === activeId}"><span class="station-result-top"><strong>${html(s.name)}</strong><span class="small-badges">${badges(s.line_ids)}</span></span><span class="station-result-bottom"><span class="${availability(s) === 'unavailable' ? 'no-toilet' : ''}">${statusText(s)}</span></span></button>`).join('') : '<div class="station-empty"><strong>没有找到匹配的车站</strong><p>试试缩短站名，或切换筛选条件。</p><button type="button" id="clear-station-filters">清除筛选</button></div>';
    if (stations.length && !stations.some(s => s.id === activeId)) { activeId = stations[0].id; renderDetail(); renderResults(); }
    else if (!stations.length) { activeId = null; $('#station-detail').innerHTML = '<div class="station-empty"><p>调整搜索条件后，选择一座车站查看资料。</p></div>'; }
    summary();
  }
  function renderDetail() {
    const s = data.stations.find(s => s.id === activeId); if (!s) return;
    const review = reviews[s.id] || {};
    const available = s.toilets.availability === 'available';
    const manual = review.toilet_location || review.toilet_availability || review.notes;
    $('#station-detail').innerHTML = `<header class="station-detail-header"><div><p class="panel-kicker">STATION / 车站档案</p><h3 tabindex="-1">${html(s.name)}${s.name.endsWith('站') ? '' : '<small>站</small>'}</h3><div class="small-badges">${badges(s.line_ids)}</div></div></header>
      <section class="toilet-section" aria-label="厕所位置"><div class="toilet-heading"><svg viewBox="0 0 30 30" aria-hidden="true"><circle cx="8" cy="5" r="2.4"/><circle cx="22" cy="5" r="2.4"/><path d="M4 10h8v8H4zm2 8v8m4-8v8m9-16h6l3 10H16zm1 10v6m4-6v6M15 2v26"/></svg><div><p>最先知道的那件小事</p><h4>${availability(s) === 'available' ? '厕所在哪儿？' : availability(s) === 'unavailable' ? '本站未设厕所' : '厕所状态待确认'}</h4></div></div>
      ${manual ? `<div class="manual-location"><span>补充位置</span>${review.toilet_availability ? `<p>厕所状态：${html({'available':'有厕所','unavailable':'未设厕所','unknown':'待确认'}[review.toilet_availability])}</p>` : ''}${review.toilet_location ? `<p>${html(review.toilet_location)}</p>` : ''}${review.notes ? `<p class="manual-notes">${html(review.notes)}</p>` : ''}<small>记录日期 ${html(date(review.updated_at))}</small></div><p class="original-facts-label">其他来源的位置提示。</p>` : ''}
      ${s.toilets.locations.length ? `<div class="toilet-locations">${s.toilets.locations.map(l => `<div class="toilet-location"><div class="location-meta"><span>${l.line_ids.length ? l.line_ids.map(id => `${id} 号线`).join(' / ') : '来源未细分线路'}</span><span>${l.paid_area === 'unpaid' ? '非付费区' : l.paid_area === 'paid' ? '付费区内' : l.paid_area === 'outside' ? '站外' : '付费区未注明'}</span></div><p>${html(l.description)}</p>${l.notes ? `<p class="location-note">${html(publicNote(l.notes))}</p>` : ''}<div class="location-source">${sourceLink(l.source_id)}</div></div>`).join('')}</div>` : `<div class="toilet-unknown"><p>${available ? '官网确认设有厕所，具体楼层、方向和出口位置仍待补充。' : '官网卫生间提示未列本站设置厕所。可查看沿线这些邻近车站：'}</p>${s.toilets.nearby_alternatives.map(a => `<button type="button" class="alternative-station" data-station-id="${a.station_id}">${html(a.station_name)}<span>${a.line_id} 号线 · ${a.stops} 站</span> ↗${a.note ? `<small>${html(a.note)}</small>` : ''}</button>`).join('')}<div class="location-source">${sourceLink('official-toilets')}</div></div>`}
      <details class="station-line-toilets"><summary>各线路站层是否设有厕所</summary><ul>${s.toilets.by_line.map(b => `<li><span>${b.line_id} 号线</span><span>${b.availability === 'available' ? '官方总表列为有厕所' : '官方总表未列设置厕所'}</span></li>`).join('')}</ul><div class="location-source">${sourceLink('official-toilets')}</div></details>
      ${s.toilets.notes.length ? `<div class="station-notes">${s.toilets.notes.map(n => `<p>${html(publicNote(n))}</p>`).join('')}</div>` : ''}
      </section>
      <details class="station-more"><summary>车站简介与出站周边<span>官方资料</span></summary><div>${s.introduction.map(i => `<p class="station-intro-fact">${html(i.text)}</p><div class="location-source">${sourceLink(i.source_id)}</div>`).join('')}${s.nearby.map(n => `<div class="nearby-fact"><h5>${html(n.category)}</h5><p>${html(n.description)}</p></div>`).join('')}${s.source_ids.filter(id => id.startsWith('exits-')).map(id => `<div class="location-source">${sourceLink(id)}</div>`).join('')}</div></details>
      ${editMode && localReviews ? `<details class="station-review"><summary><span>逐站人工核对</span><span>${reviewed(s) ? '已记录' : '补充位置与备注'}</span></summary><form id="station-review-form"><p>核对完成后再勾选。记录会保存在本地项目中，资料更新时也会保留。</p><label>厕所状态补充<select name="toilet_availability"><option value="">沿用收集资料</option><option value="available">有厕所</option><option value="unavailable">未设厕所</option><option value="unknown">待确认</option></select></label><label>实际厕所位置<textarea name="toilet_location" rows="3" maxlength="2000" placeholder="例如：2 号线 B2 站台西端，付费区内；也可注明是否需出站。">${html(review.toilet_location || '')}</textarea></label><label>核对备注 / 补充来源<textarea name="notes" rows="2" maxlength="4000" placeholder="填写现场核对日期、资料链接或仍需确认的事项。">${html(review.notes || '')}</textarea></label><label class="review-checkbox"><input name="human_verified" type="checkbox" ${reviewed(s) ? 'checked' : ''}><span>我已人工核对本车站的厕所资料</span></label><button class="save-review" type="submit" ${localReviews ? '' : 'disabled'}>保存核对记录 <span aria-hidden="true">↗</span></button><output id="review-save-status" aria-live="polite">${localReviews ? '' : '请使用本地启动脚本打开网站，才能保存到项目文件。'}</output></form></details>
      ` : ''}
      <p class="station-collected">收集日期 ${date(s.collected_at)} · ${s.source_ids.length} 个可追溯来源</p>`;
    const editor = $('#station-review-form');
    if (editor) editor.elements.toilet_availability.value = review.toilet_availability || '';
  }
  function selectStation(id, scroll = false) {
    const target = data.stations.find(s => s.id === id); if (!target) return;
    if (!matches(target)) { $('#station-search').value=''; $('#station-line-filter').value='all'; $('#station-status-filter').value='all'; }
    activeId = id; renderDetail(); renderResults();
    const mobile = matchMedia('(max-width:700px)').matches;
    if (scroll || mobile) $(mobile ? '#station-detail' : '#station-info').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',block:'start'});
  }
  window.openStationInfo = name => {
    if (!data) return;
    const station = data.stations.find(s => [s.name,...s.aliases].some(n => normalize(n) === normalize(name))) || (name.includes('·') ? data.stations.find(s => s.name === name.split('·')[0]) : null);
    if (station) { $('#station-search').value=''; $('#station-line-filter').value='all'; $('#station-status-filter').value='all'; selectStation(station.id,true); }
  };
  $('#station-results').addEventListener('click', e => {
    const button = e.target.closest('[data-station-id]'); if (button) selectStation(button.dataset.stationId);
    if (e.target.closest('#clear-station-filters')) { $('#station-search').value=''; $('#station-line-filter').value='all'; $('#station-status-filter').value='all'; renderResults(); }
  });
  $('#station-detail').addEventListener('click', e => { const button = e.target.closest('[data-station-id]'); if (button) selectStation(button.dataset.stationId); });
  $('#station-detail').addEventListener('submit', async e => {
    if (e.target.id !== 'station-review-form') return; e.preventDefault();
    const id = activeId, form = e.target, output = $('#review-save-status'), button = form.querySelector('button[type="submit"]');
    const values = new FormData(form);
    button.disabled = true; output.textContent = '正在保存…';
    try {
      const response = await fetch('/api/reviews/'+encodeURIComponent(id), {method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({human_verified:form.elements.human_verified.checked,toilet_location:values.get('toilet_location').trim(),toilet_availability:values.get('toilet_availability') || null,notes:values.get('notes').trim()})});
      if (!response.ok) throw new Error('保存失败');
      const saved = await response.json(); reviews[id] = saved; renderResults();
      if (activeId === id) { renderDetail(); $('.station-review').open=true; $('#review-save-status').textContent='已保存到本地核对文件。'; }
    } catch { output.textContent='保存失败，内容仍留在表单中。请确认本地服务正在运行后重试。'; button.disabled=false; }
  });
  for (const selector of ['#station-search','#station-line-filter','#station-status-filter']) $(selector).addEventListener(selector === '#station-search' ? 'input' : 'change', renderResults);
  async function load() {
    try {
      const response = await fetch('data/stations.json'); if (!response.ok) throw new Error('Dataset unavailable'); data = await response.json();
      if (typeof LINES !== 'undefined') for (const line of data.lines) {
        const mapped = LINES.find(l => l.id === line.id); if (!mapped) continue;
        let names = line.station_ids.map(id => data.stations.find(s => s.id === id).name);
        if (normalize(names[names.length-1]) === normalize(mapped.from)) names.reverse();
        mapped.stations = names.join('|');
      }
      if (typeof renderPanel === 'function' && typeof selected !== 'undefined') renderPanel(selected);
      try { const response = await fetch('/api/reviews'); if (response.ok) { const result = await response.json(); reviews=result.reviews; localReviews=true; $('#download-station-data').href='/api/stations/export'; } } catch {}
      $('#station-line-filter').innerHTML = '<option value="all">全部线路</option>'+data.lines.map(l => `<option value="${l.id}">${html(l.name)}</option>`).join('');
      const requested = new URLSearchParams(location.search).get('station');
      activeId = (data.stations.find(s => normalize(s.name) === normalize(requested || '新街口')) || data.stations[0]).id; renderDetail(); renderResults();
      if (requested) selectStation(activeId,true);
    } catch { $('#station-data-summary').textContent='车站资料加载失败。'; $('#station-detail').innerHTML='<p>请刷新页面重试，并确认 data/stations.json 文件完整。</p>'; }
  }
  load();
})();
