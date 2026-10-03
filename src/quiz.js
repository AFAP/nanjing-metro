'use strict';
/* Line personality quiz: six questions, one line as the answer. */
(() => {
  const $ = (selector) => document.querySelector(selector);
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  };

  const quiz = globalThis.METRO_QUIZ;
  const {questions, profiles} = quiz;

  const quizBox = $('#quiz');
  const resultBox = $('#quiz-result');
  const errorBox = $('#quiz-error');
  const stepLabel = $('#quiz-step');
  const fill = $('#quiz-fill');
  const legend = $('#quiz-question');
  const optionBox = $('#quiz-options');
  const backButton = $('#quiz-back');

  let graph = null;
  let answers = [];
  let index = 0;

  function lineOf(id) { return graph.lineById.get(id); }

  function chip(lineId) {
    const node = el('span', 'line-chip', lineId);
    const color = lineOf(lineId).color;
    node.style.setProperty('--line-color', color);
    node.style.setProperty('--line-ink', LINE_INK(color));
    return node;
  }

  function stationLink(name) {
    const link = el('a', null, name);
    link.href = `./?station=${encodeURIComponent(name)}#station-info`;
    return link;
  }

  function renderQuestion() {
    const question = questions[index];
    stepLabel.textContent = `第 ${index + 1} 题 / 共 ${questions.length} 题`;
    fill.style.width = `${(index / questions.length) * 100}%`;
    legend.textContent = question.question;
    optionBox.textContent = '';
    question.options.forEach((option, optionIndex) => {
      const button = el('button', 'quiz-option');
      button.type = 'button';
      button.append(el('span', 'key', String.fromCharCode(65 + optionIndex)), el('span', null, option.label));
      button.addEventListener('click', () => choose(optionIndex));
      optionBox.append(button);
    });
    backButton.disabled = index === 0;
  }

  function choose(optionIndex) {
    answers[index] = optionIndex;
    if (index < questions.length - 1) {
      index += 1;
      renderQuestion();
      legend.scrollIntoView({block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
      return;
    }
    fill.style.width = '100%';
    renderResult();
  }

  function renderResult() {
    const ranked = quiz.rank(answers);
    const best = ranked[0];
    const profile = profiles[best.id];
    const line = lineOf(best.id);
    const sequence = graph.sequence(best.id);

    quizBox.hidden = true;
    resultBox.textContent = '';

    const card = el('article', 'quiz-result');
    card.style.setProperty('--line-color', line.color);

    const head = el('div', 'quiz-result-head');
    head.append(el('p', 'kicker', '最像你的线路'));
    const title = el('h2');
    title.append(chip(best.id), document.createTextNode(` ${profile.nickname}`), el('span', 'line-id', line.name));
    head.append(title);
    card.append(head);

    const body = el('div', 'quiz-result-body');
    body.append(el('p', null, profile.why));

    const traits = el('ul', 'quiz-traits');
    profile.traits.forEach((trait) => traits.append(el('li', null, trait)));
    body.append(traits);

    const meta = el('div', 'quiz-result-meta');
    const rows = [
      ['走向', `${line.from} — ${line.to}`],
      ['车站数', `${sequence.length} 站`],
      ['沿线看看', profile.spotlight.filter((name) => graph.stationNames.indexOf(name) !== -1)]
    ];
    for (const [label, value] of rows) {
      const row = el('div');
      row.append(el('span', 'label', label));
      if (Array.isArray(value)) {
        const list = el('span', 'chip-row');
        value.forEach((name, position) => {
          if (position) list.append(document.createTextNode(' · '));
          list.append(stationLink(name));
        });
        row.append(list);
      } else {
        row.append(el('span', null, value));
      }
      meta.append(row);
    }
    body.append(meta);

    if (ranked[1]) {
      const runnerUp = el('p', 'quiz-runner-up');
      runnerUp.append(document.createTextNode('第二接近的是 '));
      const strong = el('b', null, `${profiles[ranked[1].id].nickname}（${ranked[1].id}号线）`);
      runnerUp.append(strong, document.createTextNode('。'));
      body.append(runnerUp);
    }

    const actions = el('div', 'quiz-nav');
    const plan = el('a', 'ex-btn ex-btn--primary', '沿这条线走一程 →');
    plan.href = `transfer.html?from=${encodeURIComponent(line.from)}&to=${encodeURIComponent(line.to)}`;
    const again = el('button', 'ex-btn', '再测一次');
    again.type = 'button';
    again.addEventListener('click', restart);
    actions.append(plan, again);
    body.append(actions);

    card.append(body);
    resultBox.append(card);
    card.scrollIntoView({block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
  }

  function restart() {
    answers = [];
    index = 0;
    resultBox.textContent = '';
    quizBox.hidden = false;
    renderQuestion();
    legend.scrollIntoView({block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
  }

  backButton.addEventListener('click', () => {
    if (index === 0) return;
    index -= 1;
    renderQuestion();
  });
  $('#quiz-restart').addEventListener('click', restart);

  MetroGraph.load(MetroGraph.DATA_URL).then((loaded) => {
    graph = loaded;
    errorBox.textContent = '';
    renderQuestion();
  }).catch((error) => {
    errorBox.textContent = `线网数据没能载入：${error.message}。请刷新页面重试。`;
    stepLabel.textContent = '无法开始';
    legend.textContent = '线网数据加载失败';
    optionBox.textContent = '';
  });
})();
