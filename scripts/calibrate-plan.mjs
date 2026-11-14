#!/usr/bin/env node
// The trial build that closes the density before any photo is made (Fable's 08-onward plan 2026-11-14, stage 2): the
// site built with a grey frame in every photo position no photo fills yet (SITE_TRIAL=1, lib/trial-build.mjs; never a
// release), each content page measured as the layout audit measures it (lib/density.mjs measureDensity and
// measureBlocks, desktop), and the plan's estimate (plan-layout.mjs planSite) compared with the measure. Where they
// are apart the block model is fitted from the measured blocks (lib/visual-budget.mjs fitBlockModel, written to
// components.blockModel) and the site is planned, built and measured again, at most MAX_ROUNDS builds. It converges
// when every page's estimate is within 5% of its measured height and 3 points of its measured picture area.
// Why: the default model was fitted on the motel site and read hotel-rm's pages 0-12 points too full of pictures
// (Fable's plan, appendix E.2); its only calibration hung on a rule repair after a failed audit (appendix E.3).
// No model call, no photo. Writes docs/research/calibration.json and calibration.md (Chinese); exit 1 when the plan
// calls a page inside its density band and the trial build measures it outside (the template's to see: a part of the
// page the model does not hold); a page off the tolerance with the call right is reported and the run goes on.
// Usage: node scripts/calibrate-plan.mjs [siteRoot]

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { cliArgs, runMain } from './lib/cli.mjs';
import { DENSITY_EXEMPT_PAGE_TYPES, measureBlocks, measureDensity } from './lib/density.mjs';
import { readJson, writeJson } from './lib/json-io.mjs';
import { loadSitePages } from './lib/site-pages.mjs';
import { serveStatic } from './lib/static-server.mjs';
import { TRIAL_TOLERANCE } from './lib/trial-build.mjs';
import { DEFAULT_BLOCK_MODEL, fitBlockModel, modelMoved } from './lib/visual-budget.mjs';
import { planSite } from './plan-layout.mjs';

export const CALIBRATION_SCHEMA = 'seo-site-plan-calibration-v1';
export const CALIBRATION_TOLERANCE = TRIAL_TOLERANCE;
export const MAX_ROUNDS = 3;
// The layout audit's desktop viewport (audit-authoring-layout.mjs VIEWPORTS): the density is measured there.
const DESKTOP = { width: 1440, height: 1000 };
const CONCURRENCY = 4;
const round1 = (value) => Math.round(value * 10) / 10;

// Whether a picture area is inside a page's band (a page type held to the ceiling only has no floor).
const inBand = (pct, band, floorExempt) => (floorExempt || band.visualAreaPct?.min == null || pct >= band.visualAreaPct.min) && (band.visualAreaPct?.max == null || pct <= band.visualAreaPct.max);

// Each measured page with a band against its plan: the estimate's height off the measure (% of it) and its picture
// area off the measure (points); wrongCall: the plan calls the page inside its band and the trial build measures it
// outside (photos would be made for a page the audit finds off its band).
export function compareToPlan(plans, measured, tolerance = CALIBRATION_TOLERANCE) {
  const byRoute = new Map(measured.map((result) => [result.route, result]));
  return plans.filter((plan) => plan.band && byRoute.get(plan.route)?.density).map((plan) => {
    const { density } = byRoute.get(plan.route);
    const heightOffPct = round1((100 * (plan.estimate.heightPx - density.contentHeight)) / Math.max(1, density.contentHeight));
    const visualOffPts = round1(plan.estimate.visualAreaPct - density.visualAreaPct);
    return {
      route: plan.route,
      pageType: plan.pageType,
      planned: { heightPx: plan.estimate.heightPx, visualAreaPct: plan.estimate.visualAreaPct },
      measured: { heightPx: density.contentHeight, visualAreaPct: density.visualAreaPct },
      heightOffPct,
      visualOffPts,
      within: Math.abs(heightOffPct) <= tolerance.heightPct && Math.abs(visualOffPts) <= tolerance.visualPts,
      wrongCall: inBand(plan.estimate.visualAreaPct, plan.band, plan.floorExempt) && !inBand(density.visualAreaPct, plan.band, plan.floorExempt),
    };
  });
}

