import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mainFromSource, pickQuestions } from '../src/questions.mjs';

const q = (stage, priority, n, text) => ({ stage, priority, canonical_question: text, evidence: Array(n).fill('e'), evidence_types: ['paa'] });
const bank = [
  q('start', 'high', 9, 'A1'), q('start', 'low', 30, 'A2'),
  q('find', 'high', 23, 'S1'),
  q('vet', 'high', 13, 'E1'), q('fabric', 'high', 37, 'E2'),
  q('produce', 'high', 22, 'D1'),
  q('other', 'high', 99, 'X'),
];

test('picks the best cluster per buying stage, then the next best, in stage order', () => {
  const picked = pickQuestions(bank, { count: 5 });
  assert.deepEqual(picked.map((p) => p.question), ['A1', 'S1', 'E2', 'E1', 'D1']);
  assert.deepEqual(picked.map((p) => p.id), ['q1', 'q2', 'q3', 'q4', 'q5']);
  assert.deepEqual([...new Set(picked.map((p) => p.buying_stage))], ['awareness', 'search', 'evaluation', 'decision']);
});

test('questions naming the keyword rank above better-evidenced off-keyword ones', () => {
  const withKeyword = [...bank, q('vet', 'medium', 5, 'What should I ask a swimwear manufacturer?')];
  const picked = pickQuestions(withKeyword, { count: 5, keyword: 'swimwear manufacturer' });
  assert.equal(picked.find((p) => p.buying_stage === 'evaluation').question, 'What should I ask a swimwear manufacturer?');
});

test('names pick by hand and unknown names fail', () => {
  assert.deepEqual(pickQuestions(bank, { names: ['D1', 'A1'] }).map((p) => p.question), ['A1', 'D1']);
  assert.throws(() => pickQuestions(bank, { names: ['nope'] }), /not in bank/);
});

test('a main question the topic bank lacks comes from the site bank it was chosen from, and is picked', () => {
  const site = [q('develop', 'high', 4, 'How should I arrange swimwear fit testing?')];
  const main = mainFromSource(bank, 'How should I arrange swimwear fit testing?', site);
  assert.equal(main.canonical_question, 'How should I arrange swimwear fit testing?');
  const picked = pickQuestions([...bank, main], { must: main.canonical_question });
  assert.ok(picked.some((p) => p.question === 'How should I arrange swimwear fit testing?'));
  assert.equal(mainFromSource(bank, 'Not in either bank?', site), null);
  assert.equal(mainFromSource(bank, 'A1', site), null);
});
