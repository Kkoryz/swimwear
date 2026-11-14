#!/usr/bin/env node

// The site's GEO blog posts, the last step of a site run (owner 2026-10-31: "做站时自动跑三次，加上三个 blog"; the GEO
// module stays a module of its own): writes the site's profile for it (docs/research/geo-site.json, schema geo-site/v1)
// and runs its `geo site` command, which picks the topics, writes the posts and brings each in through
// import-geo-article.mjs. The site knows only that command, the profile and its own importer.
// The GEO module: site.json "geoBlog": { "dir", "count", "market", "niche", "persona", "alsoWatch", "stages",
// "tradeExamples" }, else GEO_BLOG_DIR.
// Without one the step waits.
// Usage: node scripts/geo-blogs.mjs [--profile-only]

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { cliArgs, runMain } from './lib/cli.mjs';
import { readJson, writeJson } from './lib/json-io.mjs';

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
    // A trade other than a manufacturer's names its question stages and examples (the GEO module's defaults are a
    // manufacturer's).
    ...(site.geoBlog?.stages ? { stages: site.geoBlog.stages } : {}),
    ...(site.geoBlog?.tradeExamples ? { trade_examples: site.geoBlog.tradeExamples } : {}),
  };
}

export const geoDir = (site, env = process.env) => site.geoBlog?.dir ?? env.GEO_BLOG_DIR ?? null;

const runGeo = (dir, profile) => new Promise((done) => {
  const child = spawn(process.execPath, [resolve(dir, 'bin/geo.mjs'), 'site', profile], { stdio: 'inherit' });
  child.on('close', (code) => done(code ?? 1));
});

runMain(import.meta.url, async () => {
  const { values } = cliArgs({ 'profile-only': { type: 'boolean' } });
  const site = await readJson(resolve('site.json'));
  await writeJson(resolve(PROFILE), await geoSiteProfile('.', site));
  if (values['profile-only']) return;
  const dir = geoDir(site);
  if (!dir || !existsSync(resolve(dir, 'bin/geo.mjs'))) {
    console.log(`waiting: no GEO module (site.json geoBlog.dir or GEO_BLOG_DIR${dir ? `: ${dir} has no bin/geo.mjs` : ''})`);
    process.exit(WAITS);
  }
  // geo site exits 0 when the site has its posts, 2 when it stops for the owner (a quote over the limit, a sign-in).
  process.exit(await runGeo(dir, PROFILE));
});
