#!/usr/bin/env node
// The layout plan of every page and its gate (Fable's 08-onward plan 2026-11-14, stages 0 and 1), by code alone,
// before the photos and the build: lib/layout-plan.mjs plans each page as the renderer will place it,
// lib/plan-assertions.mjs checks the plan against the site's layout rules.
//   --feasibility: the feasibility report only (docs/research/feasibility.json, feasibility.md): can each page's pictures
//     come into its density band, with how many photo walls, or not (by how much and why: the owner's and 08's to know);
//     and what Site Factory is told (section headings over three lines, titles too long). Never fails the run.
//   (default) the plan: docs/research/layout-plan.json and layout-plan.md (Chinese), every block's variant, columns,
//     card title level, surface, photo slots and estimate, each page's estimate and feasibility, the photo slot list
//     the image steps work from, and the gate's findings.
//   --gate: reads layout-plan.json; exit 1 when an assertion of the template or the plan fails (owner 2026-11-14: held
//     before any photo is made); a page whose pictures cannot reach the band is reported and the run goes on.
// --out <dir>: where the files go (default docs/research). Section headings' lines come from the site's own layout
// audit where it has one (fitted per module and width); a site with none has no heading prediction yet (a model fitted
// on another site predicted nothing right: its faces and sizes are others; the grey-frame trial build of stage 2 is
// where a first run will fit its own).
// Usage: node scripts/plan-layout.mjs [siteRoot] [--feasibility | --gate] [--out <dir>]

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { cliArgs, runMain } from './lib/cli.mjs';
import { wrapEmFor } from './lib/heading-fit.mjs';
import { readJson, writeJson } from './lib/json-io.mjs';
import { HEADING_VIEWPORTS, fitHeadingModel, headingKey, planPage } from './lib/layout-plan.mjs';
import { usualRatio } from './lib/media-ratio.mjs';
import { resolveVariant, withMediaModules } from './lib/media-slots.mjs';
import { PLAN_ASSERTIONS, PLAN_WAIVERS, applyPlanWaivers, planGate } from './lib/plan-assertions.mjs';
import { cardVisual } from './lib/slot-visuals.mjs';
import { loadSitePages } from './lib/site-pages.mjs';
import { trustBarContent } from './lib/site-trust.mjs';
import { thresholdsToReview } from './lib/thresholds.mjs';
import { MAX_BUDGET_WALLS } from './lib/visual-budget.mjs';

export const LAYOUT_PLAN_SCHEMA = 'seo-site-layout-plan-v1';
// Pages the renderer lays out from blocks (PageView); a post and the blog's hub have their own views.
const PLANNED = (page) => !['blog_post', 'blog_hub'].includes(page.pageType);
const AUDIT_VIEWPORTS = { desktop: 'desktop', mobile: 'mobile' };

// The site's measured section headings as model samples: each heading the layout audit measured, matched to the block
// that carries it on its page (by its text), keyed by its module.
export function headingSamples(pages, components, audit, isBuilt) {
  const samples = [];
  for (const page of pages) {
    const blocks = withMediaModules(page, components, { isBuilt });
    let splits = 0;
    const keys = new Map();
    for (const block of blocks) {
      const variant = resolveVariant(block, page.pageType, block.type === 'splitMedia' ? splits++ : 0, components);
      if (block.heading) keys.set(block.heading.replace(/\s+/g, ' ').trim().slice(0, 80), headingKey(block, variant));
    }
    for (const viewport of HEADING_VIEWPORTS) {
      const result = audit?.results?.find((item) => item.route === page.route && item.viewport === AUDIT_VIEWPORTS[viewport]);
      for (const heading of result?.headingLines?.sections ?? []) if (keys.has(heading.text)) samples.push({ viewport, key: keys.get(heading.text), text: heading.text, lines: heading.lines });
    }
  }
  return samples;
}

