#!/usr/bin/env node

// The image positions the build left without a photo (data-media-slot: an image slot the renderer drew as a grey
// frame), page by page, right after every build: docs/research/image-slots.json and .md. It never fails the run (owner
// 2026-11-18: image problems are reported, never holding). The images step reads the list as an input, so the next
// run plans the library again, and the plan counts the positions the library leaves empty (lib/image-plan.mjs
// libraryGaps); the photos it would make are reported before they are made (owner 2026-11-18).
// aloha 2026-11-18: six grey frames went through every build and check and were first found by the claude-seo audit;
// the only check of them was the launch preflight's (image_slot_present), which runs at the release step.
// Usage: node scripts/check-image-slots.mjs [dist]

import { existsSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { runMain } from './lib/cli.mjs';
import { writeJson } from './lib/json-io.mjs';

// The pages of a build that are no part of the site (the style board, the trial pages).
const NOT_SITE = /^\/(style-board|trial)\//;

// The image slots of one page's HTML: [{ kind, block }] in page order.
export function pageSlots(html) {
  const slots = [];
  const pattern = /data-media-slot="([a-z-]+)"/g;
  for (let match = pattern.exec(html); match; match = pattern.exec(html)) {
    const before = html.lastIndexOf('data-block-id="', match.index);
    const block = before >= 0 ? html.slice(before + 15, html.indexOf('"', before + 15)) : null;
    slots.push({ kind: match[1], block });
  }
  return slots;
}

async function htmlFiles(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await htmlFiles(path)));
    else if (entry.name === 'index.html') found.push(path);
  }
  return found;
}

export async function imageSlots({ root = process.cwd(), dist = 'dist' } = {}) {
  const base = resolve(root, dist);
  if (!existsSync(base)) throw new Error(`no build in ${dist}/`);
  const pages = [];
  for (const file of await htmlFiles(base)) {
    const route = `/${relative(base, file).split(sep).slice(0, -1).join('/')}${relative(base, file).includes(sep) ? '/' : ''}`;
    if (NOT_SITE.test(route)) continue;
    const slots = pageSlots(await readFile(file, 'utf8'));
    if (slots.length) pages.push({ route, slots });
  }
  pages.sort((a, b) => a.route.localeCompare(b.route));
  const total = pages.reduce((sum, page) => sum + page.slots.length, 0);
  const report = { schemaVersion: 'seo-site-image-slots-v1', checkedAt: new Date().toISOString(), total, pages };
  await writeJson(resolve(root, 'docs/research/image-slots.json'), report);
  const lines = ['# 构建后的空图位', '', total ? `${pages.length} 个页面共 ${total} 个图位没有照片（灰框）。不拦流程；下一轮出图步骤会把它们算进出图计划，开画前先报张数和费用。` : '没有空图位。', ''];
  for (const page of pages) lines.push(`- \`${page.route}\`：${page.slots.map((slot) => `${slot.kind}${slot.block ? `（${slot.block}）` : ''}`).join('、')}`);
  await writeFile(resolve(root, 'docs/research/image-slots.md'), `${lines.join('\n')}\n`);
  return report;
}

runMain(import.meta.url, async () => {
  const report = await imageSlots({ dist: process.argv[2] ?? 'dist' });
  console.log(report.total ? `image slots: ${report.total} on ${report.pages.length} page(s) (docs/research/image-slots.md)` : 'image slots: none');
});
