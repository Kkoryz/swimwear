import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ask } from '../src/engines/dataforseo.mjs';
import { apiSpent, fallbackAll } from '../src/ask.mjs';

const env = { DATAFORSEO_LOGIN: 'u', DATAFORSEO_PASSWORD: 'p' };
const reply = (body, ok = true) => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    if (init.method === 'HEAD') return { headers: { get: () => 'https://source.com/page' } };
    calls.push({ url, body: JSON.parse(init.body) });
    return { ok, json: async () => body };
  };
  return { fetchImpl, calls };
};

test('an LLM engine asks with web search on and maps answer, citations, model and cost', async () => {
  const { fetchImpl, calls } = reply({ tasks: [{ status_code: 20000, cost: 0.013, result: [{ model_name: 'claude-haiku-5-5', web_search: true, items: [
    { type: 'reasoning', sections: [{ text: 'thinking' }] },
    { type: 'message', sections: [{ text: 'Part one.', annotations: [{ url: 'https://a.com/x', title: 'A' }, { url: 'https://a.com/x', title: 'A again' }] }, { text: 'Part two.', annotations: null }] },
  ] }] }] });
  const r = await ask('claude', 'How much? Search the web and cite your sources.', { fetchImpl, env });
  assert.match(calls[0].url, /ai_optimization\/claude\/llm_responses\/live$/);
  assert.deepEqual(calls[0].body, [{ user_prompt: 'How much? Search the web and cite your sources.', model_name: 'claude-haiku-5-5', max_output_tokens: 4096, web_search: true, web_search_country_iso_code: 'US', force_web_search: true }]);
  assert.equal(r.answer_text, 'Part one.\n\nPart two.');
  assert.deepEqual(r.citations, [{ url: 'https://a.com/x', title: 'A', how: 'api-annotation' }]);
  assert.equal(r.via, 'dataforseo');
  assert.equal(r.model, 'claude-haiku-5-5');
  assert.equal(r.cost_usd, 0.013);
});

test('Gemini redirect links resolve to the source; sonar takes no web_search field', async () => {
  const g = reply({ tasks: [{ status_code: 20000, cost: 0.02, result: [{ model_name: 'gemini-3.6-flash', web_search: true, items: [{ type: 'message', sections: [{ text: 'G.', annotations: [{ url: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc', direct_url: null, title: 'source.com' }] }] }] }] }] });
  const r = await ask('gemini', 'q', { fetchImpl: g.fetchImpl, env });
  assert.equal(r.citations[0].url, 'https://source.com/page');
  assert.equal(g.calls[0].body[0].web_search_country_iso_code, undefined);
  const p = reply({ tasks: [{ status_code: 20000, result: [{ items: [] }] }] });
  await ask('perplexity', 'q', { fetchImpl: p.fetchImpl, env });
  assert.equal(p.calls[0].body[0].web_search, undefined);
  assert.equal(p.calls[0].body[0].model_name, 'sonar');
});

test('google_aio reads the SERP AI Overview with its references and links', async () => {
  const { fetchImpl, calls } = reply({ tasks: [{ status_code: 20000, cost: 0.004, result: [{ items: [
    { type: 'organic', url: 'https://x.com' },
    { type: 'ai_overview', markdown: 'Overview text.', references: [{ url: 'https://r.com/1', title: 'R' }], items: [{ type: 'ai_overview_element', text: 't', links: [{ url: 'https://l.com/2' }], references: [{ url: 'https://r.com/1' }] }] },
  ] }] }] });
  const r = await ask('google_aio', 'What should a tech pack include?', { fetchImpl, env });
  assert.equal(calls[0].body[0].keyword, 'What should a tech pack include?');
  assert.equal(calls[0].body[0].load_async_ai_overview, true);
  assert.equal(r.answer_text, 'Overview text.');
  assert.deepEqual(r.citations.map((c) => c.url), ['https://r.com/1', 'https://l.com/2']);
});

test('a task error or missing credentials fails loudly', async () => {
  await assert.rejects(ask('chatgpt', 'q', { fetchImpl: reply({ tasks: [{ status_code: 40501, status_message: 'Invalid Field' }] }).fetchImpl, env }), /40501: Invalid Field/);
  await assert.rejects(ask('chatgpt', 'q', { fetchImpl: reply({}).fetchImpl, env: {} }), /not set/);
});

test('their passing server error (40101) is tried again, up to three calls; a field error is not', async () => {
  const answers = [{ tasks: [{ status_code: 40101, status_message: 'Internal SE Server Error' }] }, { tasks: [{ status_code: 20000, cost: 0.004, result: [{ items: [] }] }] }];
  let n = 0;
  const flaky = async () => ({ ok: true, json: async () => answers[Math.min(n++, 1)] });
  assert.equal((await ask('google_aio', 'q', { fetchImpl: flaky, env, retryDelayMs: 1 })).cost_usd, 0.004);
  assert.equal(n, 2);
  const down = reply({ tasks: [{ status_code: 40101, status_message: 'Internal SE Server Error' }] });
  await assert.rejects(ask('google_aio', 'q', { fetchImpl: down.fetchImpl, env, retryDelayMs: 1 }), /40101/);
  assert.equal(down.calls.length, 3);
  const bad = reply({ tasks: [{ status_code: 40501, status_message: 'Invalid Field' }] });
  await assert.rejects(ask('chatgpt', 'q', { fetchImpl: bad.fetchImpl, env, retryDelayMs: 1 }));
  assert.equal(bad.calls.length, 1);
});

test('fallback fills missing and unavailable receipts until the budget is spent', async (t) => {
  const runDir = mkdtempSync(join(tmpdir(), 'geo-fallback-'));
  t.after(() => rmSync(runDir, { recursive: true }));
  writeFileSync(join(runDir, '01-questions.json'), JSON.stringify({ questions: [{ id: 'q1', question: 'Q one?' }, { id: 'q2', question: 'Q two?' }] }));
  mkdirSync(join(runDir, '02-receipts'));
  writeFileSync(join(runDir, '02-receipts', 'q1-gemini-r1.json'), JSON.stringify({ via: 'browser', answer_text: 'ok' }));
  writeFileSync(join(runDir, '02-receipts', 'q2-gemini-r1.json'), JSON.stringify({ status: 'unavailable' }));
  const config = { runDir, runs: 1, engines: ['gemini', 'google_aio'], prompt_suffix: ' Search.', api_fallback_budget_usd: 0.05, our_site: { domain: 'x.com', brand_terms: [] } };
  const asked = [];
  const apiImpl = async (engine, prompt) => { asked.push(`${engine}:${prompt}`); return { via: 'dataforseo', model: 'm', answer_text: 'A', citations: [], cost_usd: 0.03 }; };
  const { left, spent } = await fallbackAll(config, { apiImpl, log: () => {} });
  assert.deepEqual(asked, ['google_aio:Q one?', 'gemini:Q two? Search.']);
  assert.equal(left.length, 1);
  assert.match(left[0], /q2-google_aio-r1\.json: API fallback budget spent/);
  assert.equal(spent, 0.06);
  assert.equal(apiSpent(join(runDir, '02-receipts')), 0.06);
  assert.equal(JSON.parse(readFileSync(join(runDir, '02-receipts', 'q2-gemini-r1.json'), 'utf8')).via, 'dataforseo');
});
