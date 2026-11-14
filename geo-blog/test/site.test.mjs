import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { demanded, readProfile, runSite } from '../src/site-run.mjs';
import { ensureBank } from '../src/bank.mjs';
import { fallbackBudget } from '../src/ask.mjs';
import { fixTables, stampKeyword } from '../src/judge.mjs';
import { OwnerNeeded, loadConfig } from '../src/config.mjs';

const q = (stage, text) => ({ stage, priority: 'high', canonical_question: text, evidence: ['e'], evidence_types: ['paa'] });
const BANK = [q('start', 'Is a swimwear brand profitable?'), q('find', 'Where do I find a swimwear manufacturer?'), q('vet', 'How do I vet a swimwear manufacturer?'), q('ship', 'How long does swimwear manufacturer shipping take?')];

function site(t, { posts = [], count = 3 } = {}) {
  const top = mkdtempSync(join(tmpdir(), 'geo-site-'));
  t.after(() => rmSync(top, { recursive: true }));
  const root = join(top, 'geo');
  const siteDir = join(top, 'site');
  mkdirSync(join(root, 'runs'), { recursive: true });
  mkdirSync(join(siteDir, 'src', 'data'), { recursive: true });
  writeFileSync(join(siteDir, 'src', 'data', 'blog-posts.json'), JSON.stringify(posts));
  writeFileSync(join(top, 'bank.json'), JSON.stringify(BANK));
  const profile = {
    schema: 'geo-site/v1', site_dir: siteDir, domain: 'strandmill.com', brand_terms: ['strandmill'], keyword: 'swimwear manufacturer',
    market: 'US (en)', niche: 'swimwear manufacturer, B2B', persona: 'brand founders', competitors: [], facts_file: join(top, 'facts.yaml'),
    site_import: { cwd: siteDir, command: ['node', 'import.mjs', '{runDir}'] }, count, budget_usd_per_article: 0.5, question_bank: join(top, 'bank.json'),
  };
  writeFileSync(join(top, 'geo-site.json'), JSON.stringify(profile));
  const postsFile = join(siteDir, 'src', 'data', 'blog-posts.json');
  // The site importer's part: the finished run's article lands in the posts, marked with its run.
  const importer = (runDir) => {
    const list = JSON.parse(readFileSync(postsFile, 'utf8'));
    list.push({ slug: runDir.split(/[\\/]/).pop(), status: 'review', title: 't', sections: [], geo: { run: runDir.replaceAll('\\', '/'), keyword: 'k' } });
    writeFileSync(postsFile, JSON.stringify(list));
  };
  return { root, file: join(top, 'geo-site.json'), importer };
}

const topicsOf = (n) => async (config, { count }) => Array.from({ length: count }, (_, i) => ({ slug: `topic-${n}-${i}`, keyword: `swimwear topic ${i}`, focus_terms: [], main_question: BANK[i].canonical_question }));

test('a profile without its required fields stops for the owner, and the command exits 2', (t) => {
  const { file } = site(t);
  const bad = JSON.parse(readFileSync(file, 'utf8'));
  delete bad.niche;
  writeFileSync(file, JSON.stringify(bad));
  assert.throws(() => readProfile(file), (e) => e instanceof OwnerNeeded && /missing niche/.test(e.message));
  const run = spawnSync(process.execPath, [fileURLToPath(new URL('../bin/geo.mjs', import.meta.url)), 'site', file], { encoding: 'utf8' });
  assert.equal(run.status, 2);
});

test('geo site writes the missing articles, then a rerun finds the site full and does nothing', async (t) => {
  const { root, file, importer } = site(t, { posts: [{ slug: 'old', status: 'review', geo: { run: 'D:/x/runs/old', keyword: 'k' } }] });
  const ran = [];
  const runAll = async (runDir) => { ran.push(runDir); importer(runDir); return { code: 0, tail: '' }; };
  assert.equal(await runSite(readProfile(file), { root, log: () => {}, runAll, pickTopics: topicsOf(1) }), 0);
  assert.equal(ran.length, 2);
  const config = JSON.parse(readFileSync(join(ran[0], 'config.json'), 'utf8'));
  assert.equal(config.keyword, 'swimwear topic 0');
  assert.equal(config.main_question, BANK[0].canonical_question);
  assert.match(config.main_question_source, /bank\.json$/);
  assert.equal(config.article_budget_usd, 0.5);
  assert.deepEqual(config.our_site, { domain: 'strandmill.com', brand_terms: ['strandmill'] });
  assert.match(ran[0], /runs[\\/]strandmill-com-topic-1-0$/);
  assert.equal(await runSite(readProfile(file), { root, log: () => {}, runAll: () => assert.fail('no run'), pickTopics: () => assert.fail('no topics') }), 0);
});

test('a run stopped for the owner leaves the site short with exit 2, and the rerun resumes the same topic', async (t) => {
  const { root, file, importer } = site(t, { count: 1 });
  assert.equal(await runSite(readProfile(file), { root, log: () => {}, runAll: async () => ({ code: 2, tail: 'Serper quote ~90 credits' }), pickTopics: topicsOf(2) }), 2);
  const again = [];
  assert.equal(await runSite(readProfile(file), { root, log: () => {}, runAll: async (d) => { again.push(d); importer(d); return { code: 0, tail: '' }; }, pickTopics: () => assert.fail('topic kept') }), 0);
  assert.match(again[0], /strandmill-com-topic-2-0$/);
});

