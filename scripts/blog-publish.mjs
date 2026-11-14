#!/usr/bin/env node

// After launch: publishes reviewed articles from the queue, a few at a time. A package in content/blog-queue/approved
// (seo-site-blog-post-v1, with review.by and review.at from the person who checked it) is checked (lib/blog-gates.mjs);
// one that passes joins src/data/blog-posts.json with today's publication date and moves to content/blog-queue/published,
// one that fails stays, with its report in content/blog-queue/report.json. An update of a published post (same slug)
// keeps its publication date and moves dateModified only when the article's content changed. The placeholder posts
// leave with the first real one. Then the normal release (build, preflight, deploy, IndexNow) ships it.
// Usage: node scripts/blog-publish.mjs [--limit 1]

import { createHash } from 'node:crypto';
import { mkdir, readdir, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { blogGates } from './lib/blog-gates.mjs';
import { cliArgs, runMain } from './lib/cli.mjs';
import { companyFacts } from './lib/facts.mjs';
import { readJson, writeJson } from './lib/json-io.mjs';
import { loadSitePages } from './lib/site-pages.mjs';

const contentHash = (post) => createHash('sha256').update(JSON.stringify({ ...post, datePublished: null, dateModified: null, review: null })).digest('hex');

export async function publishQueued({ root = process.cwd(), limit = 1, now = new Date() } = {}) {
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
  const files = (await readdir(resolve(queue, 'approved'))).filter((file) => file.endsWith('.json')).sort();
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
    const { failures, warnings } = blogGates(post, { facts, pages, today: new Date(now.getTime() + 1000) });
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

runMain(import.meta.url, async () => {
  const { limit } = cliArgs({ limit: { type: 'string' } }).values;
  const { published, report } = await publishQueued({ limit: limit === undefined ? 1 : Number(limit) });
  for (const item of report) console.log(`${item.slug}: ${item.failures.length ? `held (${item.failures.join('; ')})` : 'published'}${item.warnings.length ? ` — warnings: ${item.warnings.join('; ')}` : ''}`);
  console.log(`${published} article(s) published`);
});
