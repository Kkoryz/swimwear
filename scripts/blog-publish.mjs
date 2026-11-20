#!/usr/bin/env node

// After launch: publishes reviewed articles from the queue, a few at a time, on the days site.json blogPublish names
// (lib/blog-schedule.mjs). A package in content/blog-queue/approved (seo-site-blog-post-v1, with review.by and
// review.at: a GEO article's AI review, lib/blog-review.mjs, put it there) is checked again (lib/blog-gates.mjs; its
// main search held against the pages' primaries and secondaries and the published articles' main searches, site.json
// blogPublish.cannibal: "block" by default, "report" or false);
// one that passes joins src/data/blog-posts.json with today's publication date and moves to content/blog-queue/published,
// one that fails stays, with its report in content/blog-queue/report.json. An update of a published post (same slug)
// keeps its publication date and moves dateModified only when the article's content changed. The placeholder posts
// leave with the first real one. Then the normal release (build, preflight, deploy, IndexNow) ships it.
// Usage: node scripts/blog-publish.mjs [--scheduled] [--limit N] [--now <ISO date>]

import { createHash } from 'node:crypto';
import { mkdir, readdir, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { withSiteLock } from './lib/audit-runtime.mjs';
import { blogGates } from './lib/blog-gates.mjs';
import { blogSchedule, dueToday } from './lib/blog-schedule.mjs';
import { cliArgs, runMain, wholeNumber } from './lib/cli.mjs';
import { companyFacts } from './lib/facts.mjs';
import { readJson, writeJson } from './lib/json-io.mjs';
import { blogCannibalMode } from './lib/prelaunch/config.mjs';
import { pageSearches, postSearches } from './lib/site-keywords.mjs';
import { loadSitePages } from './lib/site-pages.mjs';

const contentHash = (post) => createHash('sha256').update(JSON.stringify({ ...post, datePublished: null, dateModified: null, review: null })).digest('hex');

// only: the slugs to publish (the blog flow's run publishing what it just wrote); the others wait for their day.
// Under the site's run lock (lib/audit-runtime.mjs withSiteLock): never while a site-run is going on that did not start
// it (GitHub Actions' scheduled publishing has no site-run: it takes the lock of its own checkout).
export const publishQueued = (options = {}) => withSiteLock(options.root ?? process.cwd(), 'blog publishing', () => publish(options));
async function publish({ root = process.cwd(), limit = 1, now = new Date(), only = null } = {}) {
  const queue = resolve(root, 'content/blog-queue');
  await mkdir(resolve(queue, 'approved'), { recursive: true });
  await mkdir(resolve(queue, 'published'), { recursive: true });
  const postsPath = resolve(root, 'src/data/blog-posts.json');
  const current = await readJson(postsPath, []);
  // Articles built for review (status review) stay until their reviewed package replaces them.
  let posts = current.filter((post) => post.status !== 'placeholder');
  const placeholders = current.filter((post) => post.status === 'placeholder');
  const publishedPost = (slug) => posts.find((item) => item.slug === slug && item.status === 'published');
  const facts = await companyFacts(root);
  // The cannibalisation gate (site.json blogPublish.cannibal, "block" by default): the pages' searches from the Site
  // Factory snapshot, the published articles' as they stand when each one is checked (one published earlier in this
  // run included).
  const cannibal = blogCannibalMode(await readJson(resolve(root, 'site.json'), {}));
  const { source, searches: pageKeywords } = cannibal === 'off' ? { source: null, searches: [] } : await pageSearches(root);
  const files = (await readdir(resolve(queue, 'approved'))).filter((file) => file.endsWith('.json') && (!only || only.includes(file.slice(0, -'.json'.length)))).sort();
  const report = [];
  let published = 0;
  for (const file of files) {
    if (published >= limit) break;
    const post = { ...(await readJson(resolve(queue, 'approved', file))), status: 'published' };
    const before = publishedPost(post.slug);
    const stamp = now.toISOString().replace(/\.\d{3}Z$/, 'Z');
    post.datePublished = before?.datePublished ?? stamp;
    post.dateModified = before && contentHash(before) === contentHash(post) ? before.dateModified : stamp;
    const pages = (await loadSitePages(root)).filter((page) => page.status !== 'placeholder');
    const searches = [...pageKeywords, ...postSearches(posts.filter((item) => item.status === 'published'))];
    const { failures, warnings } = blogGates(post, { facts, pages, today: new Date(now.getTime() + 1000), searches, cannibal });
    if (cannibal !== 'off' && !source) warnings.push('no Site Factory keywords (site.json siteFactory): the main search was held against the published articles only');
    report.push({ file, slug: post.slug, failures, warnings });
    if (failures.length) continue;
    posts = [...posts.filter((item) => item.slug !== post.slug), post];
    await writeJson(postsPath, posts);
    await rename(resolve(queue, 'approved', file), resolve(queue, 'published', file));
    published += 1;
  }
  // Placeholder posts stay only while there is no real article.
  if (!posts.length && placeholders.length) await writeJson(postsPath, placeholders);
  await writeJson(resolve(queue, 'report.json'), { at: now.toISOString(), published, report });
  return { published, report };
}

// A run of the schedule (site.json blogPublish, lib/blog-schedule.mjs): on a publishing day, as many articles as the
// site publishes a day; on another day nothing. A run by hand (not scheduled) publishes now, the day's number unless
// a limit is given.
export async function publishDue({ root = process.cwd(), now = new Date(), scheduled = false, limit = null } = {}) {
  const schedule = blogSchedule(await readJson(resolve(root, 'site.json'), {}));
  if (scheduled && !dueToday(schedule, now)) return { published: 0, report: [], skipped: `not a publishing day (${schedule.days === 'daily' ? 'daily' : schedule.days.join(', ')})` };
  return publishQueued({ root, now, limit: limit ?? schedule.perDay });
}

runMain(import.meta.url, async () => {
  const { limit, scheduled, now } = cliArgs({ limit: { type: 'string' }, scheduled: { type: 'boolean' }, now: { type: 'string' } }).values;
  const { published, report, skipped } = await publishDue({ scheduled: Boolean(scheduled), limit: limit ? wholeNumber('--limit', limit) : null, ...(now ? { now: new Date(now) } : {}) });
  if (skipped) console.log(skipped);
  for (const item of report) console.log(`${item.slug}: ${item.failures.length ? `held (${item.failures.join('; ')})` : 'published'}${item.warnings.length ? ` — warnings: ${item.warnings.join('; ')}` : ''}`);
  console.log(`${published} article(s) published`);
});
