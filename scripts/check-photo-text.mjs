#!/usr/bin/env node

// The text check of every photo before it is made (owner 2026-11-17, via Site Factory: "关键是未来如何避免类似问题":
// photos off their pages were found only by the audits after the four sites were built, and their libraries were
// made again): each photo the plan is to make, checked by code against its page's H1 and copy (lib/photo-class.mjs
// photoTextProblems; no model). plan-images.mjs runs it on the plan it writes: a photo that fails is reported, its
// problems in textCheck, and made all the same (owner 2026-11-18: "不要硬卡这些图了"; it was held out of the queue,
// status held-text, and the run waited) and listed in docs/research/images/text-check.md (flagged), with the
// photos made before their class was planned that show a generic scene (kept; plan-images --replace-scenes plans them
// again). A photo the owner accepts as it is goes in docs/research/photo-text-waivers.json ({ "<photo id>": "why" }).
// --gate (the images step's last command): reports the photos flagged; it never holds the run (owner 2026-11-18).
// Usage: node scripts/check-photo-text.mjs [--gate]

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { cliArgs, runMain } from './lib/cli.mjs';
import { readJson, writeJson } from './lib/json-io.mjs';
import { GENERAL, SERVICE_HERO, isThemeCategory } from './lib/media-allocation.mjs';
import { themeById } from './lib/page-theme.mjs';
import { HELD_TEXT, photoClassOf, photoTextProblems } from './lib/photo-class.mjs';
import { pageCopy } from './lib/site-pages.mjs';
import { REJECTED_STATUSES } from './lib/image-plan.mjs';

const TO_MAKE = new Set(['planned', 'failed', ...REJECTED_STATUSES]);
export const TEXT_CHECK = 'docs/research/images/text-check.json';
export const TEXT_WAIVERS = 'docs/research/photo-text-waivers.json';

const pageWords = (page) => [page.hero?.heading, ...pageCopy(page)].filter(Boolean).join(' ');

// The pages a photo is for and their text: a section's ask, its page's H1 with its section's heading and text (a
// page's own opening photo: the H1 and its lead); any other photo, every page of its category (a theme's set: the
// theme's pages; the site-wide set: the pages of no category). A page whose copy is not written yet (a placeholder)
// has no text to check against (site11's about page: "[Placeholder] Company story").
function photoPages(entry, plan, pages) {
  const byRoute = new Map(pages.filter((page) => page.status !== 'placeholder').map((page) => [page.route, page]));
  if (entry.intent?.route) {
    const page = byRoute.get(entry.intent.route);
    if (!page) return { routes: [entry.intent.route], texts: [] };
    const block = (page.blocks ?? []).find((item) => (item.visuals ?? []).some((visual) => visual.id === entry.intent.id));
    const texts = entry.intent.id === SERVICE_HERO || !block ? [page.hero?.heading, ...(page.hero?.lead ?? [])] : [page.hero?.heading, ...pageCopy({ blocks: [block] })];
    return { routes: [page.route], texts: [texts.filter(Boolean).join(' ')] };
  }
  const routes = Object.entries(plan.routes ?? {}).filter(([route, category]) => (isThemeCategory(entry.category) ? plan.themes?.[route] === entry.category.split(':').at(-1) : category === entry.category)).map(([route]) => route);
  return { routes, texts: routes.map((route) => byRoute.get(route)).filter(Boolean).map(pageWords) };
}

// The theme the photo's page or category is shown with (lib/page-theme.mjs), or null.
function photoTheme(entry, plan, routes, briefs) {
  if (isThemeCategory(entry.category)) return themeById(entry.category.split(':').at(-1), briefs);
  if (!entry.intent && entry.category === GENERAL) return null;
  const id = routes.map((route) => plan.themes?.[route]).find(Boolean);
  return themeById(id ?? null, briefs);
}

