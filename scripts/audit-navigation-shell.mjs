import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { cliArgs, runMain, usage } from './lib/cli.mjs';
import { assertServesDist } from './lib/audit-runtime.mjs';
import { loadSitePages } from './lib/site-pages.mjs';
import { readJson, writeJson } from './lib/json-io.mjs';
import { navigationProblems } from './lib/navigation-problems.mjs';

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

export async function auditNavigationShell({ baseUrl, rootDir = process.cwd(), captureAll = false }) {
  const root = resolve(rootDir);
  const manifest = await loadRouteManifest(root);
  const outputDir = resolve(root, 'docs/design-references/routes');
  await mkdir(outputDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const results = [];
  const builtRoutes = manifest.routes.map((route) => route.route);
  const representativeRoutes = new Set(['/', ...Object.values(manifest.representatives || {})]);
  try {
    for (const route of manifest.routes) {
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
      const slug = route.route.replace(/^\/+|\/+$/g, '').replaceAll('/', '-') || 'home';
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
    await browser.close();
  }
  const failures = results.filter((result) => result.status !== 200 || result.h1Count !== 1 || result.horizontalOverflow
    || (result.mobileH1Count !== undefined && result.mobileH1Count !== 1) || result.mobileHorizontalOverflow
    || result.sourceOriginLinks.length || result.unresolvedLinks.length);
  const report = { schemaVersion: 'seo-site-navigation-audit-v1', baseUrl, captureAll, routeCount: results.length, representativeRoutes: [...representativeRoutes], failures, results };
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
  console.log(JSON.stringify({ routeCount: report.routeCount, captureAll: report.captureAll, failures: report.failures.length }, null, 2));
}, { stack: true });
