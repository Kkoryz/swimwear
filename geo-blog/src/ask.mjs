import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { UnavailableError, openBrowser } from './browser.mjs';
import { receiptName } from './config.mjs';
import { normalizeUrl, siteHits } from './urls.mjs';
import { ask as apiAsk } from './engines/dataforseo.mjs';

const ENGINES = {
  chatgpt: () => import('./engines/chatgpt.mjs'),
  claude: () => import('./engines/claude.mjs'),
  gemini: () => import('./engines/gemini.mjs'),
  perplexity: () => import('./engines/perplexity.mjs'),
  google_aio: () => import('./engines/google_aio.mjs'),
};

// A short reply that is the app's own error message, not an answer (e.g. Gemini's "Sorry, something went wrong").
export function isErrorReply(text) {
  const t = (text ?? '').trim();
  return t.length < 400 && /something went wrong|please try (your request )?again|an error occurred|network error|couldn't (complete|generate)|unable to (complete|process) (your|this) request|hard time fulfilling/i.test(t);
}

// A short reply with no citations is no searched answer (e.g. Gemini's "I'm having a hard time fulfilling your
// request"), whatever its wording. Google showing no AI Overview at all is a real result, not a failure.
export function isNonAnswer(engine, result) {
  const t = (result.answer_text ?? '').trim();
  if (engine === 'google_aio' && !t) return false;
  return t.length < 400 && (result.citations ?? []).length === 0;
}


const FORCED = {
  chatgpt: 'URL param hints=search + prompt suffix',
  claude: 'prompt suffix',
  gemini: 'prompt suffix',
  perplexity: 'prompt suffix',
  google_aio: 'none (Google search with the bare question)',
};

// Step 2: every question x engine x run, one receipt each. Existing receipts are kept (resume).
// Engines run side by side in their own tabs; questions and runs go one after another.
export async function askAll(config, { only = null, log = console.log } = {}) {
  const questions = JSON.parse(readFileSync(join(config.runDir, '01-questions.json'), 'utf8')).questions;
  const outDir = join(config.runDir, '02-receipts');
  mkdirSync(outDir, { recursive: true });
  const engines = config.engines.filter((e) => !only || only.includes(e));
  const context = await openBrowser(config);
  const pages = Object.fromEntries(await Promise.all(engines.map(async (e) => [e, await context.newPage()])));
  const failures = [];
  // The same answer for two different questions means a stale page was read: reject it so `ask` retries.
  const answered = new Map();
  for (const f of existsSync(outDir) ? readdirSync(outDir).filter((n) => n.endsWith('.json')) : []) {
    const r = JSON.parse(readFileSync(join(outDir, f), 'utf8'));
    if (r.answer_text) answered.set(`${r.engine}|${r.run}|${r.answer_text.slice(0, 500)}`, r.question_id);
  }
  try {
    for (let run = 1; run <= config.runs; run++) {
      for (const q of questions) {
        await Promise.all(engines.map(async (engine) => {
          const file = join(outDir, receiptName(q.id, engine, run));
          if (existsSync(file) && JSON.parse(readFileSync(file, 'utf8')).status !== 'unavailable') return;
          const prompt = engine === 'google_aio' ? q.question : q.question + config.prompt_suffix;
          const started = new Date().toISOString();
          try {
            const { ask } = await ENGINES[engine]();
            const result = await ask(pages[engine], prompt);
            if (isErrorReply(result.answer_text)) throw new Error(`the engine answered with an error: "${result.answer_text.trim().slice(0, 120)}"`);
            if (isNonAnswer(engine, result)) throw new Error(`no searched answer (${result.answer_text.trim().length} chars, 0 citations): "${result.answer_text.trim().slice(0, 120)}"`);
            const key = `${engine}|${run}|${result.answer_text.slice(0, 500)}`;
            if (result.answer_text && answered.has(key) && answered.get(key) !== q.id) throw new Error(`same answer as ${answered.get(key)}: a stale page was read`);
            answered.set(key, q.id);
            result.citations =result.citations.map((c) => { try { return { ...c, url: normalizeUrl(c.url) }; } catch { return c; } });
            const receipt = {
              question_id: q.id,
              engine,
              run,
              prompt_sent: prompt,
              forced_search: FORCED[engine],
              captured_at: started,
              via: 'browser',
              ...result,
              our_site: siteHits(config.our_site, result.answer_text, result.citations),
              also_watch: Object.fromEntries((config.also_watch || []).map((s) => [s.domain, siteHits(s, result.answer_text, result.citations)])),
            };
            writeFileSync(file, JSON.stringify(receipt, null, 2));
            log(`✓ ${receiptName(q.id, engine, run)}  ${result.answer_text.length} chars, ${result.citations.length} citations`);
          } catch (e) {
            // The web app says it cannot answer now (Perplexity's free search limit): the paid API answers at once.
            if (e instanceof UnavailableError && config.api_fallback !== false) {
              try {
                await fillByApi(config, { q, engine, run, prompt, started, reason: e.message, log });
                return;
              } catch (apiError) {
                e.message = `${e.message}; API fallback failed: ${apiError.message}`;
              }
            }
            if (e instanceof UnavailableError) {
              writeFileSync(file, JSON.stringify({ question_id: q.id, engine, run, prompt_sent: prompt, captured_at: started, status: 'unavailable', answer_text: '', citations: [], notes: e.message }, null, 2));
              log(`⚠ ${receiptName(q.id, engine, run)}  unavailable: ${e.message}`);
              return;
            }
            // A screenshot of where it stopped, next to the receipts.
            const shot = join(outDir, '_failures', receiptName(q.id, engine, run).replace('.json', '.png'));
            mkdirSync(join(outDir, '_failures'), { recursive: true });
            await pages[engine].screenshot({ path: shot }).catch(() => {});
            failures.push(`${receiptName(q.id, engine, run)}: ${e.message}`);
            log(`✗ ${receiptName(q.id, engine, run)}  ${e.message}`);
          }
        }));
      }
    }
  } finally {
    await context.close();
  }
  return failures;
}

