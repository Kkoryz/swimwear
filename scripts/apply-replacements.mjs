#!/usr/bin/env node

// Applies Site Factory's replacement lists to the site's own page content (lib/replacements.mjs): every list kept in
// content/replacements/ (in their order of name), after every import (the import step runs it), and on its own after
// `add`, which copies a new list in first. Writes docs/research/replacements.json and .md: per item replaced, already
// applied, or missing (to be done by hand); a missing one fails the step, so it is not lost.
// Usage: node scripts/apply-replacements.mjs [add <list.json> [name]]

import { existsSync } from 'node:fs';
import { copyFile, mkdir, readdir, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { cliArgs, runMain } from './lib/cli.mjs';
import { readJson, writeJson } from './lib/json-io.mjs';
import { SITE_FIELDS, applyReplacements, listItems } from './lib/replacements.mjs';
import { recordPageDates } from './lib/site-pages.mjs';

export const REPLACEMENTS_DIR = 'content/replacements';
export const SKIPPED = 'skipped.json';
const BLOG_ROUTE = '/blog/';

export async function addReplacementList(root, file, name = null) {
  listItems(await readJson(resolve(file)));
  const dir = resolve(root, REPLACEMENTS_DIR);
  await mkdir(dir, { recursive: true });
  const target = resolve(dir, name ? `${name.replace(/\.json$/, '')}.json` : basename(file));
  if (existsSync(target)) throw new Error(`${REPLACEMENTS_DIR}/${basename(target)} is there already: name the new list`);
  await copyFile(resolve(file), target);
  return target;
}

export async function runReplacements({ root = process.cwd() } = {}) {
  const dir = resolve(root, REPLACEMENTS_DIR);
  // SKIPPED: items not to apply, each with why ({ "<list>#<n>": "reason" }; MotelPilot's full_1117a_fix1 #1 2026-11-17:
  // an earlier version of a line the package has since changed again). Shown as skipped, never failing the step.
  const names = existsSync(dir) ? (await readdir(dir)).filter((name) => name.endsWith('.json') && name !== SKIPPED).sort() : [];
  const skipped = await readJson(resolve(dir, SKIPPED), {});
  const lists = [];
  // A skipped item is not checked either: one Site Factory wrote as an addition (an empty old: Strandmill fix4 #4 to #7,
  // sections and questions the site's package patch adds, lib/package-patches.mjs) is no replacement.
  for (const name of names) lists.push({ name, items: listItems(await readJson(resolve(dir, name)), (item) => !skipped[`${name}#${item.n}`]) });
  const pagesPath = resolve(root, 'src/data/authoring-pages.json');
  const pages = await readJson(pagesPath, []);
  // Copy kept apart from the pages, each read as the page at its address: the blog hub (src/data/blog.json, written by
  // the import: Strandmill fix2 #52 2026-11-18, the hub's freight sentence, found no page) and the blog posts
  // (src/data/blog-posts.json at /blog/<slug>/: MotelPilot 2026-11-18, the GEO posts' service area and on-site work
  // put to the site's facts, and kept so through every import).
  const extras = [];
  const blogPath = resolve(root, 'src/data/blog.json');
  const blog = pages.some((page) => page.route === BLOG_ROUTE) ? null : await readJson(blogPath, null);
  if (blog) extras.push({ route: BLOG_ROUTE, value: blog, write: async (value) => { await writeJson(blogPath, value); } });
  const postsPath = resolve(root, 'src/data/blog-posts.json');
  const postsFile = await readJson(postsPath, null);
  const posts = Array.isArray(postsFile) ? postsFile : postsFile?.posts ?? [];
  const postsOut = [...posts];
  posts.forEach((post, index) => {
    const route = `${BLOG_ROUTE}${post.slug}/`;
    if (post.slug && !pages.some((page) => page.route === route)) extras.push({ route, value: post, write: (value) => { postsOut[index] = value; } });
  });
  // The trust bar (src/data/site-trust.json), the site-level field Site Factory names by section (lib/replacements.mjs
  // SITE_FIELDS).
  const trustPath = resolve(root, 'src/data/site-trust.json');
  const trust = await readJson(trustPath, null);
  if (trust) extras.push({ route: SITE_FIELDS.trust_bar, value: trust, write: async (value) => { await writeJson(trustPath, value); } });
  const applied = applyReplacements([...pages, ...extras.map(({ route, value }) => ({ ...value, route }))], lists);
  const extraRoutes = new Set(extras.map((extra) => extra.route));
  const next = applied.pages.slice(0, pages.length);
  const results = [...applied.results, ...Object.entries(skipped).map(([key, reason]) => { const [list, n] = key.split('#'); return { list, n: Number(n) || n, url: '', status: 'skipped', reason }; })];
  const changed = (route) => results.some((item) => item.status === 'replaced' && (item.route ?? item.url) === route);
  // Written when a page changed: an item replaced, or a card set settled (lib/replacements.mjs settleCardSets).
  if (JSON.stringify(next) !== JSON.stringify(pages)) await writeJson(pagesPath, next);
  // Each extra written back as it was kept: no route, and structured data only where it had some.
  let postsChanged = false;
  for (const [k, extra] of extras.entries()) {
    if (!changed(extra.route)) continue;
    const { route, jsonLd, ...value } = applied.pages[pages.length + k];
    void route;
    await extra.write('jsonLd' in extra.value ? { ...value, jsonLd } : value);
    if (extra.route !== BLOG_ROUTE) postsChanged = true;
  }
  if (postsChanged) await writeJson(postsPath, Array.isArray(postsFile) ? postsOut : { ...postsFile, posts: postsOut });
  // The pages' dates follow their content as replaced (the import records them before the lists are applied: aloha audit
  // 2026-11-18 L-5, one lastmod in the sitemap of 46 pages).
  if (pages.length) await recordPageDates({ root });
  const count = (status) => results.filter((item) => item.status === status).length;
  const report = { schemaVersion: 'seo-site-replacements-v1', lists: names, replaced: count('replaced'), applied: count('applied'), superseded: count('superseded'), skipped: count('skipped'), missing: results.filter((item) => ['missing', 'no-page'].includes(item.status)), results };
  await mkdir(resolve(root, 'docs/research'), { recursive: true });
  await writeJson(resolve(root, 'docs/research/replacements.json'), report);
  const rows = results.map((item) => `| ${item.list} | ${item.n ?? ''} | ${item.url} | ${item.section ?? ''} | ${{ replaced: '已替换', applied: '已是新句', superseded: '已被后面的清单再改', skipped: `跳过：${item.reason}`, missing: '找不到原句', 'no-page': '没有这一页' }[item.status]} | ${item.content ?? ''} | ${item.structuredData ?? ''} |`);
  await writeFile(resolve(root, 'docs/research/replacements.md'), [
    '# Site Factory 替换清单的执行结果', '',
    `清单：${names.join('、') || '无'}。本次替换 ${report.replaced} 条，之前已替换 ${report.applied} 条，被后面的清单再改 ${report.superseded} 条，跳过 ${report.skipped} 条，找不到原句 ${report.missing.length} 条（要手工处理）。`, '',
    '| 清单 | 序号 | 页面 | 节 | 结果 | 正文处数 | 结构化数据处数 |', '|---|---|---|---|---|---|---|', ...rows, '',
  ].join('\n'));
  return report;
}

runMain(import.meta.url, async () => {
  const { positionals } = cliArgs();
  if (positionals[0] === 'add') {
    if (!positionals[1]) throw new Error('Usage: node scripts/apply-replacements.mjs add <list.json> [name]');
    console.log(`kept ${await addReplacementList(process.cwd(), positionals[1], positionals[2] ?? null)}`);
  }
  const report = await runReplacements();
  console.log(`replacements: ${report.replaced} replaced, ${report.applied} already applied, ${report.missing.length} missing (docs/research/replacements.md)`);
  if (report.missing.length) throw new Error(`${report.missing.length} replacement(s) found neither the old nor the new sentence: ${report.missing.map((item) => `${item.list} #${item.n} ${item.url}`).join('; ')}`);
});