export async function planSite({ root = process.cwd(), maxWalls = MAX_BUDGET_WALLS, headingModel: given = undefined } = {}) {
  const site = await readJson(resolve(root, 'site.json'), {});
  const components = (await readJson(resolve(root, 'src/data/template-variants.json'), {})).components ?? {};
  const pages = (await loadSitePages(root)).filter(PLANNED);
  const all = await loadSitePages(root);
  const routes = new Set(all.map((page) => page.route));
  const isBuilt = (href) => !href.startsWith('/') || routes.has(href);
  const pageTypes = new Map(all.map((page) => [page.route, page.pageType]));
  const charEm = wrapEmFor(components.heroText);
  const audit = await readJson(resolve(root, 'docs/research/authoring-layout-audit.json'), null);
  const samples = audit ? headingSamples(pages, components, audit, isBuilt) : [];
  const headingModel = given !== undefined ? given : samples.length ? fitHeadingModel(samples, charEm) : null;
  const headingSource = given !== undefined ? 'given' : samples.length ? `the site's layout audit (${samples.length} headings)` : 'none (no layout audit yet: section heading lines not predicted)';
  const phoneHeroes = await readJson(resolve(root, 'src/data/phone-heroes.json'), null);
  // The trust bar each page shows (TrustBar.astro's content, from the same data files).
  const figures = await readJson(resolve(root, 'src/data/page-figures.json'), null);
  const trust = await readJson(resolve(root, 'src/data/site-trust.json'), null);
  const trustBar = (page) => { const { items, certifications } = trustBarContent(page, figures, trust); return items.length > 0 || certifications.length > 0; };
  const treatmentCss = await readFile(resolve(root, 'src/styles/reference.css'), 'utf8').catch(() => '');
  const plans = pages.map((page) => planPage(page, components, { isBuilt, headingModel, charEm, pageTypes, phoneHeroes, maxWalls, trustBar: trustBar(page), treatmentCss }));
  // Cards that name services carry a line icon where the site's cards carry icons (Fable's plan 3.2: "站点卡片用图标时";
  // lib/slot-visuals.mjs cardVisual: the site's choice, else icons for a trade whose photos are scenes).
  const context = { serviceCards: cardVisual(components) === 'icon', phoneHeroes: Boolean(phoneHeroes), maxWalls };
  const gate = planGate(plans, context);
  // The photo slots the image steps work from: which page and block, the class of photo and its frame.
  const photoSlots = plans.flatMap((plan) => plan.blocks.flatMap((block) => block.slots.map((kind, index) => ({ route: plan.route, block: block.id, index, kind: typeof kind === 'string' ? kind : 'any', ratio: usualRatio(block.type, block.variant ?? undefined) }))));
  return { schemaVersion: LAYOUT_PLAN_SCHEMA, madeAt: new Date().toISOString(), maxWalls, headingModel: headingSource, context, pages: plans, photoSlots, gate };
}

const pct = (value) => (value == null ? '—' : `${value}%`);
const VERDICT_ZH = { fits: '放得下', fits_with_walls: '放得下，要加墙', does_not_fit: '放不下' };
const NAMES = Object.fromEntries(PLAN_ASSERTIONS.map((assertion) => [assertion.id, assertion]));
const OWNER_ZH = { plan: '计划', template: '模板', 'site-factory': 'SF 文案', owner: '业主' };

// The feasibility table, in Chinese: the picture area each page reaches against its band (owner 2026-11-14: the picture
// area counts, not the words), and the pages it cannot reach: by how much and why, for the owner and 08 (never a
// rewrite for Site Factory).
export function feasibilityLines(plan) {
  const lines = ['| 页面 | 页型 | 词数（参考） | 图片面积区间 | 不加墙的估算 | 结论 |', '|---|---|---|---|---|---|'];
  for (const page of plan.pages.filter((item) => item.feasibility)) {
    const { feasibility: result, band } = page;
    const verdict = result.verdict === 'fits_with_walls' ? `${VERDICT_ZH[result.verdict]} ${result.walls} 条` : result.verdict === 'does_not_fit' ? `${VERDICT_ZH[result.verdict]}（最多到 ${result.reachPct}%）` : VERDICT_ZH[result.verdict];
    lines.push(`| ${page.route} | ${page.pageType} | ${page.words} | ${page.floorExempt ? '—' : band.visualAreaPct?.min ?? '—'}–${band.visualAreaPct?.max ?? '—'}% | ${result.estimate.heightPx}px，图片 ${pct(result.estimate.visualAreaPct)} | ${verdict} |`);
  }
  const misfits = plan.pages.filter((item) => item.feasibility?.verdict === 'does_not_fit');
  if (misfits.length) {
    lines.push('', `### 图片面积进不了区间的页面（每页额外照片墙最多 ${plan.maxWalls} 条；不拦，给业主和 08 看，不转成 SF 改稿）`, '');
    for (const page of misfits) {
      const why = page.feasibility.limits.map((limit) => (limit.metric === 'places' ? `需要 ${limit.walls} 条墙，页面只有 ${limit.places} 个合法位置` : limit.metric === 'visualAreaPct.max' ? `加 ${limit.walls} 条墙会超过上限 ${page.band.visualAreaPct.max}%` : `要到 ${page.band.visualAreaPct.min}% 需加 ${Number.isFinite(limit.walls) ? limit.walls : '无数'} 条墙，上限 ${plan.maxWalls} 条`)).join('；');
      lines.push(`- ${page.route}：不加墙 ${page.feasibility.estimate.visualAreaPct}%，加满 ${page.feasibility.cap} 条墙到 ${page.feasibility.reachPct}%，比下限 ${page.band.visualAreaPct.min}% 差 ${page.feasibility.gapPct} 个点。原因：${why}。`);
    }
  }
  return lines;
}