// The site built for the trial into .pipeline/trial/dist (the site's own dist stays the last real build).
export async function trialBuild(root) {
  const require = createRequire(resolve(root, 'package.json'));
  const astroPackage = require.resolve('astro/package.json');
  const astro = resolve(dirname(astroPackage), require(astroPackage).bin.astro);
  const outDir = resolve(root, '.pipeline/trial/dist');
  const { SITE_RELEASE: _release, ...env } = process.env;
  const built = spawnSync(process.execPath, [astro, 'build', '--outDir', outDir], { cwd: root, encoding: 'utf8', env: { ...env, SITE_TRIAL: '1' } });
  if (built.status !== 0) throw new Error(`the trial build failed:\n${`${built.stdout}${built.stderr}`.slice(-2000)}`);
  return outDir;
}

// Each page's density and blocks in the trial build, as the layout audit measures them (desktop, fonts loaded).
export async function measureTrial(dir, pages) {
  const { chromium } = await import('playwright');
  const server = await serveStatic(dir, 0);
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    const queue = [...pages];
    const worker = async () => {
      for (let definition = queue.shift(); definition; definition = queue.shift()) {
        const page = await browser.newPage({ viewport: DESKTOP });
        try {
          await page.goto(new URL(definition.route, `http://127.0.0.1:${server.port}/`).href, { waitUntil: 'networkidle', timeout: 30000 });
          await page.evaluate(() => document.fonts.ready);
          const density = await measureDensity(page);
          const blocks = (await measureBlocks(page)).map((block) => ({ ...block, pageType: definition.pageType }));
          results.push({ route: definition.route, pageType: definition.pageType, density, blocks });
        } finally {
          await page.close();
        }
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  } finally {
    await browser.close();
    await server.close();
  }
  return results;
}

// The pages the layout audit measures the density of: authored content pages.
async function densityPages(root) {
  return (await loadSitePages(root)).filter((page) => page.status === 'authored' && !DENSITY_EXEMPT_PAGE_TYPES.includes(page.pageType));
}

// Plans, builds and measures until the plan meets the measure, refitting the block model between rounds.
// plan(root) -> { pages }, build(root) -> dir, measure(dir, pages) -> [{ route, pageType, density, blocks }] (tests
// pass their own). Returns { converged, stopped, rounds: [{ round, model, within, pages }] }.
export async function calibratePlan({ root = process.cwd(), rounds: most = MAX_ROUNDS, plan = (at) => planSite({ root: at }), build = trialBuild, measure = measureTrial, pages = null, log = console.log } = {}) {
  const path = resolve(root, 'src/data/template-variants.json');
  const measuredPages = pages ?? (await densityPages(root));
  const rounds = [];
  let stopped = 'rounds';
  for (let round = 1; round <= most; round += 1) {
    const variants = await readJson(path);
    const current = { ...DEFAULT_BLOCK_MODEL, ...variants.components?.blockModel };
    const planned = await plan(root);
    const results = await measure(await build(root), measuredPages);
    const rows = compareToPlan(planned.pages, results);
    const within = rows.every((row) => row.within);
    rounds.push({ round, model: variants.components?.blockModel ? 'site' : 'default', within, pages: rows });
    log(`round ${round}: ${rows.filter((row) => row.within).length}/${rows.length} page(s) within ${CALIBRATION_TOLERANCE.heightPct}% height and ${CALIBRATION_TOLERANCE.visualPts} points`);
    if (within) { stopped = 'converged'; break; }
    if (round === most) break;
    const fitted = fitBlockModel(results.flatMap((result) => result.blocks ?? []), current);
    // The measured blocks give the model it already has: what is apart is not the model's (a part the plan does not
    // hold), and another build would measure the same.
    if (!modelMoved(current, fitted)) { stopped = 'model_settled'; break; }
    variants.components = { ...variants.components, blockModel: fitted };
    await writeJson(path, variants);
  }
  // What holds the run: the plan's call on a page's band proved wrong in the last build. A page off by more than the
  // tolerance with the call right is reported (the model's few points: a card grid of many cards, a list's variant).
  const wrongCalls = (rounds.at(-1)?.pages ?? []).filter((row) => row.wrongCall).map((row) => row.route);
  return { schemaVersion: CALIBRATION_SCHEMA, madeAt: new Date().toISOString(), converged: stopped === 'converged', stopped, wrongCalls, tolerance: CALIBRATION_TOLERANCE, rounds };
}

const STOPPED_ZH = { converged: '已收敛', model_settled: '模型拟合后不再变化，估算仍有偏差（偏差不来自高度模型）', rounds: `${MAX_ROUNDS} 次构建后仍未收敛` };

export function calibrationMarkdown(result) {
  const last = result.rounds.at(-1);
  const lines = [
    '# 试建校准（灰框，不出图）',
    '',
    `结论：${STOPPED_ZH[result.stopped]}。共构建 ${result.rounds.length} 次；容差：页高 ${result.tolerance.heightPct}% 以内、图片面积 ${result.tolerance.visualPts} 个点以内。`,
    '',
    result.wrongCalls.length ? `**拦下**：${result.wrongCalls.join('、')} 计划判在区间内，试建实测在区间外（照这版出图，审计会报密度不对）。` : '计划对各页是否在区间内的判断，试建全部证实；超出容差的页只报告，不拦。',
    '',
    '| 轮 | 模型 | 达标页数 |',
    '|---|---|---|',
    ...result.rounds.map((round) => `| ${round.round} | ${round.model === 'default' ? '默认模型' : '本站模型'} | ${round.pages.filter((row) => row.within).length}/${round.pages.length} |`),
    '',
    `## 最后一轮逐页（第 ${last?.round ?? '—'} 轮）`,
    '',
    '| 页面 | 页型 | 计划页高 | 实测页高 | 偏差 | 计划图片面积 | 实测图片面积 | 偏差 | 在容差内 | 区间判断 |',
    '|---|---|---|---|---|---|---|---|---|---|',
    ...(last?.pages ?? []).map((row) => `| ${row.route} | ${row.pageType} | ${Math.round(row.planned.heightPx)}px | ${row.measured.heightPx}px | ${row.heightOffPct}% | ${row.planned.visualAreaPct}% | ${row.measured.visualAreaPct}% | ${row.visualOffPts} | ${row.within ? '是' : '否'} | ${row.wrongCall ? '错（拦下）' : '对'} |`),
    '',
  ];
  return lines.join('\n');
}

runMain(import.meta.url, async () => {
  const { positionals } = cliArgs({});
  const root = resolve(positionals?.[0] ?? '.');
  const started = Date.now();
  const result = await calibratePlan({ root });
  const out = resolve(root, 'docs/research');
  await mkdir(out, { recursive: true });
  await writeJson(resolve(out, 'calibration.json'), result);
  await writeFile(resolve(out, 'calibration.md'), calibrationMarkdown(result));
  const off = result.rounds.at(-1)?.pages.filter((row) => !row.within) ?? [];
  console.log(`calibrate-plan: ${result.stopped} after ${result.rounds.length} build(s) in ${Math.round((Date.now() - started) / 1000)}s (${resolve(out, 'calibration.md')})`);
  for (const row of off) console.log(`- ${row.route}: height ${row.heightOffPct}%, picture area ${row.visualOffPts} points off the trial build${row.wrongCall ? ` (planned inside its band, measured ${row.measured.visualAreaPct}%: held)` : ''}`);
  if (result.wrongCalls.length) process.exitCode = 1;
});
