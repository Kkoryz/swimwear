#!/usr/bin/env node
// geo <command> <run-dir> [options]
//   init <run-dir>                 copy config.example.json into a new run directory
//   login <run-dir>                open the tool's Chrome on the sign-in pages; close the window when done
//   bank <run-dir> [--approve]     step 0: a question bank that covers the keyword (geo-question-miner when needed;
//                                  stops at the Serper quote until run with --approve)
//   questions <run-dir>            step 1: pick the questions from the question bank (the main question included)
//   ask <run-dir> [--only a,b]     step 2: ask the engines in the browser (resumable); failed receipts get
//                                  config.ask_attempts rounds, then DataForSEO up to config.api_fallback_budget_usd
//   fetch <run-dir> [--dry-run]    step 3: fetch priority cited pages with local Firecrawl
//   gaps <run-dir>                 step 4: gap analysis per question (Codex judge)
//   outline <run-dir>              step 5: outline (Codex judge)
//   check <run-dir>                exit check; exit code 1 on any failure
//   write <run-dir>                step 6 (needs a passing check): article + replacement list (Codex judge)
//   apply <run-dir>                swap in the `real` text filled in 06-replacements.json
//   site <run-dir>                 step 7: hand the article to the site (config.site_import: { cwd, command })
//   all <run-dir> [--approve]      steps 0–7 with both checks, stopping at the first failure
//   site <geo-site.json> [--count N]  the site build's step: the site bank, then count GEO articles in all (topics
//                                  chosen by a judge, each `all` unattended within budget_usd_per_article); exit 0
//                                  when the site has them, 2 when the owner has to act (a quote, a budget), 1 on failure
// Exit code 2 everywhere: stopped for the owner (a quote over the auto-approve limit, a spent budget, a missing field).
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OwnerNeeded, loadConfig } from '../src/config.mjs';
import { mainFromSource, pickQuestions } from '../src/questions.mjs';
import { answeredBy, ownSlug, sitePosts, siblingRuns } from '../src/site-posts.mjs';
import { askAll, fallbackAll, fallbackBudget } from '../src/ask.mjs';
import { ensureBank } from '../src/bank.mjs';
import { openBrowser } from '../src/browser.mjs';
import { fetchSources } from '../src/fetch.mjs';
import { judge, writeArticle, writeGaps, writeOutline } from '../src/judge.mjs';
import { articleCheck, overlapWarnings, readArticle, writeLists } from '../src/article-check.mjs';
import { applyReplacements } from '../src/replace.mjs';
import { exitCheck, exitWarnings } from '../src/exit-check.mjs';
import { readProfile, runSite } from '../src/site-run.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const [command, runArg, ...rest] = process.argv.slice(2);
const flag = (name) => rest.includes(`--${name}`);
const option = (name) => { const i = rest.indexOf(`--${name}`); return i >= 0 ? rest[i + 1] : null; };

// A stop the owner has to clear exits 2 (the site build reads it as waiting, not failed); anything else exits 1.
process.on('uncaughtException', (e) => {
  console.error(e instanceof OwnerNeeded ? `⏸ needs the owner: ${e.message}` : e);
  process.exit(e instanceof OwnerNeeded ? 2 : 1);
});

if (command === 'site' && runArg) {
  const count = option('count');
  process.exit(await runSite(readProfile(resolve(runArg)), { root: ROOT, ...(count ? { count: Number(count) } : {}) }));
}
if (!command || !runArg) {
  console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n'));
  process.exit(1);
}
const runDir = resolve(runArg);
// Codex judges write inside this repo's workspace, so runs live under it.
if (!runDir.toLowerCase().startsWith(resolve(ROOT).toLowerCase())) throw new Error(`run directory must be inside ${ROOT}`);

