// The blog flow of 2026-11-16 (Site Factory's sitefactory.blog.site_run, geo-blog's writer), as a site runs it: the
// site build's geo-blogs step and the batch (blog-batch.mjs) both write through writePosts. site.json geoBlog.flow
// "v2" picks it (anything else, or none, keeps the earlier `geo site` flow); geoBlog.v2 names where it runs:
//   siteFactory  the Site Factory checkout (its src/ holds sitefactory.blog.site_run)
//   project      the site's Site Factory project copy (artifacts 01_1, 04_1, 05_3, 05_9, 06_1)
//   cache        its request cache (SF_CACHE_DB); metrics: its shared metrics db
//   work         the site's blog work folder (topics.json, blog_registry.json, peer_sites.json, blog_facts.json)
//   geoDir       the geo-blog checkout the articles are written in (default geoBlog.dir)
//   approveUsd / cloudUsd / topicsApproveUsd   what an article, its cloud pages and a topic list may spend
//   topicRoutes / topicTop   the topic list's routes (bucket, ai) and each route's first searches read on Google
//   claudeBin    Claude Code's executable (else SF_CLAUDE_BIN); python: the interpreter (default python)
// geoBlog.audience ("a property owner in the United States") is who the engines are asked to answer for, geoBlog.exclude
// the searches not to write (earlier runs kept elsewhere). One run: the next topics (site_run pick: the topic list,
// held once against the site's pages and posts), each article researched and written to its final check (site_run
// article), imported by import-geo-article.mjs (its AI review: passed, the package waits in content/blog-queue/approved;
// held, it stays in drafts), and, when asked, published at once (blog-publish.mjs; otherwise the site's blogPublish
// schedule publishes it). Every run is logged in content/blog-queue/batch-log.json.

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pictureTarget } from './geo-article.mjs';
import { readJson, writeJson } from './json-io.mjs';

export const PROFILE_V2 = 'docs/research/blog-site.json';
export const BATCH_LOG = 'content/blog-queue/batch-log.json';
export const FLOW_V2 = 'v2';
// What an article may spend unasked (owner: each article's cloud at most USD 0.1; Serper and AI Overview receipts are
// cents) and a topic list (volumes and first pages: about USD 0.3 a site, 11-18).
export const ARTICLE_USD = 0.1;
export const CLOUD_USD = 0.1;
const HOUR = 3600 * 1000;
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export const isV2 = (site) => site.geoBlog?.flow === FLOW_V2;

// The site profile Site Factory's site_run reads (blog-site/v2).
export async function blogSiteProfile(root, site, env = process.env) {
  const blog = site.geoBlog ?? {};
  const v2 = blog.v2 ?? {};
  const need = ['siteFactory', 'project', 'cache', 'work'].filter((key) => !v2[key]);
  if (need.length) throw new Error(`site.json geoBlog.v2 needs ${need.join(', ')}`);
  if (!blog.audience) throw new Error('site.json geoBlog.audience is missing (who the AI engines are asked to answer for)');
  const identity = await readJson(resolve(root, 'src/data/site-identity.json'), {});
  if (!identity.origin || !identity.siteName) throw new Error('src/data/site-identity.json has no origin or siteName');
  const siteDir = resolve(root).replace(/\\/g, '/');
  const measured = (await readJson(resolve(root, 'src/data/article-rhythm.json'), null))?.wordsPerPicture;
  const claudeBin = env.SF_CLAUDE_BIN ?? v2.claudeBin ?? null;
  return {
    schema: 'blog-site/v2',
    site_dir: siteDir,
    domain: new URL(identity.origin).host,
    brand_terms: [identity.siteName.toLowerCase()],
    audience: blog.audience,
    market: blog.market ?? 'US (en)',
    sf_project: v2.project,
    cache_db: v2.cache,
    ...(v2.metrics ? { metrics_db: v2.metrics } : {}),
    work_dir: v2.work,
    geo_dir: v2.geoDir ?? blog.dir,
    facts_file: site.siteFactory ? `${site.siteFactory}/facts.yaml` : null,
    posts: `${siteDir}/src/data/blog-posts.json`,
    sitemap: `${siteDir}/dist/sitemap.xml`,
    exclude: blog.exclude ?? [],
    ...(v2.topicRoutes ? { topic_routes: v2.topicRoutes } : {}),
    ...(v2.topicTop ? { topic_top: v2.topicTop } : {}),
    approve_usd_per_article: v2.approveUsd ?? ARTICLE_USD,
    cloud_usd_per_article: v2.cloudUsd ?? CLOUD_USD,
    ...(measured ? { words_per_picture: pictureTarget(measured) } : {}),
    ...(claudeBin ? { accounts: { claude_bin: claudeBin } } : {}),
  };
}

