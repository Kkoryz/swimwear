import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { OwnerNeeded, loadConfig } from './config.mjs';
import { ensureBank } from './bank.mjs';
import { MINER_STAGE_MAP } from './questions.mjs';
import { answeredBy, postsForPrompt, sitePosts, siblingRuns } from './site-posts.mjs';
import { siteRoutes } from './article-check.mjs';
import { apiSpent } from './ask.mjs';
import { judge } from './judge.mjs';

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const slug = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const norm = (path) => resolve(path).replaceAll('\\', '/').toLowerCase();
const REQUIRED = ['site_dir', 'domain', 'keyword', 'market', 'niche', 'persona', 'facts_file', 'site_import', 'count', 'budget_usd_per_article'];

// The site profile (geo-site/v1) that the site build writes; the only thing `geo site` reads from the site besides
// its posts, sitemap and importer.
export function readProfile(file) {
  if (!existsSync(file)) throw new OwnerNeeded(`site profile not found: ${file}`);
  const profile = readJson(file);
  if (profile.schema !== 'geo-site/v1') throw new OwnerNeeded(`${file}: schema must be "geo-site/v1"`);
  const missing = REQUIRED.filter((k) => profile[k] == null || profile[k] === '');
  if (missing.length) throw new OwnerNeeded(`${file}: missing ${missing.join(', ')}`);
  const posts = profile.posts ?? join(profile.site_dir, 'src/data/blog-posts.json');
  if (norm(posts) !== norm(join(profile.site_dir, 'src/data/blog-posts.json'))) throw new OwnerNeeded(`${file}: posts must be <site_dir>/src/data/blog-posts.json`);
  return { brand_terms: [], competitors: [], also_watch: [], sitemap: join(profile.site_dir, 'dist/sitemap.xml'), ...profile, posts };
}

// The site's GEO articles (published or in review), each marked by the importer with the run it came from.
export function geoPosts(profile) {
  if (!existsSync(profile.posts)) return [];
  const data = readJson(profile.posts);
  return (Array.isArray(data) ? data : data.posts ?? []).filter((p) => p.geo?.run && ['published', 'review'].includes(p.status));
}

const siteConfig = (profile, extra) => ({
  keyword: profile.keyword,
  market: profile.market,
  our_site: { domain: profile.domain, brand_terms: profile.brand_terms },
  also_watch: profile.also_watch,
  competitors: profile.competitors,
  niche: profile.niche,
  persona: profile.persona,
  facts_file: profile.facts_file,
  site_dir: profile.site_dir,
  site_sitemap: profile.sitemap,
  site_import: profile.site_import,
  ...(profile.stages ? { stages: profile.stages } : {}),
  ...(profile.trade_examples ? { trade_examples: profile.trade_examples } : {}),
  ...extra,
});

const bankCost = (dir) => (existsSync(join(dir, '00-bank-cost.json')) ? readJson(join(dir, '00-bank-cost.json')).usd ?? 0 : 0);

// `geo site`: the site's main-keyword bank, then `count` GEO articles in all. Topics already on the site are skipped,
// unfinished ones resumed, missing ones chosen by a judge; each runs `geo all` unattended under the article budget.
// Returns the exit code: 0 when the site has `count` GEO articles, 2 when the owner has to act, 1 on a failure.
export async function runSite(profile, { root, count = profile.count, log = console.log, runAll = spawnAll, pickTopics = judgeTopics } = {}) {
  const site = slug(profile.domain);
  const baseDir = join(root, 'runs', site);
  mkdirSync(baseDir, { recursive: true });
  const budget = profile.budget_usd_per_article;
  writeFileSync(join(baseDir, 'config.json'), JSON.stringify(siteConfig(profile, { question_bank: readOld(baseDir).question_bank ?? profile.question_bank ?? null, bank_auto_approve_usd: budget }), null, 2));
  const base = loadConfig(baseDir);
  await ensureBank(base, { log });
  const siteBank = bankCost(baseDir);

  const done = geoPosts(profile);
  const doneRuns = new Set(done.map((p) => norm(p.geo.run)));
  const topicsFile = join(baseDir, 'topics.json');
  let topics = existsSync(topicsFile) ? readJson(topicsFile) : [];
  const runDirOf = (t) => join(root, 'runs', `${site}-${t.slug}`);
  const open = () => topics.filter((t) => !doneRuns.has(norm(runDirOf(t))));
  const need = count - done.length;
  log(`${profile.domain}: ${done.length} GEO articles on the site, ${count} wanted`);
  const results = [];
  if (need > 0 && open().length < need) {
    topics = [...topics, ...(await pickTopics(base, { count: need - open().length, topics, log }))];
    writeFileSync(topicsFile, JSON.stringify(topics, null, 2));
  }
  for (const [i, topic] of open().slice(0, Math.max(need, 0)).entries()) {
    const runDir = runDirOf(topic);
    // The site bank's cost goes to the first article that runs.
    const shared = i === 0 && !topics.some((t) => existsSync(join(runDirOf(t), '02-receipts'))) ? siteBank : 0;
    if (!existsSync(join(runDir, 'config.json'))) {
      mkdirSync(runDir, { recursive: true });
      writeFileSync(join(runDir, 'config.json'), JSON.stringify(siteConfig(profile, {
        keyword: topic.keyword, focus_terms: topic.focus_terms ?? [], main_question: topic.main_question, main_question_source: base.question_bank,
        question_bank: base.question_bank, article_budget_usd: budget, shared_cost_usd: shared, bank_auto_approve_usd: budget - shared,
      }), null, 2));
    }
    log(`\n=== ${basename(runDir)}: ${topic.keyword}`);
    const { code, tail } = await runAll(runDir);
    const run = readOld(runDir);
    const cost = (run.shared_cost_usd ?? 0) + bankCost(runDir) + apiSpent(join(runDir, '02-receipts'));
    const imported = geoPosts(profile).some((p) => norm(p.geo.run) === norm(runDir));
    results.push({ slug: topic.slug, run: runDir, status: imported ? 'imported' : code === 2 ? 'waiting for the owner' : 'failed', cost, reason: imported ? '' : tail });
  }

  const have = geoPosts(profile).length;
  log(`\n== GEO articles for ${profile.domain}: ${have} of ${count}`);
  for (const p of done) log(`  on the site   /blog/${p.slug}/  (${p.geo.run})`);
  for (const r of results) log(`  ${r.status.padEnd(13)} ${r.run}  $${r.cost.toFixed(3)}${r.reason ? `\n    ${r.reason}` : ''}`);
  if (have >= count) return 0;
  return results.some((r) => r.status === 'waiting for the owner') || !results.length ? 2 : 1;
}