const steps = {
  bank: (config) => ensureBank(config, { approve: flag('approve') }),
  async questions(config) {
    const out = join(config.runDir, '01-questions.json');
    if (existsSync(out)) return console.log('01-questions.json exists, kept');
    const bank = JSON.parse(readFileSync(config.question_bank, 'utf8'));
    const list = Array.isArray(bank) ? bank : bank.questions;
    // Questions the site's other articles already answer are left to them (no two posts chasing one query).
    const posts = [...sitePosts(config, { excludeSlug: ownSlug(config) }), ...siblingRuns(config)];
    const skipped = new Set();
    const skip = (question) => { const hit = answeredBy(question, posts); if (hit.length) skipped.add(`${question} → /blog/${hit[0].slug}/`); return hit.length > 0; };
    let must = config.questions ? null : await mainQuestion(config, list.filter((q) => config.stages[q.stage] && !skip(q.canonical_question)));
    // No question of this bank asks the main question: take it from the bank it was chosen from (geo site's site bank).
    const source = !must && !config.questions && config.main_question_source && existsSync(config.main_question_source) ? JSON.parse(readFileSync(config.main_question_source, 'utf8')) : null;
    const added = source && mainFromSource(list, config.main_question, Array.isArray(source) ? source : source.questions, config.stages);
    if (added) { list.push(added); must = added.canonical_question; console.log(`main question from ${config.main_question_source}: ${must}`); }
    const questions = pickQuestions(list, { count: config.questions_count, names: config.questions, keyword: config.keyword, focus: config.focus_terms ?? [], skip, must, stages: config.stages });
    if (skipped.size) console.log(`left to existing articles:\n${[...skipped].map((s) => `  ${s}`).join('\n')}`);
    writeFileSync(out, JSON.stringify({ keyword: config.keyword, market: config.market, source: config.question_bank, questions }, null, 2));
    questions.forEach((q) => console.log(`${q.id} [${q.buying_stage}] ${q.question}`));
  },
  async ask(config) {
    const only = option('only')?.split(',') ?? null;
    for (let round = 1; ; round++) {
      const failures = await askAll(config, { only });
      if (!failures.length) break;
      if (round >= config.ask_attempts) { console.log(`${failures.length} receipts still failing after ${round} rounds`); break; }
      console.log(`${failures.length} receipts failed; browser round ${round + 1} of ${config.ask_attempts}`);
    }
    if (config.api_fallback === false) return;
    const { left, spent } = await fallbackAll(config);
    if (!left.length) return;
    const budget = fallbackBudget(config);
    const message = `${left.length} receipts unfilled (DataForSEO spent $${spent.toFixed(3)} of $${budget.toFixed(3)}); raise the budget or run ask again`;
    throw spent >= budget ? new OwnerNeeded(message) : new Error(message);
  },
  async fetch(config) {
    const r = await fetchSources(config, { dryRun: flag('dry-run') });
    console.log(`fetched ${r.fetched}, failed ${r.failed} of ${r.pages} priority pages`);
  },
  gaps: (config) => writeGaps(config),
  outline: (config) => writeOutline(config),
  async check(config) {
    for (const w of exitWarnings(config)) console.log(`⚠ ${w}`);
    const failures = exitCheck(config);
    if (failures.length) {
      console.log(`EXIT CHECK FAILED (${failures.length})`);
      failures.forEach((f) => console.log(` - ${f}`));
      process.exitCode = 1;
      return false;
    }
    console.log('EXIT CHECK PASSED: questions, receipts, gaps and outline line up.');
    return true;
  },
  async write(config) {
    if (exitCheck(config).length) throw new Error('exit check fails: run `geo check` and fix it before writing');
    await writeArticle(config);
    writeLists(config.runDir);
    for (const w of overlapWarnings(config)) console.log(`⚠ ${w}`);
    return report('ARTICLE CHECK', articleCheck(config), () => {
      const { replacements } = readArticle(config.runDir);
      const { visuals } = readArticle(config.runDir); console.log(`ARTICLE CHECK PASSED: ${replacements.length} replacements (06-replacements.md), ${visuals.length} tables and figures (06-visuals.md)`);
    });
  },
  // The site's own importer (stage 08 builds the blog page and its images); {runDir} is replaced by the run directory.
  async site(config) {
    const spec = config.site_import;
    if (!spec?.command?.length) return console.log('no site_import in config; skipped');
    const [file, ...args] = spec.command.map((a) => a.replaceAll('{runDir}', config.runDir));
    const code = await new Promise((done) => {
      const child = spawn(file, args, { cwd: spec.cwd, stdio: 'inherit', shell: process.platform === 'win32' && !/\.(exe|com)$/i.test(file) && !/^node$/i.test(file) });
      child.on('close', done);
      child.on('error', (e) => { console.log(e.message); done(1); });
    });
    if (code !== 0) throw new Error(`site import exited ${code}`);
  },
  async apply(config) {
    const { applied, remaining } = applyReplacements(config.runDir);
    console.log(`applied ${applied.length}: ${applied.join(', ') || '-'}; ${remaining.length} placeholders left`);
  },
};

// The bank question that is the article's main question (a judge match: word overlap misses "which printing method"
// against "sublimation, digital or screen printing"); the picker always takes it.
async function mainQuestion(config, candidates) {
  if (!config.main_question) return null;
  const out = join(config.runDir, '01-main-question.json');
  if (!existsSync(out)) {
    await judge(config, 'main-question', {
      runDir: config.runDir, keyword: config.keyword, mainQuestion: config.main_question,
      candidates: candidates.map((q) => `- ${q.canonical_question}`).join('\n'),
    }, out, 'main-question');
  }
  const { question } = JSON.parse(readFileSync(out, 'utf8'));
  if (question && !candidates.some((q) => q.canonical_question === question)) throw new Error(`01-main-question.json names a question not in the bank: ${question}`);
  console.log(question ? `main question: ${question}` : '⚠ no bank question matches the main question; picked by keyword and focus terms');
  return question;
}

function report(name, failures, onPass) {
  if (failures.length) {
    console.log(`${name} FAILED (${failures.length})`);
    failures.forEach((f) => console.log(` - ${f}`));
    process.exitCode = 1;
    return false;
  }
  onPass();
  return true;
}

if (command === 'init') {
  mkdirSync(runDir, { recursive: true });
  const target = join(runDir, 'config.json');
  if (existsSync(target)) throw new Error(`${target} exists`);
  copyFileSync(join(ROOT, 'config.example.json'), target);
  console.log(`edit ${target}, then: geo all ${runArg}`);
} else if (command === 'login') {
  const context = await openBrowser(loadConfig(runDir));
  const pages = ['https://chatgpt.com/auth/login', 'https://claude.ai/login', 'https://accounts.google.com/ServiceLogin?continue=https://gemini.google.com/app', 'https://www.perplexity.ai/'];
  const [first] = context.pages();
  for (const [i, url] of pages.entries()) await (i === 0 && first ? first : await context.newPage()).goto(url).catch(() => {});
  console.log('Sign in on each tab, then close the Chrome window.');
  await new Promise((done) => context.on('close', done));
  console.log('sessions saved');
} else if (command === 'all') {
  const config = loadConfig(runDir);
  for (const step of ['bank', 'questions', 'ask', 'fetch', 'gaps', 'outline']) {
    console.log(`\n== ${step}`);
    await steps[step](config);
  }
  console.log('\n== check');
  if (await steps.check(config)) {
    console.log('\n== write');
    if (await steps.write(config) && config.site_import) {
      console.log('\n== site');
      await steps.site(config);
    }
  }
} else if (steps[command]) {
  await steps[command](loadConfig(runDir));
} else {
  throw new Error(`unknown command: ${command}`);
}
