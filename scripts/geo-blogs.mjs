#!/usr/bin/env node

// The site's GEO blog posts, the last step of a site run (owner 2026-10-31: "做站时自动跑三次，加上三个 blog"; the GEO
// module stays a module of its own): writes the site's profile for it (docs/research/geo-site.json, schema geo-site/v1)
// and runs its `geo site` command, which picks the topics, writes the posts and brings each in through
// import-geo-article.mjs. The site knows only that command, the profile and its own importer.
// The GEO module: site.json "geoBlog": { "dir", "count", "market", "niche", "persona", "alsoWatch", "stages",
// "tradeExamples" }, else GEO_BLOG_DIR.
// Without one the step waits.
// site.json geoBlog.flow "v2" runs the blog flow of 2026-11-16 instead (lib/blog-v2.mjs: Site Factory's topics and
// research, geo-blog's writer, the final check, then this site's importer; a post that passes is published at once):
// as many new posts as the site lacks of geoBlog.count, or --count N more. Any other flow (or none) is the one above,
// kept to go back to.
// Usage: node scripts/geo-blogs.mjs [--profile-only] [--count N]

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PROFILE_V2, appendBatchLog, blogSiteProfile, geoPostCount, isV2, writePosts } from './lib/blog-v2.mjs';
import { cliArgs, runMain } from './lib/cli.mjs';
import { pictureTarget } from './lib/geo-article.mjs';
import { readJson, writeJson } from './lib/json-io.mjs';
import { FIRECRAWL, createRulesLibrary, librarySettings } from './lib/rules-library.mjs';

export const PROFILE = 'docs/research/geo-site.json';
export const POSTS = 3;
// The owner's limit for a paid call made without asking (2026-10-31: "0.5usd以下不用问我").
export const BUDGET_USD = 0.5;
const WAITS = 2;

// The site's main search query: Site Factory's home page primary query.
const mainQuery = (keywords) => (keywords?.pages ?? []).find((page) => page.type === 'home')?.primary?.query ?? null;

