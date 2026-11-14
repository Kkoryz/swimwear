import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { balanceSeeds, ensureBank, harvestCredits, seedsByStage } from '../src/bank.mjs';
import { onKeyword, pickQuestions, stageCoverage } from '../src/questions.mjs';

const q = (stage, text, priority = 'high', n = 5) => ({ stage, priority, canonical_question: text, evidence: Array(n).fill('e'), evidence_types: ['paa'] });

test('a question is on the keyword when it names every word of the keyword or of a focus term', () => {
  assert.equal(onKeyword('What costs come with custom printed swimwear?', 'swimwear printing'), true);
  assert.equal(onKeyword('What must a swimwear tech pack contain?', 'swimwear tech pack'), true);
  assert.equal(onKeyword('How is swimwear packaging handled?', 'swimwear tech pack'), false);
  assert.equal(onKeyword('Who grades sizes?', 'swimwear tech pack', ['size grading']), false);
  assert.equal(onKeyword('How does size grading work?', 'swimwear tech pack', ['size grading']), true);
});

test('stage coverage counts the buying stages with an on-keyword question', () => {
  const bank = [q('start', 'Is a swimwear printing business profitable?'), q('find', 'Where do I find swimwear factories?'), q('develop', 'How do I approve printed strike-offs for swimwear?'), q('ship', 'How long does printed swimwear shipping take?')];
  assert.deepEqual(stageCoverage(bank, { keyword: 'swimwear printing' }), ['awareness', 'evaluation', 'decision']);
});

test('the main question takes its stage over a stronger on-keyword question', () => {
  const bank = [
    q('start', 'A1'), q('find', 'S1'),
    q('develop', 'How do I manage print color matching?', 'high', 30), q('develop', 'Should I choose sublimation, digital or screen print?', 'medium', 3),
    q('produce', 'D1'),
  ];
  const picked = pickQuestions(bank, { count: 4, keyword: 'print', must: 'Should I choose sublimation, digital or screen print?' }).map((p) => p.question);
  assert.ok(picked.includes('Should I choose sublimation, digital or screen print?'));
});

test('Serper quote: search + autocomplete for short seeds + community search, skipped seeds free', () => {
  const seeds = [{ seed: 'swimwear print color matching' }, { seed: 'swimwear engineered print placement guide' }, { seed: 'skip me' }];
  assert.equal(harvestCredits(seeds, { harvest: { serperSkip: ['skip me'] } }), 3 + 2);
  assert.equal(harvestCredits(seeds.slice(0, 1), { harvest: { community: 'off' } }), 2);
});

test('pruned seeds are topped up to two per buying stage from the dropped ones; a stage with none is missing', () => {
  const s = (seed, stage) => ({ seed, stage });
  const proposed = [s('a1', 'start'), s('a2', 'start'), s('s1', 'find'), s('v1', 'vet'), s('f1', 'fabric'), s('f2', 'fabric'), s('d1', 'ship'), s('d2', 'ship')];
  const r = balanceSeeds(proposed, { keep: ['a1', 's1', 'd1', 'd2'], add: [s('new eval', 'develop'), s('bad', 'nowhere')] });
  assert.deepEqual(r.restored, ['a2', 'v1']);
  assert.equal(seedsByStage(r.seeds), 'awareness 2, search 1, evaluation 2, decision 2');
  assert.deepEqual(r.missing, []);
  assert.deepEqual(balanceSeeds(proposed.filter((x) => x.stage !== 'find'), { keep: [] }).missing, ['search']);
});

function setup(t, bank, registry) {
  const root = mkdtempSync(join(tmpdir(), 'geo-bank-'));
  t.after(() => rmSync(root, { recursive: true }));
  const runDir = join(root, 'run');
  mkdirSync(runDir);
  mkdirSync(join(root, 'miner', 'runs', 'base'), { recursive: true });
  const bankFile = join(root, 'miner', 'runs', 'base', 'geo-questions.json');
  writeFileSync(bankFile, JSON.stringify(bank));
  if (registry) writeFileSync(join(root, 'miner', 'runs', 'geo-banks.json'), JSON.stringify(registry));
  const config = { keyword: 'swimwear printing', market: 'US (en)', focus_terms: [], question_bank: bankFile, bank_min_stages: 3, miner_dir: join(root, 'miner'), runDir };
  writeFileSync(join(runDir, 'config.json'), JSON.stringify({ keyword: config.keyword, question_bank: bankFile }));
  return { root, config };
}

test('a bank that covers the keyword is kept; otherwise the cached bank for keyword and market is used', async (t) => {
  const covering = [q('start', 'Is swimwear printing profitable?'), q('find', 'Who does swimwear printing?'), q('vet', 'How do I vet a swimwear printing partner?'), q('ship', 'How is swimwear shipped?')];
  // On-keyword in three stages but no decision question at all: the exit check could not pass, so it is not kept.
  const gap = setup(t, covering.slice(0, 3), { 'swimwear printing|US (en)': 'runs/base/geo-questions.json' });
  await assert.rejects(ensureBank(gap.config, { log: () => {}, runMiner: () => assert.fail('no miner run') }), /niche and persona/);
  const kept = setup(t, covering);
  await ensureBank(kept.config, { log: () => {}, runMiner: () => assert.fail('no miner run') });

  const { root, config } = setup(t, [q('start', 'How do I start a swimwear brand?')], { 'swimwear printing|US (en)': 'runs/printing/geo-questions.json' });
  mkdirSync(join(root, 'miner', 'runs', 'printing'));
  writeFileSync(join(root, 'miner', 'runs', 'printing', 'geo-questions.json'), JSON.stringify(covering));
  await ensureBank(config, { log: () => {}, runMiner: () => assert.fail('no miner run') });
  assert.match(config.question_bank, /runs\/printing\/geo-questions\.json$/);
  assert.equal(JSON.parse(readFileSync(join(config.runDir, 'config.json'), 'utf8')).question_bank, config.question_bank);
});
