import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../src/config.mjs';
import { articleExamples, prompt } from '../src/judge.mjs';
import { pickQuestions, stageCoverage } from '../src/questions.mjs';
import { balanceSeeds } from '../src/bank.mjs';

// A service trade names its own stages; the manufacturer's default stays as it was.
const SERVICE = { start: 'awareness', find: 'search', vet: 'evaluation', fees: 'evaluation', contract: 'decision', handover: 'decision' };
const q = (stage, text) => ({ stage, priority: 'high', canonical_question: text, evidence: ['e'], evidence_types: ['paa'] });

test('a trade\'s own stages sort its bank into the four buying stages', () => {
  const bank = [q('start', 'A'), q('find', 'S'), q('fees', 'E'), q('contract', 'D'), q('fabric', 'X')];
  assert.deepEqual(pickQuestions(bank, { count: 5, stages: SERVICE }).map((p) => p.question), ['A', 'S', 'E', 'D']);
  // Without them the manufacturer's stages apply: fees and contract are not stages there.
  assert.deepEqual(pickQuestions(bank, { count: 5 }).map((p) => p.question), ['A', 'S', 'X']);
  assert.deepEqual(stageCoverage(bank, { keyword: 'e', stages: SERVICE }), []);
  assert.deepEqual(balanceSeeds([{ seed: 'a', stage: 'fees' }], { keep: ['a'] }, SERVICE).missing, ['awareness', 'search', 'decision']);
});

test('config stages must reach all four buying stages', () => {
  const dir = mkdtempSync(join(tmpdir(), 'geo-trade-'));
  writeFileSync(join(dir, 'config.json'), JSON.stringify({ keyword: 'k', stages: { start: 'awareness', find: 'search' } }));
  assert.throws(() => loadConfig(dir), /config.stages/);
  writeFileSync(join(dir, 'config.json'), JSON.stringify({ keyword: 'k', stages: SERVICE }));
  assert.deepEqual(loadConfig(dir).stages, SERVICE);
});

test('the article prompt keeps the manufacturer\'s examples by default and takes a trade\'s own', () => {
  const lf = (text) => text.replace(/\r\n/g, '\n');
  const apparel = lf(prompt('write', articleExamples({})));
  assert.ok(apparel.includes('Choose what an image can show truthfully: samples, fabrics,\nconstruction details, packaging. One image'));
  assert.ok(apparel.includes('(for example a designer with sample garments)'));
  assert.ok(apparel.includes('Quality, construction or sampling\n  → e.g. "QC bench in our Guangzhou factory'));
  assert.ok(apparel.includes('e.g. `[custom swimwear printing](/custom-swimwear-printing/)`.'));
  const motel = prompt('write', articleExamples({ trade_examples: { image_subjects: 'rooms', hero: 'an owner at the front desk', photo_settings: 'Front desk → e.g. "a motel lobby".', link: '`[motel management](/motel-management/)`' } }));
  assert.doesNotMatch(motel, /fabric|garment|Guangzhou|swimwear/i);
  assert.match(prompt('seeds', { minerStages: 'start, find, vet, develop, fabric, produce, ship' }), /miner stage \(start, find, vet, develop, fabric, produce, ship\)\./);
});