// One field of the project's project.yaml (YAML in its JSON form is JSON, as import-brand-kit.mjs reads it).
const projectField = (yaml, key) => (yaml.trim().startsWith('{') ? JSON.parse(yaml)[key] : yaml.match(new RegExp(`^${key}:\\s*(.+?)\\s*(#.*)?$`, 'm'))?.[1]?.replace(/^["']|["']$/g, ''));

// Who the posts are for, for a question bank built from nothing: site.json geoBlog.niche / persona, else the project's
// kind of business. Only a B2B manufacturer has wording here (the swimwear question bank's, 2026-10); another kind
// names its own in site.json rather than borrow it.
export function audience(project, site) {
  const own = { niche: site.geoBlog?.niche, persona: site.geoBlog?.persona };
  if (own.niche && own.persona) return own;
  const category = projectField(project, 'category');
  if (projectField(project, 'domain') !== 'b2b-manufacturer' || !category) throw new Error('site.json geoBlog needs niche and persona (the project is not a B2B manufacturer with a category)');
  return {
    niche: own.niche ?? `${category} manufacturer (OEM/ODM/private label), B2B`,
    persona: own.persona ?? `Brand founders, startup and small ${category} brands, online sellers and boutique owners sourcing a factory to produce their own ${category} line. NOT consumers buying ${category} for themselves.`,
  };
}

export async function geoSiteProfile(root, site) {
  const identity = await readJson(resolve(root, 'src/data/site-identity.json'), {});
  const keywords = await readJson(`${site.siteFactory}/keywords.json`, null);
  const keyword = mainQuery(keywords);
  if (!identity.origin || !identity.siteName) throw new Error('src/data/site-identity.json has no origin or siteName');
  if (!keyword) throw new Error(`${site.siteFactory}/keywords.json names no home page primary query`);
  const siteDir = resolve(root).replace(/\\/g, '/');
  const { niche, persona } = audience(await readFile(`${site.identity}/project.yaml`, 'utf8'), site);
  // The pictures an article may have (owner 2026-11-11: their density is 08's; SF 2026-11-16: a cap, one picture per
  // this many words of a section at most): the site's reference blog measured (measure-reference-article.mjs), held to
  // the readable range as the importer reports it (lib/geo-article.mjs pictureTarget). Not measured, not given: the
  // writer uses its own.
  const measured = (await readJson(resolve(root, 'src/data/article-rhythm.json'), null))?.wordsPerPicture;
  return {
    schema: 'geo-site/v1',
    site_dir: siteDir,
    domain: new URL(identity.origin).host,
    brand_terms: [identity.siteName.toLowerCase()],
    keyword,
    market: site.geoBlog?.market ?? 'US (en)',
    niche,
    persona,
    competitors: [new URL(site.reference.origin).host.replace(/^www\./, '')],
    also_watch: site.geoBlog?.alsoWatch ?? [],
    facts_file: `${site.siteFactory}/facts.yaml`,
    sitemap: `${siteDir}/dist/sitemap.xml`,
    posts: `${siteDir}/src/data/blog-posts.json`,
    site_import: { cwd: siteDir, command: ['node', 'scripts/import-geo-article.mjs', '{runDir}'] },
    count: site.geoBlog?.count ?? POSTS,
    budget_usd_per_article: BUDGET_USD,
    ...(measured ? { words_per_picture: pictureTarget(measured) } : {}),
    // A trade other than a manufacturer's names its question stages and examples (the GEO module's defaults are a
    // manufacturer's).
    ...(site.geoBlog?.stages ? { stages: site.geoBlog.stages } : {}),
    ...(site.geoBlog?.tradeExamples ? { trade_examples: site.geoBlog.tradeExamples } : {}),
  };
}

export const geoDir = (site, env = process.env) => site.geoBlog?.dir ?? env.GEO_BLOG_DIR ?? null;

// Sites run their blog posts side by side: the GEO module holds the owner's signed-in Chrome profile only while a
// run asks the engines (its src/browser.mjs lockProfile; 2026-11-17, two sites' runs opening it at once failed three
// posts), and the rest of a run (fetching, writing) goes on beside the others.
const runGeo = (dir, profile) => new Promise((done) => {
  const child = spawn(process.execPath, [resolve(dir, 'bin/geo.mjs'), 'site', profile], { stdio: 'inherit' });
  child.on('close', (code) => done(code ?? 1));
});

// The v2 flow's run of this step: exit 0 with the posts written (a held one stays in drafts, reported), 2 when it waits
// for the owner (no topic list approved, no topic left).
export async function runV2(root, site, { count = null, write = writePosts } = {}) {
  const wanted = count ?? Math.max(0, (site.geoBlog?.count ?? POSTS) - await geoPostCount(root));
  if (site.geoBlog?.v2 && !existsSync(resolve(site.geoBlog.v2.siteFactory ?? '', 'src/sitefactory/blog/site_run.py'))) {
    console.log(`waiting: geoBlog.v2.siteFactory has no src/sitefactory/blog/site_run.py (${site.geoBlog.v2.siteFactory})`);
    return WAITS;
  }
  const entry = await write({ root, site, count: wanted, publish: true });
  if (wanted > 0) await appendBatchLog(root, { ...entry, by: 'geo-blogs' });
  if (entry.waiting) console.log(`waiting: ${entry.waiting}`);
  return entry.waiting ? WAITS : 0;
}

runMain(import.meta.url, async () => {
  const { values } = cliArgs({ 'profile-only': { type: 'boolean' }, count: { type: 'string' } });
  const site = await readJson(resolve('site.json'));
  if (isV2(site)) {
    if (values['profile-only']) return writeJson(resolve(PROFILE_V2), await blogSiteProfile('.', site));
    process.exit(await runV2('.', site, { count: values.count ? Number(values.count) : null }));
  }
  await writeJson(resolve(PROFILE), await geoSiteProfile('.', site));
  if (values['profile-only']) return;
  const dir = geoDir(site);
  if (!dir || !existsSync(resolve(dir, 'bin/geo.mjs'))) {
    console.log(`waiting: no GEO module (site.json geoBlog.dir or GEO_BLOG_DIR${dir ? `: ${dir} has no bin/geo.mjs` : ''})`);
    process.exit(WAITS);
  }
  // The GEO module fetches every cited page through Firecrawl (Docker Desktop): it is held while the posts are written,
  // and let go after (lib/rules-library.mjs FIRECRAWL). Without it the posts would be written from no source page at
  // all (2026-11-18: Firecrawl went down with Docker Desktop when the rules library was let go, and every blog run since
  // fetched none of its sources). When it cannot be started the posts go on: the GEO module reads a page Firecrawl
  // cannot through the cloud Firecrawl, a headless Chrome or Claude's WebFetch (its src/fetch.mjs; owner 2026-11-18:
  // "起不来就停下等待 用云端或者llm兜底啊").
  const firecrawl = createRulesLibrary({ settings: librarySettings(process.env, FIRECRAWL) });
  const held = await firecrawl.acquire({ label: 'geo-blogs' });
  if (!held.ok) console.log(`warning: Firecrawl does not answer (${held.detail ?? 'not started'}); the posts fetch their sources the other ways`);
  let code;
  try { code = await runGeo(dir, PROFILE); } finally { if (held.ok) await firecrawl.release({ id: held.id }); }
  // geo site exits 0 when the site has its posts, 2 when it stops for the owner (a quote over the limit, a sign-in).
  process.exit(code);
});