// Checks the plan's photos still to be made and flags those that fail (their textCheck; the plan is changed in place;
// all are made). Returns the report: { checked, flagged: [{ id, kind, photoClass, routes, subject, problems }], held: []
// (none: plan-photo-briefs reads it), scenes: [...] }.
export function checkPlanText({ plan, pages, briefs, waivers = {} }) {
  const flagged = [];
  let checked = 0;
  // A photo an earlier run held goes back to the queue: nothing is held now.
  for (const entry of plan.entries) if (entry.status === HELD_TEXT) entry.status = 'planned';
  for (const entry of plan.entries) {
    if (!TO_MAKE.has(entry.status) || entry.phoneOf) continue;
    checked += 1;
    if (waivers[entry.id]) continue;
    const { routes, texts } = photoPages(entry, plan, pages);
    const problems = photoTextProblems(entry, { texts, theme: photoTheme(entry, plan, routes, briefs), briefs });
    if (!problems.length) { delete entry.textCheck; continue; }
    entry.textCheck = problems;
    flagged.push({ id: entry.id, kind: entry.kind, photoClass: entry.photoClass ?? photoClassOf(entry, briefs), routes, subject: entry.intent?.content ?? entry.subject, problems });
  }
  const scenes = plan.entries.filter((entry) => ['generated', 'approved'].includes(entry.status) && (entry.photoClass ?? photoClassOf(entry, briefs)) === 'scene').map((entry) => ({ id: entry.id, kind: entry.kind, subject: entry.intent?.content ?? entry.subject, alt: entry.alt ?? '' }));
  return { checked, flagged, held: [], scenes };
}

const PROBLEM = { off_topic: '与页面 H1、正文没有共同主题词', wrong_audience: '人群与页面主题不符', generic_scene: '服务站的通用场景图（不是脱敏报告、工作界面或交付资料）' };

export async function writeTextCheck(root, report) {
  await mkdir(resolve(root, 'docs/research/images'), { recursive: true });
  await writeJson(resolve(root, TEXT_CHECK), { checkedAt: new Date().toISOString(), ...report });
  const lines = [
    '# 出图前文字核对',
    '',
    `核对了 ${report.checked} 张待出的照片：每张照片的主题对照页面 H1 和正文（按段落规划的照片对照 H1 和本段），用代码做，不调模型。对不上的 ${report.flagged.length} 张照常出图，只在这里报告（业主 2026-11-18：图片问题只报告，不阻断）。`,
    '',
    '处理：改页面文案或照片规划（src/data/photo-briefs.json、site.json imageSubjects）后重跑 site:run；确认照片可以照原样出的，写进 docs/research/photo-text-waivers.json（`{"照片 id": "原因"}`）。',
    '',
    ...(report.flagged.length ? ['| 照片 | 分类 | 页面 | 照片主题 | 问题 |', '|---|---|---|---|---|', ...report.flagged.map((item) => `| ${item.id} | ${item.photoClass} | ${item.routes.join(', ') || '—'} | ${item.subject.replace(/\|/g, '/')} | ${item.problems.map((problem) => `${PROBLEM[problem.code] ?? problem.code}：${problem.detail}`).join('；')} |`)] : ['没有对不上的照片。']),
    '',
    `## 旧的通用场景图（保留，不自动重画）：${report.scenes.length} 张`,
    '',
    ...(report.scenes.length ? ['这些照片是在按分类规划之前做的，页面上还在用。要换成脱敏报告、工作界面或交付资料，运行 `node scripts/plan-images.mjs --replace-scenes`（超过单次重做上限会先停下等确认）。', '', '| 照片 | 类别 | 内容 |', '|---|---|---|', ...report.scenes.map((item) => `| ${item.id} | ${item.kind} | ${(item.alt || item.subject).replace(/\|/g, '/')} |`)] : ['没有。']),
    '',
  ];
  await writeFile(resolve(root, 'docs/research/images/text-check.md'), lines.join('\n'));
}

runMain(import.meta.url, async () => {
  const { values } = cliArgs({ gate: { type: 'boolean' } });
  const plan = await readJson(resolve(process.cwd(), 'docs/research/image-plan.json'));
  // Reported only (docs/research/images/text-check.md); --gate no longer holds the run (owner 2026-11-18).
  void values;
  const flagged = plan.entries.filter((entry) => entry.textCheck?.length && !entry.phoneOf);
  for (const entry of flagged) console.log(`flagged ${entry.id}: ${entry.textCheck.map((problem) => problem.code).join(', ')}`);
  console.log(JSON.stringify({ flagged: flagged.length, held: 0 }));
});