test('under geo site the DataForSEO budget is what the article budget leaves after the banks', (t) => {
  const runDir = mkdtempSync(join(tmpdir(), 'geo-budget-'));
  t.after(() => rmSync(runDir, { recursive: true }));
  assert.equal(fallbackBudget({ runDir, api_fallback_budget_usd: 0.5 }), 0.5);
  writeFileSync(join(runDir, '00-bank-cost.json'), JSON.stringify({ usd: 0.09 }));
  assert.equal(Number(fallbackBudget({ runDir, article_budget_usd: 0.5, shared_cost_usd: 0.06 }).toFixed(2)), 0.35);
});

test('the run keyword goes into the article frontmatter once', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'geo-stamp-'));
  t.after(() => rmSync(dir, { recursive: true }));
  const file = join(dir, '06-article.md');
  writeFileSync(file, '---\nseo_title: "T"\nslug: "s"\n---\n\n# T\n\nkeyword: in the body\n');
  stampKeyword(file, 'swimwear printing');
  stampKeyword(file, 'swimwear printing');
  assert.equal(readFileSync(file, 'utf8'), '---\nkeyword: "swimwear printing"\nseo_title: "T"\nslug: "s"\n---\n\n# T\n\nkeyword: in the body\n');
});

test('a table header without its separator line gets one; a complete table is left alone', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'geo-table-'));
  t.after(() => rmSync(dir, { recursive: true }));
  const file = join(dir, '06-article.md');
  writeFileSync(file, 'Intro\n\n| Size | Allocation | Why |\n| S | 2 | fit |\n| M | 3 | grade |\n\n| A | B |\n|---|---|\n| 1 | 2 |\n');
  fixTables(file);
  assert.equal(readFileSync(file, 'utf8'), 'Intro\n\n| Size | Allocation | Why |\n| --- | --- | --- |\n| S | 2 | fit |\n| M | 3 | grade |\n\n| A | B |\n|---|---|\n| 1 | 2 |\n');
});

test('a new bank from niche and persona: a quote under the auto-approve limit runs, one over it stops for the owner', async (t) => {
  const make = (limit) => {
    const root = mkdtempSync(join(tmpdir(), 'geo-auto-'));
    t.after(() => rmSync(root, { recursive: true }));
    const runDir = join(root, 'run');
    mkdirSync(runDir);
    writeFileSync(join(runDir, 'config.json'), '{}');
    writeFileSync(join(runDir, '00-seeds.json'), JSON.stringify({ keep: ['a b', 'c d', 'e f', 'g h'], drop: [] }));
    const dir = join(root, 'miner', 'runs', 'geo-swimwear-manufacturer');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'seeds.codex.json'), JSON.stringify([{ seed: 'a b', stage: 'start' }, { seed: 'c d', stage: 'find' }, { seed: 'e f', stage: 'vet' }, { seed: 'g h', stage: 'ship' }]));
    const config = { keyword: 'swimwear manufacturer', market: 'US (en)', niche: 'swimwear, B2B', persona: 'founders', focus_terms: [], question_bank: null, bank_min_stages: 3, miner_dir: join(root, 'miner'), runDir, serper_usd_per_credit: 0.001, bank_auto_approve_usd: limit };
    const runMiner = async (_c, script) => {
      if (script === '02-harvest.mjs') writeFileSync(join(dir, 'raw.json'), '{}');
      if (script === '03-synthesize.mjs') writeFileSync(join(dir, 'geo-questions.json'), JSON.stringify(BANK));
    };
    return { config, runMiner, dir, runDir };
  };
  // 4 seeds of 2 words: search + autocomplete + community = 12 credits, $0.012.
  const over = make(0.01);
  await assert.rejects(ensureBank(over.config, { log: () => {}, runMiner: over.runMiner }), (e) => e instanceof OwnerNeeded && /12 credits \(~\$0\.012\)/.test(e.message));
  const under = make(0.5);
  await ensureBank(under.config, { log: () => {}, runMiner: under.runMiner });
  assert.equal(JSON.parse(readFileSync(join(under.runDir, '00-bank-cost.json'), 'utf8')).credits, 12);
  assert.equal(JSON.parse(readFileSync(join(under.dir, 'config.json'), 'utf8')).persona, 'founders');
});

test('the signed-in browser profile is this repo\'s, whatever folder the command runs from', (t) => {
  const runDir = mkdtempSync(join(tmpdir(), 'geo-profile-'));
  t.after(() => rmSync(runDir, { recursive: true }));
  writeFileSync(join(runDir, 'config.json'), JSON.stringify({ keyword: 'k', browser_profile: '.browser-profile' }));
  const repo = fileURLToPath(new URL('..', import.meta.url));
  const cwd = process.cwd();
  process.chdir(runDir);
  try { assert.equal(loadConfig(runDir).browser_profile, join(repo, '.browser-profile')); } finally { process.chdir(cwd); }
});

test('a main question needs searched demand: expert-only or research-only questions are no candidates', () => {
  assert.equal(demanded({ priority: 'high', evidence_types: ['paa', 'related'] }), true);
  assert.equal(demanded({ priority: 'low', evidence_types: ['community'] }), true);
  assert.equal(demanded({ priority: 'expert-only', evidence_types: ['expert'] }), false);
  assert.equal(demanded({ priority: 'medium', evidence_types: ['expert'] }), false);
  assert.equal(demanded({ priority: 'high' }), false);
});
