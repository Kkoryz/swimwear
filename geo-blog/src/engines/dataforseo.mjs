// Fallback when an engine's web app could not answer after the retries: DataForSEO, paid per call. The LLM engines go
// to AI Optimization "LLM Responses" (live) with web search on; google_aio to the Google organic SERP's AI Overview.
// Measured 2026-10-31 on one question: chat_gpt gpt-5.4-mini $0.032, claude-haiku-5-5 $0.013, gemini-3.5-flash $0.019,
// SERP with the async AI Overview $0.004 (sonar was $0.007). API models answer and cite differently from the web apps,
// so receipts say `via: "dataforseo"` and the model.
import { dedupeCitations } from '../browser.mjs';

const API = 'https://api.dataforseo.com/v3';
const PLATFORM = { chatgpt: 'chat_gpt', claude: 'claude', gemini: 'gemini', perplexity: 'perplexity' };
// Models with web search (the models endpoints list them); config.api_models overrides per engine.
export const API_MODELS = { chatgpt: 'gpt-5.4-mini', claude: 'claude-haiku-5-5', gemini: 'gemini-3.5-flash', perplexity: 'sonar' };

// Their server's own passing errors (40101 "Internal SE Server Error", 5xxxx, HTTP 5xx) are tried again before failing.
const passing = (code) => code === 40101 || code >= 50000 || (code >= 500 && code < 600);

async function post(path, task, { fetchImpl, env, retryDelayMs = 5000 }) {
  if (!env.DATAFORSEO_LOGIN || !env.DATAFORSEO_PASSWORD) throw new Error('DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD not set');
  for (let attempt = 1; ; attempt++) {
    const res = await fetchImpl(`${API}/${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${env.DATAFORSEO_LOGIN}:${env.DATAFORSEO_PASSWORD}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([task]),
    });
    const body = await res.json().catch(() => ({}));
    const t = body.tasks?.[0];
    if (res.ok && t?.status_code === 20000) return { result: t.result?.[0] ?? {}, cost: t.cost ?? null };
    const code = t?.status_code ?? body.status_code ?? res.status;
    if (attempt < 3 && passing(code)) { await new Promise((r) => setTimeout(r, retryDelayMs * attempt)); continue; }
    throw new Error(`DataForSEO ${code}: ${t?.status_message ?? body.status_message ?? 'request failed'}`);
  }
}

// Gemini cites through Vertex AI redirect links; the source is the redirect's target.
async function resolveRedirect(url, fetchImpl) {
  if (!/vertexaisearch\.cloud\.google\.com\/grounding-api-redirect/.test(url)) return url;
  try {
    const res = await fetchImpl(url, { method: 'HEAD', redirect: 'manual' });
    return res.headers.get('location') || url;
  } catch { return url; }
}

export async function ask(engine, prompt, { models = {}, fetchImpl = fetch, env = process.env, retryDelayMs } = {}) {
  if (engine === 'google_aio') return askGoogle(prompt, { fetchImpl, env, retryDelayMs });
  if (!PLATFORM[engine]) throw new Error(`no DataForSEO fallback for ${engine}`);
  if (prompt.length > 500) throw new Error('DataForSEO user_prompt is limited to 500 characters');
  const model = models[engine] ?? API_MODELS[engine];
  const task = { user_prompt: prompt, model_name: model, max_output_tokens: 4096 };
  // Sonar searches by default and takes no web_search field; Gemini takes no search country.
  if (engine !== 'perplexity') task.web_search = true;
  if (engine !== 'gemini') task.web_search_country_iso_code = 'US';
  if (engine === 'claude') task.force_web_search = true;
  const { result, cost } = await post(`ai_optimization/${PLATFORM[engine]}/llm_responses/live`, task, { fetchImpl, env, retryDelayMs });
  const sections = (result.items ?? []).filter((i) => !i.type || i.type === 'message').flatMap((i) => i.sections ?? i.message?.sections ?? []);
  const annotations = sections.flatMap((s) => s.annotations ?? []).filter((a) => a?.url || a?.direct_url);
  const citations = await Promise.all(annotations.map(async (a) => ({ url: a.direct_url || (await resolveRedirect(a.url, fetchImpl)), title: a.title ?? '', how: 'api-annotation' })));
  return {
    page_url: null,
    via: 'dataforseo',
    model: result.model_name ?? model,
    answer_text: sections.map((s) => s.text).filter(Boolean).join('\n\n').trim(),
    citations: dedupeCitations(citations),
    web_search_used: Boolean(result.web_search),
    cost_usd: cost,
    notes: `answered by the DataForSEO ${PLATFORM[engine]} LLM Responses API (${result.model_name ?? model}, web search on) because the web app failed`,
  };
}

// Google's AI Overview for the bare question (US, English, desktop); an absent overview is an empty answer, as on the web.
async function askGoogle(question, { fetchImpl, env, retryDelayMs }) {
  const { result, cost } = await post('serp/google/organic/live/advanced', { keyword: question, location_code: 2840, language_code: 'en', device: 'desktop', load_async_ai_overview: true }, { fetchImpl, env, retryDelayMs });
  const overview = (result.items ?? []).find((i) => i.type === 'ai_overview');
  const elements = overview?.items ?? [];
  const refs = [...(overview?.references ?? []), ...elements.flatMap((e) => e.references ?? [])].map((r) => ({ url: r.url, title: r.title ?? '', how: 'api-reference' }));
  const links = elements.flatMap((e) => e.links ?? []).map((l) => ({ url: l.url, title: l.title ?? '', how: 'api-link' }));
  return {
    page_url: null,
    via: 'dataforseo',
    model: 'google-serp-ai-overview',
    answer_text: (overview?.markdown ?? elements.map((e) => e.markdown ?? e.text).filter(Boolean).join('\n\n')).trim(),
    citations: dedupeCitations([...refs, ...links].filter((c) => c.url)),
    web_search_used: Boolean(overview),
    cost_usd: cost,
    notes: overview ? 'AI Overview from the DataForSEO Google SERP API because the browser run failed' : 'no AI Overview on the DataForSEO Google SERP for this question',
  };
}