// One site_run command: its stderr and stdout passed through, its result the JSON of its last stdout line.
export function siteRun(site, args, { profile = PROFILE_V2, root = process.cwd() } = {}) {
  const v2 = site.geoBlog?.v2 ?? {};
  return new Promise((done, fail) => {
    const env = { ...process.env, PYTHONPATH: resolve(v2.siteFactory, 'src'), PYTHONUTF8: '1' };
    const child = spawn(v2.python ?? 'python', ['-m', 'sitefactory.blog.site_run', ...args, '--profile', resolve(root, profile)], { cwd: v2.siteFactory, env, stdio: ['ignore', 'pipe', 'inherit'] });
    let out = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { out += chunk; process.stdout.write(chunk); });
    child.on('error', fail);
    child.on('close', (code) => {
      const last = out.trim().split(/\r?\n/).at(-1) ?? '';
      if (code !== 0) return fail(new Error(`site_run ${args[0]} exited ${code}`));
      try { done(JSON.parse(last)); } catch { fail(new Error(`site_run ${args[0]}: no result line`)); }
    });
  });
}

// The site's GEO posts: published or waiting in the queue (post.geo marks an imported article).
export async function geoPostCount(root) {
  const posts = await readJson(resolve(root, 'src/data/blog-posts.json'), []);
  return posts.filter((post) => post.geo && post.status === 'published').length;
}

// count new articles: the topic list first when the site has none (within topicsApproveUsd, else the run waits for
// the owner's approval), then the next topics, each written, imported and (publish) published.
export async function writePosts({ root = process.cwd(), site, count, publish = false, run = siteRun, importer, publisher, now = () => new Date(), log = console.log }) {
  const v2 = site.geoBlog?.v2 ?? {};
  const results = [];
  const entry = { at: now().toISOString(), count, publish, written: results };
  if (count < 1) return { ...entry, waiting: null };
  await writeJson(resolve(root, PROFILE_V2), await blogSiteProfile(root, site));
  const opts = { root };
  if (!existsSync(resolve(v2.work, 'topics.json'))) {
    if (v2.topicsApproveUsd == null) return { ...entry, waiting: 'no topic list yet: set site.json geoBlog.v2.topicsApproveUsd (a topic list costs about USD 0.3) to build it' };
    log(`building the topic list (at most USD ${v2.topicsApproveUsd}) ...`);
    entry.topics = await run(site, ['topics', '--approve', String(v2.topicsApproveUsd)], opts);
  }
  const { picked, skipped } = await run(site, ['pick', '--count', String(count)], opts);
  entry.skipped = skipped;
  if (!picked.length) return { ...entry, waiting: 'the topic list has no topic left to write (the pool is the limit: build a new list, never loosen it)' };
  const doImport = importer ?? (await import('../import-geo-article.mjs')).importGeoArticle;
  const doPublish = publisher ?? (await import('../blog-publish.mjs')).publishQueued;
  for (const topic of picked) {
    log(`writing "${topic.query}" (${topic.name}) ...`);
    const article = await run(site, ['article', '--topic', topic.query, '--name', topic.name, '--approve', String(v2.approveUsd ?? ARTICLE_USD)], opts);
    const report = await doImport({ root, runDir: article.run });
    const result = { topic: topic.query, run: article.run, passed: article.passed, held: article.held, words: article.words, paidUsd: article.paid_usd, seconds: article.seconds, slug: report.slug, queue: report.review.passed ? 'approved' : 'drafts', reviewFailures: report.review.failures };
    if (publish && report.review.passed) {
      const { published, report: why } = await doPublish({ root, limit: 1, only: [report.slug], now: now() });
      result.queue = published ? 'published' : 'approved';
      if (!published) result.publishHeld = why.flatMap((item) => item.failures);
    }
    log(`${topic.query}: ${result.queue}${result.reviewFailures.length ? ` (${result.reviewFailures.join('; ')})` : ''}`);
    results.push(result);
  }
  return { ...entry, waiting: null };
}

export async function appendBatchLog(root, entry) {
  const path = resolve(root, BATCH_LOG);
  const log = await readJson(path, []);
  await writeJson(path, [...log, entry]);
}

// site.json geoBlog.write: { every: "day" | "week", count, weekday? }: how often the batch writes and how many. A
// scheduled run (Windows Task Scheduler, daily or weekly) writes only when due: "day" once a UTC day, "week" once in
// seven days, on `weekday` (sun..sat) when one is named.
export function writeSchedule(site) {
  const write = { every: 'week', count: 1, ...(site.geoBlog?.write ?? {}) };
  if (!['day', 'week'].includes(write.every)) throw new Error('site.json geoBlog.write.every must be "day" or "week"');
  if (!Number.isInteger(write.count) || write.count < 1) throw new Error('site.json geoBlog.write.count must be a whole number of at least 1');
  if (write.weekday != null && !DAYS.includes(write.weekday)) throw new Error(`site.json geoBlog.write.weekday must be one of ${DAYS.join(', ')}`);
  return write;
}

export function batchDue(schedule, log, now = new Date()) {
  const last = [...(log ?? [])].reverse().find((item) => item.scheduled)?.at;
  const lastAt = last ? new Date(last) : null;
  const sameDay = lastAt && lastAt.toISOString().slice(0, 10) === now.toISOString().slice(0, 10);
  if (schedule.every === 'day') return !sameDay;
  if (schedule.weekday) return DAYS[now.getUTCDay()] === schedule.weekday && !sameDay;
  // a weekly task can start a little earlier than a week after the last one
  return !lastAt || now - lastAt >= 7 * 24 * HOUR - 2 * HOUR;
}