// A topic's main question comes from real demand (owner 2026-10-31: PAA, Quora, Reddit): searched evidence of at least
// one kind, never a question only the miner's own research proposed.
const DEMAND = ['paa', 'related', 'autocomplete', 'community'];
export const demanded = (q) => q.priority !== 'expert-only' && (q.evidence_types ?? []).some((t) => DEMAND.includes(t));

const readOld = (dir) => (existsSync(join(dir, 'config.json')) ? readJson(join(dir, 'config.json')) : {});

// New topics from the site bank's questions that no page, article or chosen topic answers (a Codex judge).
async function judgeTopics(config, { count, topics, log }) {
  const bank = readJson(config.question_bank);
  const list = Array.isArray(bank) ? bank : bank.questions;
  const posts = [...sitePosts(config), ...siblingRuns(config)];
  const stages = config.stages ?? MINER_STAGE_MAP;
  const candidates = list.filter((q) => stages[q.stage] && demanded(q) && !answeredBy(q.canonical_question, posts).length)
    .filter((q) => !topics.some((t) => t.main_question === q.canonical_question));
  const out = join(config.runDir, '01-topics-new.json');
  rmSync(out, { force: true });
  await judge(config, 'topics', {
    runDir: config.runDir, domain: config.our_site.domain, keyword: config.keyword, market: config.market,
    niche: config.niche, persona: config.persona, count,
    candidates: candidates.map((q) => `- [${stages[q.stage]}, ${q.priority}] ${q.canonical_question}`).join('\n'),
    routes: siteRoutes(config).map((r) => `- ${r}`).join('\n') || '(none)',
    posts: postsForPrompt(posts),
    taken: topics.map((t) => `- ${t.keyword}: ${t.main_question}`).join('\n') || '(none)',
  }, out, 'topics');
  const picked = readJson(out).topics ?? [];
  rmSync(out);
  const slugs = new Set(topics.map((t) => t.slug));
  for (const t of picked) {
    if (!t.slug || !t.keyword || slugs.has(t.slug)) throw new Error(`topics: bad or repeated topic ${JSON.stringify(t)}`);
    if (!candidates.some((q) => q.canonical_question === t.main_question)) throw new Error(`topics: main question not a candidate: ${t.main_question}`);
    slugs.add(t.slug);
    log(`topic ${t.slug}: ${t.keyword} — ${t.main_question}`);
  }
  if (picked.length < count) throw new Error(`topics: ${picked.length} of ${count} topics chosen`);
  return picked.slice(0, count);
}

// `geo all` for one topic, unattended; its output is shown and the last lines kept as the reason of a failure.
function spawnAll(runDir) {
  return new Promise((done) => {
    const child = spawn(process.execPath, [resolve(import.meta.dirname, '../bin/geo.mjs'), 'all', runDir], { env: { ...process.env, GEO_UNATTENDED: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let text = '';
    const keep = (chunk, stream) => { stream.write(chunk); text = (text + chunk).slice(-4000); };
    child.stdout.on('data', (c) => keep(c, process.stdout));
    child.stderr.on('data', (c) => keep(c, process.stderr));
    child.on('close', (code) => done({ code, tail: text.trim().split(/\r?\n/).filter((l) => /error|fail|quote|unfilled|missing/i.test(l)).slice(-3).join(' | ') || text.trim().split(/\r?\n/).slice(-1)[0] || '' }));
  });
}
