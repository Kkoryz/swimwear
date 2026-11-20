#!/usr/bin/env node

// The built site's first screens and photo walls against the reference's capture, with no model call (owner
// 2026-11-18: the design review compared screenshots and never a size; Staylumen's heroes were 360 to 600px where the
// reference's are 412 to 1000 at 1440x1000, its home's photo walls 1425x713 across the page). Each built page is opened
// at the capture's three widths (1440x1000, 768x1024, 390x844) and measured as the layout audit measures it
// (lib/usability-checks.mjs measureUsability); its hero and walls are held to the reference's measure at the same width
// (referenceShapeProblems): the hero's height and share of the screen by page type (lib/capture-hero.mjs, from the
// capture's own rects; the nearest reference page type for ours it lacks), the walls' fit and shape
// (scaffold-placeholder-pages.mjs photoWallOf). The layout audit runs the same checks on every build, and the design
// gate holds on them as P1 that no waiver lets go (design-review.mjs measuredFindings); this command runs them alone,
// over any built site, and changes nothing in it.
// Usage: node scripts/check-reference-shape.mjs [site root] [--out file.json] [--routes /,/about/] [--reference <root>]
// --reference: the site root whose capture (site.json reference, docs/research/reference-pages) is the measure, where
// the built site is a copy without it (an earlier commit's build).
// Exit 1 when a problem is found.

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { cliArgs, listOption, runMain } from './lib/cli.mjs';
import { readJson, writeJson } from './lib/json-io.mjs';
import { capturedHeroHeights } from './lib/capture-hero.mjs';
import { captureFolder } from './lib/rules.mjs';
import { loadSitePages } from './lib/site-pages.mjs';
import { serveStatic } from './lib/static-server.mjs';
import { measureUsability, referenceShapeProblems } from './lib/usability-checks.mjs';
import { photoWallOf } from './scaffold-placeholder-pages.mjs';
import { VIEWPORTS } from './audit-authoring-layout.mjs';

// The reference's measure: each captured page type's first screen (the capture's rects first, else what the patterns
// step wrote) and the walls' shape.
export async function referenceShape(root, components = {}) {
  const site = await readJson(resolve(root, 'site.json'), {});
  const types = Object.keys(site.reference?.pages ?? {});
  const heroHeights = { ...(components.heroHeights ?? {}) };
  for (const type of types) {
    const captured = await capturedHeroHeights(root, type);
    // The capture's measure stands whole, its { band: false } too (heroHeightsFrom: the patterns step's rule).
    if (captured) heroHeights[type] = captured;
  }
  const dirs = types.map((type) => resolve(root, 'docs/research/reference-pages', captureFolder(type), 'raw'));
  const raws = await Promise.all(dirs.map((dir) => readJson(resolve(dir, 'desktop-1440.json'), null)));
  const htmls = await Promise.all(dirs.map((dir) => readFile(resolve(dir, 'rendered.html'), 'utf8').catch(() => null)));
  const photoWall = photoWallOf(raws, htmls) ?? components.photoWall ?? null;
  return { ...components, heroHeights, ...(photoWall ? { photoWall } : {}) };
}

export async function checkReferenceShape({ root = process.cwd(), reference = root, routes = null, concurrency = 4 } = {}) {
  const dist = resolve(root, 'dist');
  if (!existsSync(resolve(dist, 'index.html'))) throw new Error(`no built site in ${dist}: build it first`);
  const components = await referenceShape(reference, (await readJson(resolve(root, 'src/data/template-variants.json'), {})).components ?? {});
  const built = (route) => existsSync(resolve(dist, `.${route}`, 'index.html')) || existsSync(resolve(dist, `.${route.replace(/\/$/, '')}.html`));
  const pages = (await loadSitePages(root)).filter((page) => built(page.route) && (!routes || routes.includes(page.route)));
  const server = await serveStatic(dist, 0);
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    const jobs = pages.flatMap((page) => VIEWPORTS.map((viewport) => ({ page, viewport })));
    const work = async () => {
      for (let job = jobs.shift(); job; job = jobs.shift()) {
        const tab = await browser.newPage({ viewport: { width: job.viewport.width, height: job.viewport.height } });
        try {
          await tab.goto(`http://127.0.0.1:${server.port}${job.page.route}`, { waitUntil: 'load', timeout: 60000 });
          const usability = await tab.evaluate(measureUsability);
          const problems = referenceShapeProblems(usability, { page: job.page, components, viewport: job.viewport.id });
          results.push({ route: job.page.route, pageType: job.page.pageType, viewport: job.viewport.id, hero: usability.heroShape, walls: usability.wallShapes, problems });
        } finally {
          await tab.close();
        }
      }
    };
    await Promise.all(Array.from({ length: concurrency }, work));
  } finally {
    await browser.close();
    await server.close();
  }
  const order = new Map(VIEWPORTS.map((viewport, index) => [viewport.id, index]));
  results.sort((a, b) => a.route.localeCompare(b.route) || order.get(a.viewport) - order.get(b.viewport));
  const problems = results.flatMap((result) => result.problems.map((problem) => ({ severity: 'P1', route: result.route, pageType: result.pageType, viewport: result.viewport, ...problem })));
  return { reference: { heroHeights: components.heroHeights, photoWall: components.photoWall ?? null }, pages: pages.length, problems, results };
}

runMain(import.meta.url, async () => {
  const { positionals, values } = cliArgs({ out: { type: 'string' }, routes: { type: 'string' }, reference: { type: 'string' } });
  const root = resolve(positionals[0] ?? process.cwd());
  const report = await checkReferenceShape({ root, reference: resolve(values.reference ?? root), routes: listOption(values.routes) });
  if (values.out) await writeJson(resolve(values.out), report);
  console.log(`reference first screens (px at each width): ${Object.entries(report.reference.heroHeights ?? {}).map(([type, widths]) => `${type} ${['desktop', 'tablet', 'phone'].map((width) => widths[width]?.height ?? '-').join('/')}`).join('; ')}`);
  console.log(`reference photo walls: ${JSON.stringify(report.reference.photoWall)}`);
  console.log(`${report.pages} page(s) at ${VIEWPORTS.length} widths: ${report.problems.length} problem(s)`);
  for (const problem of report.problems) console.log(`${problem.severity} ${problem.route} ${problem.viewport} ${problem.issue} ${problem.block}: ${problem.detail}`);
  if (report.problems.length) process.exitCode = 1;
});
