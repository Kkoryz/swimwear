import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const REPO = resolve(import.meta.dirname, '..');

export const BUYING_STAGES = ['awareness', 'search', 'evaluation', 'decision'];
export const ALL_ENGINES = ['chatgpt', 'claude', 'gemini', 'perplexity', 'google_aio'];

// geo-question-miner stages -> buying stages, in order. The default is a manufacturer's (the apparel banks were built
// on it); a site in another trade names its own in `stages`, since the miner sorts every question into them.
export const MINER_STAGE_MAP = {
  start: 'awareness',
  find: 'search',
  vet: 'evaluation',
  develop: 'evaluation',
  fabric: 'evaluation',
  produce: 'decision',
  ship: 'decision',
};

// The trade's examples in the article prompt (prompts/write.md), the manufacturer's by default; a site in another
// trade names its own in `trade_examples` (the miner's two, later_stage_topics and off_persona, go to the miner).
export const ARTICLE_EXAMPLES = {
  image_subjects: 'samples, fabrics,\nconstruction details, packaging',
  hero: 'a designer with sample garments',
  photo_settings: 'Quality, construction or sampling\n  → e.g. "QC bench in our Guangzhou factory, a worker measuring the leg opening with a tape"; fabric → "fabric store room,\n  rolls of swim fabric on shelves"; only the product itself gets a resort scene.',
  link: '`[custom swimwear printing](/custom-swimwear-printing/)`',
};

const DEFAULTS = {
  our_site: { domain: null, brand_terms: [] },
  also_watch: [],
  competitors: [],
  questions: null,
  questions_count: 5,
  engines: ALL_ENGINES,
  runs: 1,
  prompt_suffix: ' Search the web and cite your sources.',
  consensus_min_share: 0.6,
  firecrawl_base_url: process.env.FIRECRAWL_BASE_URL ?? 'http://localhost:3002',
  browser_profile: '.browser-profile',
  facts_file: null,
  // ask: browser rounds for failed receipts, then DataForSEO for what is left, up to this many USD per run
  ask_attempts: 3,
  api_fallback_budget_usd: 0.5,
  // question bank: buying stages (of 4) that need a question on the keyword or a focus term, else geo-question-miner
  // builds a bank for the keyword in <miner_dir>/runs (cached per keyword and market in bank_registry)
  bank_min_stages: 3,
  miner_dir: process.env.GEO_MINER_DIR ?? join(REPO, 'miner'),
  bank_registry: process.env.GEO_BANK_REGISTRY ?? null,
  // A new bank's Serper quote runs without --approve when it costs at most bank_auto_approve_usd (geo site sets it).
  serper_usd_per_credit: 0.001,
  bank_auto_approve_usd: 0,
  stages: MINER_STAGE_MAP,
  trade_examples: {},
};

// A run directory holds config.json and every step's output.
export function loadConfig(runDir) {
  const config = { ...DEFAULTS, ...JSON.parse(readFileSync(join(runDir, 'config.json'), 'utf8')) };
  if (!config.keyword) throw new Error('config.keyword is required');
  const unknown = config.engines.filter((e) => !ALL_ENGINES.includes(e));
  if (unknown.length) throw new Error(`unknown engines: ${unknown.join(', ')}`);
  if (!Number.isInteger(config.runs) || config.runs < 1) throw new Error('config.runs must be a positive integer');
  const buying = Object.values(config.stages);
  if (buying.some((s) => !BUYING_STAGES.includes(s)) || BUYING_STAGES.some((s) => !buying.includes(s))) throw new Error(`config.stages must map miner stages onto all of ${BUYING_STAGES.join(', ')}`);
  // The signed-in Chrome profile belongs to this repo, whichever folder the command runs from (the site build runs it
  // from the site; a relative path there opened a fresh, signed-out profile).
  return { ...config, browser_profile: resolve(REPO, config.browser_profile), bank_registry: config.bank_registry ?? join(config.miner_dir, 'runs', 'geo-banks.json'), runDir: resolve(runDir) };
}

// A stop the owner has to clear (a quote over the auto-approve limit, a spent budget, a missing field): exit code 2,
// which the site build reads as "waiting for the owner", not as a failure.
export class OwnerNeeded extends Error {}

export const receiptName = (qid, engine, run) => `${qid}-${engine}-r${run}.json`;