export function planMarkdown(plan, { feasibilityOnly = false } = {}) {
  const day = plan.madeAt.slice(0, 10);
  const lines = [`# ${feasibilityOnly ? '可行性报告' : '版式计划'}（${day}）`, '', `节标题行数模型：${plan.headingModel}。额外照片墙上限：每页 ${plan.maxWalls} 条。`, '', '## 可行性', '', ...feasibilityLines(plan)];
  const items = feasibilityOnly ? plan.gate.items.filter((item) => item.gate === 'report') : plan.gate.items;
  const group = (gate, title) => {
    const list = items.filter((item) => item.gate === gate);
    lines.push('', `## ${title}（${list.length} 条）`, '');
    if (!list.length) { lines.push('- 无'); return; }
    for (const [id, found] of Object.entries(Object.groupBy(list, (item) => item.assertion))) {
      lines.push(`### ${NAMES[id].zh}（${id}，归${OWNER_ZH[NAMES[id].owner]}，${found.length} 条）`, '');
      for (const item of found) lines.push(`- ${item.route} ${item.block ?? ''}${item.viewport ? ` ${item.viewport}` : ''}：${item.detail}`);
      lines.push('');
    }
  };
  if (!feasibilityOnly) group('fail', '计划闸门：不通过（拦住，不出图）');
  group('report', '报告项（不拦，进 SF 回报）');
  if (!feasibilityOnly) {
    const kinds = Object.entries(Object.groupBy(plan.photoSlots, (slot) => slot.kind)).map(([kind, list]) => `${kind} ${list.length}`).join('，');
    lines.push('', '## 照片位清单', '', `共 ${plan.photoSlots.length} 个（${kinds || '无'}），明细在 layout-plan.json 的 photoSlots。`);
  }
  // The thresholds measured on fewer than two sites (config/thresholds.json): a new site is where to look at them again.
  const review = thresholdsToReview();
  if (!feasibilityOnly && review.length) {
    lines.push('', `## 只在一个站上量过（或没有记录）的阈值（${review.length} 个，换站时复核）`, '', '| 阈值 | 值 | 管什么 | 量过的站 |', '|---|---|---|---|');
    for (const entry of review) lines.push(`| ${entry.id}（${entry.module}） | \`${JSON.stringify(entry.value)}\` | ${entry.what} | ${entry.sites.join('、') || '没有记录'} |`);
  }
  return `${lines.join('\n')}\n`;
}

runMain(import.meta.url, async () => {
  const { values, positionals } = cliArgs({ feasibility: { type: 'boolean' }, gate: { type: 'boolean' }, out: { type: 'string' } });
  const root = resolve(positionals?.[0] ?? '.');
  const out = resolve(values.out ?? resolve(root, 'docs/research'));
  if (values.gate) {
    const path = resolve(out, 'layout-plan.json');
    if (!existsSync(path)) throw new Error(`no layout plan at ${path}: run node scripts/plan-layout.mjs first`);
    const plan = await readJson(path);
    // The owner's waivers (lib/plan-assertions.mjs applyPlanWaivers) let their failures through, named.
    const items = applyPlanWaivers(plan.gate.items, (await readJson(resolve(root, PLAN_WAIVERS), null))?.waivers ?? []);
    const failed = items.filter((item) => item.gate === 'fail');
    const waived = items.filter((item) => item.gate === 'waived');
    console.log(`plan-gate: ${failed.length} failure(s), ${waived.length} waived by the owner, ${items.filter((item) => item.gate === 'report').length} report item(s) (${resolve(out, 'layout-plan.md')})`);
    for (const [id, list] of Object.entries(Object.groupBy(waived, (item) => item.assertion))) console.log(`- waived ${id}: ${list.length} (${list[0].waiver})`);
    for (const [id, list] of Object.entries(Object.groupBy(failed, (item) => item.assertion))) console.log(`- ${id} (${NAMES[id]?.owner}): ${list.length}, e.g. ${list[0].route} ${list[0].block}: ${list[0].detail}`);
    if (failed.length) process.exitCode = 1;
    return;
  }
  const plan = await planSite({ root });
  await mkdir(out, { recursive: true });
  const name = values.feasibility ? 'feasibility' : 'layout-plan';
  const written = values.feasibility ? { ...plan, gate: { ...plan.gate, items: plan.gate.items.filter((item) => item.gate === 'report') } } : plan;
  await writeJson(resolve(out, `${name}.json`), written);
  await writeFile(resolve(out, `${name}.md`), planMarkdown(written, { feasibilityOnly: values.feasibility }));
  const verdicts = Object.entries(Object.groupBy(plan.pages.filter((page) => page.feasibility), (page) => page.feasibility.verdict)).map(([verdict, list]) => `${verdict} ${list.length}`).join(', ');
  console.log(`${name}: ${plan.pages.length} page(s) (${verdicts || 'no density band'}); ${plan.gate.failed} gate failure(s), ${plan.gate.reported} report item(s); ${resolve(out, `${name}.md`)}`);
});
