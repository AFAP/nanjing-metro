// Proves the line quiz can actually return every one of the 15 services, so no
// answer combination is a dead end or a silent fallback.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import '../src/quiz-data.js';

const quiz = globalThis.METRO_QUIZ;
const {questions, profiles, lineOrder} = quiz;

const dataset = JSON.parse(await readFile(new URL('../data/stations.json', import.meta.url), 'utf8'));
const stationNames = new Set(dataset.stations.map((s) => s.name));

assert.equal(lineOrder.length, 15, 'expected 15 services');
assert.equal(questions.length, 6, 'expected 6 questions');

// Every profile exists for every line, and every option points at real lines.
assert.deepEqual(Object.keys(profiles).sort(), [...lineOrder].sort(), 'one profile per line');
const nicknames = new Set();
for (const id of lineOrder) {
  const profile = profiles[id];
  assert.ok(profile.nickname && profile.why && profile.traits.length >= 3, `profile ${id} is complete`);
  assert.ok(profile.spotlight.length >= 3, `profile ${id} lists stations`);
  assert.ok(profile.why.length > 20, `profile ${id} explains itself`);
  assert.ok(!nicknames.has(profile.nickname), `nickname ${profile.nickname} is reused`);
  nicknames.add(profile.nickname);
  // Spotlighted stations must exist, otherwise the result card would link to a
  // station the directory does not have.
  for (const name of profile.spotlight) {
    assert.ok(stationNames.has(name), `profile ${id} spotlights unknown station ${name}`);
  }
}
for (const question of questions) {
  assert.ok(question.question && question.options.length === 4, 'each question has 4 options');
  for (const option of question.options) {
    assert.ok(option.label, 'option has a label');
    assert.ok(option.lines.length >= 2 && option.lines.length <= 3, 'option names 2-3 lines');
    for (const id of option.lines) assert.ok(lineOrder.includes(id), `option names unknown line ${id}`);
  }
}

// Exhaustive simulation: 4 options ^ 6 questions.
const winners = new Map();
let combinations = 0;
const answers = new Array(questions.length).fill(0);
const walk = (index) => {
  if (index === questions.length) {
    combinations += 1;
    const ranked = quiz.rank(answers);
    assert.ok(ranked.length > 0, 'scoring produced no lines');
    const top = ranked[0];
    assert.ok(top.points > 0, 'winner must have points');
    // Deterministic: the same answers must always rank the same way.
    assert.deepEqual(quiz.rank(answers.slice()), ranked, 'ranking is deterministic');
    // Sorted strictly by points, descending.
    for (let i = 1; i < ranked.length; i++) assert.ok(ranked[i - 1].points >= ranked[i].points, 'ranking order');
    // Every line named by the chosen options is ranked.
    const named = new Set();
    answers.forEach((choice, q) => questions[q].options[choice].lines.forEach((id) => named.add(id)));
    assert.equal(ranked.length, named.size, 'all named lines appear in the ranking');
    winners.set(top.id, (winners.get(top.id) || 0) + 1);
    return;
  }
  for (let choice = 0; choice < 4; choice++) {
    answers[index] = choice;
    walk(index + 1);
  }
};
walk(0);

assert.equal(combinations, 4 ** 6, 'simulated every combination');
const missing = lineOrder.filter((id) => !winners.has(id));
assert.deepEqual(missing, [], `these lines can never win: ${missing.join(', ')}`);

const summary = [...winners.entries()].sort((a, b) => b[1] - a[1]);
console.log(`PASS: ${combinations} answer combinations, all 15 lines reachable as a result.`);
console.log('      most/least common outcomes: '
  + `${profiles[summary[0][0]].nickname} ${(summary[0][1] / combinations * 100).toFixed(1)}% … `
  + `${profiles[summary.at(-1)[0]].nickname} ${(summary.at(-1)[1] / combinations * 100).toFixed(1)}%`);
