import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exitCheck, exitWarnings } from '../src/exit-check.mjs';

const engines = ['chatgpt', 'claude', 'perplexity'];
const stages = ['awareness', 'search', 'evaluation', 'decision'];

// A minimal run that passes: 4 questions, 3 engines, 1 run.
function makeRun(mutate = (x) => x) {
  const dir = mkdtempSync(join(tmpdir(), 'geo-check-'));
  const data = {
    questions: stages.map((s, i) => ({ id: `q${i + 1}`, buying_stage: s, question: `Q${i + 1}?`, evidence: ['real ask'] })),
    receipts: [],
    gaps: {},
    outline: { sections: [] },
  };
  for (const q of data.questions) {
    for (const e of engines) data.receipts.push({ name: `${q.id}-${e}-r1.json`, body: { question_id: q.id, engine: e, run: 1, answer_text: 'answer', citations: [{ url: `https://site.com/${q.id}` }] } });
    data.gaps[q.id] = {
      question_id: q.id,
      consensus: [{ id: `${q.id}-c1`, claim: 'all say x', engines, receipts: engines.map((e) => `${q.id}-${e}-r1.json`), source_urls: [`https://site.com/${q.id}?utm_source=chatgpt.com`] }],
      missing: [{ id: `${q.id}-m1`, point: 'none say y', type: 'original_data', fill_with: 'our test data' }],
      our_angle: [{ id: `${q.id}-a1`, what_we_add: 'z', fills: [`${q.id}-m1`] }],
    };
    data.outline.sections.push({ id: `s-${q.id}`, question_id: q.id, heading: 'h', covers: [`${q.id}-m1`, `${q.id}-a1`], sources: [`https://site.com/${q.id}`] });
  }
  mutate(data);
  writeFileSync(join(dir, '01-questions.json'), JSON.stringify({ questions: data.questions }));
  mkdirSync(join(dir, '02-receipts'));
  for (const r of data.receipts) writeFileSync(join(dir, '02-receipts', r.name), JSON.stringify(r.body));
  mkdirSync(join(dir, '04-gaps'));
  for (const g of Object.values(data.gaps)) writeFileSync(join(dir, '04-gaps', `${g.question_id}.json`), JSON.stringify(g));
  writeFileSync(join(dir, '05-outline.json'), JSON.stringify(data.outline));
  return { runDir: dir, questions_count: 4, engines, runs: 1, consensus_min_share: 0.6 };
}

test('a consistent run passes', (t) => {
  const config = makeRun();
  t.after(() => rmSync(config.runDir, { recursive: true }));
  assert.deepEqual(exitCheck(config), []);
});

test('an unavailable receipt is a warning, not a failure, and does not count toward consensus', (t) => {
  const config = makeRun((d) => {
    const r = d.receipts.find((x) => x.name === 'q1-perplexity-r1.json');
    r.body = { ...r.body, status: 'unavailable', answer_text: '', citations: [], notes: 'Perplexity free search limit reached' };
    d.gaps.q1.consensus[0].receipts = ['q1-chatgpt-r1.json', 'q1-claude-r1.json'];
    d.gaps.q1.consensus[0].source_urls = [];
  });
  t.after(() => rmSync(config.runDir, { recursive: true }));
  assert.deepEqual(exitCheck(config), []);
  assert.deepEqual(exitWarnings(config), ['q1-perplexity-r1.json: Perplexity free search limit reached']);
});

const cases = [
  ['missing receipt', (d) => { d.receipts.pop(); }, /receipt missing q4-perplexity-r1.json/],
  ['uncovered stage', (d) => { d.questions[3].buying_stage = 'search'; }, /buying stage not covered: decision/],
  ['thin consensus', (d) => { d.gaps.q1.consensus[0].receipts = ['q1-chatgpt-r1.json']; }, /q1\/q1-c1: consensus backed by 1 receipts, needs 2/],
  ['invented url', (d) => { d.gaps.q2.consensus[0].source_urls = ['https://made.up/x']; }, /url not in receipts/],
  ['untyped gap', (d) => { delete d.gaps.q3.missing[0].type; }, /gap type must be one of/],
  ['gap without fill', (d) => { delete d.gaps.q3.missing[0].fill_with; }, /names nothing we can fill/],
  ['consensus-only section', (d) => { d.outline.sections[0].covers = ['q1-a1']; }, /q1: section covers no gap/],
  ['two sections', (d) => { d.outline.sections.push({ ...d.outline.sections[1] }); }, /q2: expected exactly 1 outline section, got 2/],
  ['no source', (d) => { d.outline.sections[2].sources = []; }, /q3: section has no verifiable source/],
  ['angle not covered', (d) => { d.outline.sections[3].covers = ['q4-m1']; }, /q4: section does not cover q4-a1/],
];
for (const [name, mutate, expected] of cases) {
  test(`fails on ${name}`, (t) => {
    const config = makeRun(mutate);
    t.after(() => rmSync(config.runDir, { recursive: true }));
    const failures = exitCheck(config);
    assert.ok(failures.some((f) => expected.test(f)), failures.join('\n'));
  });
}