const paid = (r) => r.via === 'dataforseo' || r.source === 'dataforseo_api';

// What this run's API fallbacks have cost so far (USD).
export function apiSpent(outDir) {
  if (!existsSync(outDir)) return 0;
  return readdirSync(outDir).filter((n) => n.endsWith('.json'))
    .map((n) => JSON.parse(readFileSync(join(outDir, n), 'utf8')))
    .filter(paid).reduce((sum, r) => sum + (r.cost_usd ?? 0), 0);
}

// What DataForSEO may spend on this run: api_fallback_budget_usd, or under `geo site` what is left of the article's
// budget (article_budget_usd) after its share of the site's bank (shared_cost_usd) and a bank built for it.
export function fallbackBudget(config) {
  if (config.article_budget_usd == null) return config.api_fallback_budget_usd;
  const bankFile = join(config.runDir, '00-bank-cost.json');
  const bank = existsSync(bankFile) ? JSON.parse(readFileSync(bankFile, 'utf8')).usd ?? 0 : 0;
  return config.article_budget_usd - (config.shared_cost_usd ?? 0) - bank;
}

// One receipt from DataForSEO, unless the run's fallback budget is spent.
async function fillByApi(config, { q, engine, run, prompt, started, reason, log, apiImpl = apiAsk }) {
  const outDir = join(config.runDir, '02-receipts');
  const spent = apiSpent(outDir);
  const budget = fallbackBudget(config);
  if (spent >= budget) throw new Error(`API fallback budget spent ($${spent.toFixed(3)} of $${budget.toFixed(3)})`);
  const result = await apiImpl(engine, prompt, { models: config.api_models ?? {} });
  result.citations = result.citations.map((c) => { try { return { ...c, url: normalizeUrl(c.url) }; } catch { return c; } });
  writeFileSync(join(outDir, receiptName(q.id, engine, run)), JSON.stringify({
    question_id: q.id, engine, run, prompt_sent: prompt,
    forced_search: engine === 'google_aio' ? 'none (Google SERP with the bare question)' : 'DataForSEO web_search + prompt suffix',
    captured_at: started, ...result, notes: `${reason}; ${result.notes}`,
    our_site: siteHits(config.our_site, result.answer_text, result.citations),
    also_watch: Object.fromEntries((config.also_watch || []).map((s) => [s.domain, siteHits(s, result.answer_text, result.citations)])),
  }, null, 2));
  log(`✓ ${receiptName(q.id, engine, run)}  via DataForSEO (${result.model}), ${result.answer_text.length} chars, ${result.citations.length} citations, $${result.cost_usd}`);
}

// After the browser retries: every receipt still missing or unavailable is asked through DataForSEO, one after
// another, until the budget is spent. Returns the receipts left unfilled.
export async function fallbackAll(config, { log = console.log, apiImpl = apiAsk } = {}) {
  const questions = JSON.parse(readFileSync(join(config.runDir, '01-questions.json'), 'utf8')).questions;
  const outDir = join(config.runDir, '02-receipts');
  mkdirSync(outDir, { recursive: true });
  const left = [];
  for (let run = 1; run <= config.runs; run++) {
    for (const q of questions) {
      for (const engine of config.engines) {
        const file = join(outDir, receiptName(q.id, engine, run));
        if (existsSync(file) && JSON.parse(readFileSync(file, 'utf8')).status !== 'unavailable') continue;
        const prompt = engine === 'google_aio' ? q.question : q.question + config.prompt_suffix;
        try {
          await fillByApi(config, { q, engine, run, prompt, started: new Date().toISOString(), reason: 'the browser run failed after the retries', log, apiImpl });
        } catch (e) {
          left.push(`${receiptName(q.id, engine, run)}: ${e.message}`);
          log(`✗ ${receiptName(q.id, engine, run)}  ${e.message}`);
        }
      }
    }
  }
  return { left, spent: apiSpent(outDir) };
}
