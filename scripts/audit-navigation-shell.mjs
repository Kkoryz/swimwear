import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { cliArgs, runMain, usage } from './lib/cli.mjs';
import { assertServesDist } from './lib/audit-runtime.mjs';
import { loadSitePages } from './lib/site-pages.mjs';
import { readJson, writeJson } from './lib/json-io.mjs';
import { navigationProblems } from './lib/navigation-problems.mjs';
import { builtPageKey, sharedPageKey } from './lib/page-keys.mjs';

// navigation-shell mode audits the routes discovered from the reference Header;
// authoring mode audits the routes the content package asks the renderer to build.
export async function loadRouteManifest(root) {
  const template = await readJson(resolve(root, 'site-template.json'));
  if (template.mode === 'authoring') {
    const pages = await loadSitePages(root);
    return { sourceUrl: template.sourceUrl, routes: pages.map((page) => ({ route: page.route })), representatives: template.representatives || {} };
  }
  return await readJson(resolve(root, 'src/data/navigation-shell.json'));
}

// A page whose built output is unchanged (lib/page-keys.mjs: its HTML, the rules of the stylesheet it can use, its
// scripts; this script, the routes built) keeps its passing result and its shots: a page is not opened again for a
// change elsewhere (owner 2026-11-17, site13's 40-minute run: the 37 pages were opened again for every build, 40s).
// A failing page is always measured again; SITE_RUN_FRESH=audits measures every page.
export async function auditNavigationShell({ baseUrl, rootDir = process.cwd(), captureAll = false, fresh = process.env.SITE_RUN_FRESH === 'audits', open = null }) {
  const root = resolve(rootDir);
  const manifest = await loadRouteManifest(root);
  const outputDir = resolve(root, 'docs/design-references/routes');
  await mkdir(outputDir, { recursive: true });
  const results = [];
  const builtRoutes = manifest.routes.map((route) => route.route);
  const representativeRoutes = new Set(['/', ...Object.values(manifest.representatives || {})]);
  const cachePath = resolve(root, '.pipeline/audits/navigation-shell.json');
  const shared = await sharedPageKey(root, { code: ['scripts/audit-navigation-shell.mjs'], files: ['site-template.json'], routes: [manifest.sourceUrl, ...builtRoutes] });
  const cache = fresh ? null : await readJson(cachePath, null);
  const cached = cache?.shared === shared ? cache.pages ?? {} : {};
  const slugOf = (route) => route.replace(/^\/+|\/+$/g, '').replaceAll('/', '-') || 'home';
  const shotsOf = (route) => [...(captureAll || representativeRoutes.has(route) ? ['desktop-1440'] : []), ...(representativeRoutes.has(route) ? ['mobile-390'] : [])].map((view) => resolve(outputDir, `${slugOf(route)}-candidate-${view}.png`));
  const keys = {};
  let browser = null;
  try {
    for (const route of manifest.routes) {
      keys[route.route] = await builtPageKey(root, route.route, shared, { representative: representativeRoutes.has(route.route), captureAll });
      const before = cached[route.route];
      if (keys[route.route] && before?.key === keys[route.route] && shotsOf(route.route).every((path) => existsSync(path))) { results.push(before.result); continue; }
      if (open) { results.push(await open(route.route)); continue; }
      browser ??= await chromium.launch({ headless: true });
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
      const response = await page.goto(new URL(route.route, baseUrl).href, { waitUntil: 'networkidle', timeout: 30000 });
      const inspect = () => page.evaluate(({ sourceOrigin, builtRoutes }) => {
        const links = [...document.querySelectorAll('a[href]')].map((link) => new URL(link.href));
        const width = document.documentElement.clientWidth;
        const horizontalOverflow = document.documentElement.scrollWidth > width + 1;
        // What sticks out: the outermost elements past the page's right edge (a marked sideways scroller's rail excepted),
        // by their section's block id, so a repair knows where to look.
        const past = horizontalOverflow ? [...document.querySelectorAll('body *')].filter((element) => element.getBoundingClientRect().right > width + 1 && getComputedStyle(element).position !== 'fixed' && !element.closest('[data-scroll="sideways"]')) : [];
        const overflowBy = past.filter((element) => !past.some((other) => other !== element && other.contains(element))).slice(0, 5)
          .map((element) => `${element.closest('[data-block-id]')?.getAttribute('data-block-id') ?? 'page'}: ${element.tagName.toLowerCase()}${[...element.classList].map((name) => `.${name}`).join('')} (${Math.round(element.getBoundingClientRect().right - width)}px past)`);
        return {
          h1Count: document.querySelectorAll('h1').length,
          horizontalOverflow,
          ...(overflowBy.length ? { overflowBy } : {}),
          sourceOriginLinks: links.filter((url) => url.origin === sourceOrigin).map((url) => url.href),
          unresolvedLinks: [...new Set(links.filter((url) => url.origin === location.origin && !builtRoutes.some((built) => built.replace(/\/$/, '') === url.pathname.replace(/\/$/, ''))).map((url) => url.pathname))],
        };
      }, { sourceOrigin: new URL(manifest.sourceUrl).origin, builtRoutes });
      const audit = await inspect();
      const slug = slugOf(route.route);
      if (captureAll || representativeRoutes.has(route.route)) {
        await page.screenshot({ path: resolve(outputDir, `${slug}-candidate-desktop-1440.png`), fullPage: true, animations: 'disabled' });
      }
      if (representativeRoutes.has(route.route)) {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
        const mobile = await inspect();
        audit.mobileH1Count = mobile.h1Count;
        audit.mobileHorizontalOverflow = mobile.horizontalOverflow;
        if (mobile.overflowBy) audit.mobileOverflowBy = mobile.overflowBy;
        await page.screenshot({ path: resolve(outputDir, `${slug}-candidate-mobile-390.png`), fullPage: true, animations: 'disabled' });
      }
      results.push({ route: route.route, status: response?.status() || 0, ...audit });
      await page.close();
    }
  } finally {
    await browser?.close();
  }
  const failed = (result) => result.status !== 200 || result.h1Count !== 1 || result.horizontalOverflow
    || (result.mobileH1Count !== undefined && result.mobileH1Count !== 1) || result.mobileHorizontalOverflow
    || result.sourceOriginLinks.length || result.unresolvedLinks.length;
  const failures = results.filter(failed);
  const reused = results.filter((result) => cached[result.route]?.result === result).length;
  // Only passing pages are kept: a failure is measured again.
  await mkdir(resolve(root, '.pipeline/audits'), { recursive: true });
  await writeJson(cachePath, { schemaVersion: 'seo-site-audit-cache-v1', shared, pages: Object.fromEntries(results.filter((result) => !failed(result) && keys[result.route]).map((result) => [result.route, { key: keys[result.route], result }])) });
  const report = { schemaVersion: 'seo-site-navigation-audit-v1', baseUrl, captureAll, routeCount: results.length, cached: reused, representativeRoutes: [...representativeRoutes], failures, results };
  await mkdir(resolve(root, 'docs/research'), { recursive: true });
  await writeJson(resolve(root, 'docs/research/navigation-shell-audit.json'), report);
  if (failures.length) throw new Error(`navigation shell audit failed for ${failures.length} route(s): ${navigationProblems(failures).join('; ')}${failures.flatMap((failure) => [...(failure.overflowBy ?? []), ...(failure.mobileOverflowBy ?? [])].map((what) => ` | ${failure.route} sticks out: ${what}`)).join('')}`);
  return report;
}

runMain(import.meta.url, async () => {
  const { values, positionals: [baseUrl] } = cliArgs({ 'capture-all': { type: 'boolean' } });
  if (!baseUrl) return usage('Usage: node scripts/audit-navigation-shell.mjs <candidate-base-url> [--capture-all]');
  await assertServesDist(baseUrl);
  const report = await auditNavigationShell({ baseUrl, captureAll: values['capture-all'] === true });
  console.log(JSON.stringify({ routeCount: report.routeCount, cached: report.cached, captureAll: report.captureAll, failures: report.failures.length }, null, 2));
}, { stack: true });
