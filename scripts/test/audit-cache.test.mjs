import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { auditAuthoringLayout, ownSchemaCount } from '../audit-authoring-layout.mjs';

const pageDefinition = (route) => ({ id: route, route, pageType: 'about', status: 'placeholder', seo: { title: 'T', description: 'D', canonical: route }, jsonLd: [], hero: { heading: 'H' }, blocks: [] });

async function site() {
  const root = await mkdtemp(join(tmpdir(), 'audit-cache-'));
  await mkdir(join(root, 'src/data'), { recursive: true });
  await writeFile(join(root, 'src/data/authoring-pages.json'), JSON.stringify([pageDefinition('/a/'), pageDefinition('/b/')]));
  await writeFile(join(root, 'site-template.json'), JSON.stringify({ mode: 'test' }));
  for (const route of ['a', 'b']) { await mkdir(join(root, 'dist', route), { recursive: true }); await writeFile(join(root, 'dist', route, 'index.html'), `<html><body><main>${route}</main></body></html>`); }
  return root;
}

// A clean measurement, or one with two H1s for the routes listed in `broken`.
function fakeMeasure(calls, broken = new Set()) {
  return async (definition, viewport) => {
    calls.push(`${definition.route} ${viewport.id}`);
    return { route: definition.route, viewport: viewport.id, status: 200, expectedBlocks: 1, blockCount: 1, expectedJsonLd: 0, jsonLdCount: 0, expectedCanonical: null, pageId: definition.id, brandVisible: true, h1Count: broken.has(definition.route) ? 2 : 1, horizontalOverflow: false, unplacedCopy: [], unresolvedLinks: [], maxGap: 100, boundaryGaps: [], grids: [], mediaSlots: [], density: null, lowContrast: [], textOverlaps: [], visual: { blocks: [], colours: [], photos: [] } };
  };
}

test('the layout audit measures again only pages whose built output changed; a failing page is always measured again', async () => {
  const root = await site();
  const run = async (calls, broken, fresh = false) => auditAuthoringLayout({ baseUrl: 'http://x.test/', rootDir: root, measure: fakeMeasure(calls, broken), fresh }).then(() => 'passed', (error) => error.message);
  const first = [];
  assert.equal(await run(first), 'passed');
  assert.equal(first.length, 6, 'two pages at three widths');
  const unchanged = [];
  assert.equal(await run(unchanged), 'passed');
  assert.deepEqual(unchanged, [], 'nothing changed: nothing measured');
  // One page's built HTML changes: only it is measured, and the report still has both pages.
  await writeFile(join(root, 'dist/b/index.html'), '<html><body><main>b, edited</main></body></html>');
  const edited = [];
  assert.equal(await run(edited), 'passed');
  assert.deepEqual([...new Set(edited.map((call) => call.split(' ')[0]))], ['/b/']);
  // A page that fails is not kept: the next run measures it again although nothing changed.
  await writeFile(join(root, 'dist/a/index.html'), '<html><body><main>a, edited</main></body></html>');
  assert.match(await run([], new Set(['/a/'])), /failed with 3 issue/);
  const again = [];
  assert.equal(await run(again), 'passed');
  assert.deepEqual([...new Set(again.map((call) => call.split(' ')[0]))], ['/a/']);
  // A change every page shares (the site's navigation data) measures every page; so does a fresh run.
  await writeFile(join(root, 'src/data/site-nav.json'), JSON.stringify({ header: [], footer: [] }));
  const shared = [];
  assert.equal(await run(shared), 'passed');
  assert.equal(shared.length, 6);
  const fresh = [];
  assert.equal(await run(fresh, new Set(), true), 'passed');
  assert.equal(fresh.length, 6);
});

test('the layout audit fails a page whose title or call to action is under the first screen of a phone or a 1366×768 desktop (four-site audit 2026-11-17)', async () => {
  const root = await site();
  const pages = [{ ...pageDefinition('/a/'), hero: { heading: 'H', cta: { label: 'Get a quote', href: '/b/' } } }, pageDefinition('/b/')];
  await writeFile(join(root, 'src/data/authoring-pages.json'), JSON.stringify(pages));
  const clean = fakeMeasure([]);
  const measure = async (definition, viewport) => {
    const result = await clean(definition, viewport);
    const below = { width: 1366, height: 768, h1: { top: 904, bottom: 1072, text: 'H' }, ctas: [{ top: 1180, bottom: 1244, label: 'Get a quote', where: 'hero', fixed: false }], bar: null };
    return { ...result, fold: viewport.id === 'desktop' ? [below] : [] };
  };
  await assert.rejects(auditAuthoringLayout({ baseUrl: 'http://x.test/', rootDir: root, measure, fresh: true }), /failed with 3 issue/);
  const report = JSON.parse(await readFile(join(root, 'docs/research/authoring-layout-audit.json'), 'utf8'));
  assert.deepEqual(report.failures.map((failure) => `${failure.route} ${failure.screen} ${failure.issue}`), ['/a/ 1366x768 h1_below_fold', '/a/ 1366x768 cta_below_fold', '/b/ 1366x768 h1_below_fold']);
  // A page whose copy has no call to action (/b/) is reported, not held to one.
  assert.ok(report.warnings.some((warning) => warning.route === '/b/' && warning.issue === 'no_primary_cta'));
  // A page held out of the index (a blog hub with no post, site12 2026-11-17) is not held to one either.
  await writeFile(join(root, 'src/data/authoring-pages.json'), JSON.stringify([{ ...pages[0], status: 'hold' }, pages[1]]));
  await assert.rejects(auditAuthoringLayout({ baseUrl: 'http://x.test/', rootDir: root, measure, fresh: true }), /failed with 2 issue/);
  const held = JSON.parse(await readFile(join(root, 'docs/research/authoring-layout-audit.json'), 'utf8'));
  assert.equal(held.failures.some((failure) => failure.route === '/a/' && failure.issue === 'cta_below_fold'), false);
});

test('the layout audit fails a page on its agent tree, its enquiry bar and its throttled phone LCP, and keeps each with the page it measured (four-site audit 2026-11-17, A4, A8, P3)', async () => {
  const root = await site();
  const clean = fakeMeasure([]);
  const broken = new Set(['/b/']);
  const measure = async (definition, viewport) => {
    const result = await clean(definition, viewport);
    if (viewport.id !== 'mobile' || !broken.has(definition.route)) return result;
    return { ...result, agentTree: [{ rule: 'button-name', impact: 'critical', help: 'Buttons must have discernible text', nodes: [{ target: 'button', html: '<button></button>' }] }, { rule: 'tabindex', impact: 'serious', help: 't', nodes: [] }, { rule: 'aria-allowed-role', impact: 'minor', help: 'r', nodes: [] }], barCover: { bar: { top: 783, height: 61 }, controls: [{ block: 'form', control: 'input', text: 'email', focused: true, covered: 20 }, { block: 'form', control: 'input', text: 'name', focused: true, covered: 0 }] } };
  };
  // Both pages are of one type: only the first is loaded for its LCP, once a run it is measured in (twice when over the
  // fail limit: lib/lab-lcp.mjs judgedLcp).
  const lcpCalls = [];
  let lcpMs = 4500;
  const measureLcp = async (definition) => { lcpCalls.push(definition.route); return { ms: lcpMs, element: 'img', url: '/hero.webp' }; };
  const run = () => auditAuthoringLayout({ baseUrl: 'http://x.test/', rootDir: root, measure, measureLcp }).then(() => 'passed', (error) => error.message);
  assert.match(await run(), /failed with 4 issue/);
  const report = JSON.parse(await readFile(join(root, 'docs/research/authoring-layout-audit.json'), 'utf8'));
  assert.deepEqual(report.failures.map((failure) => `${failure.route} ${failure.viewport} ${failure.issue} ${failure.rule ?? failure.text ?? failure.ms}`), ['/a/ mobile lcp_slow 4500', '/b/ mobile agent_tree button-name', '/b/ mobile agent_tree tabindex', '/b/ mobile enquiry_bar_covers email']);
  assert.deepEqual(report.warnings.filter((warning) => warning.issue.startsWith('agent_tree')).map((warning) => warning.rule), ['aria-allowed-role']);
  assert.deepEqual(lcpCalls, ['/a/', '/a/'], 'over 4 s: loaded once more');
  assert.deepEqual(report.failures[0].runs, [4500, 4500]);
  assert.equal(report.lcpMeasured, 1);
  // Both pages failed: both measured again; the LCP now under the failure line but over Google's "good" is a warning.
  broken.clear();
  lcpMs = 3000;
  assert.equal(await run(), 'passed');
  const warned = JSON.parse(await readFile(join(root, 'docs/research/authoring-layout-audit.json'), 'utf8'));
  assert.deepEqual(warned.warnings.filter((warning) => warning.issue === 'lcp_slow').map((warning) => `${warning.route} ${warning.ms} ${warning.limit}`), ['/a/ 3000 2500']);
  assert.deepEqual(lcpCalls, ['/a/', '/a/', '/a/'], 'under 4 s: one load');
  // Nothing changed: the kept page keeps its LCP (still reported), nothing is loaded again.
  assert.equal(await run(), 'passed');
  const kept = JSON.parse(await readFile(join(root, 'docs/research/authoring-layout-audit.json'), 'utf8'));
  assert.deepEqual(lcpCalls, ['/a/', '/a/', '/a/']);
  assert.equal(kept.lcpMeasured, 0);
  assert.ok(kept.warnings.some((warning) => warning.issue === 'lcp_slow' && warning.route === '/a/'));
});

test('design shots are taken again only for a page type whose built page or competitor page changed, and reviewed again only where they look different', async () => {
  const { default: sharp } = await import('sharp');
  const { prepareDesignReview } = await import('../design-review.mjs');
  const root = await mkdtemp(join(tmpdir(), 'shots-cache-'));
  await writeFile(join(root, 'site.json'), JSON.stringify({ reference: { origin: 'https://example.com', pages: { home: '/', about: '/about/' } } }));
  for (const type of ['home', 'about']) {
    const dir = join(root, 'docs/research/reference-pages', type, 'design-references');
    await mkdir(dir, { recursive: true });
    for (const [name, width] of [['desktop-1440.png', 1440], ['mobile-390.png', 390]]) await sharp({ create: { width, height: 600, channels: 3, background: '#eeeeee' } }).png().toFile(join(dir, name));
  }
  await mkdir(join(root, 'src/data'), { recursive: true });
  await writeFile(join(root, 'src/data/authoring-pages.json'), JSON.stringify([{ ...pageDefinition('/'), pageType: 'home', status: 'authored' }, { ...pageDefinition('/about/'), pageType: 'about', status: 'authored' }]));
  for (const route of ['', 'about']) { await mkdir(join(root, 'dist', route), { recursive: true }); await writeFile(join(root, 'dist', route, 'index.html'), `<html><body><main>${route || 'home'}</main></body></html>`); }
  const shots = [];
  // A page looks the way its built main says (a "repaired" page is drawn grey).
  const shoot = async (_browser, url, viewport) => {
    const route = new URL(url).pathname;
    shots.push(`${route} ${viewport.id}`);
    const html = await readFile(join(root, 'dist', route, 'index.html'), 'utf8');
    const align = { heading: 'start', text: html.includes('realigned') ? 'start' : 'centre' };
    return { image: await sharp({ create: { width: viewport.width, height: 800, channels: 3, background: html.includes('repaired') ? '#888888' : '#ffffff' } }).png().toBuffer(), blocks: [{ id: 'intro', type: 'intro', top: 0, height: 100, align }] };
  };
  const first = await prepareDesignReview({ baseUrl: 'http://x.test/', root, shoot });
  assert.equal(shots.length, 4, 'two page types at two widths');
  shots.length = 0;
  const again = await prepareDesignReview({ baseUrl: 'http://x.test/', root, shoot });
  assert.deepEqual(shots, [], 'nothing changed: no shot taken');
  assert.deepEqual(again.pages.map((page) => page.shots), first.pages.map((page) => page.shots));
  await writeFile(join(root, 'dist/about/index.html'), '<html><body><main>about, repaired</main></body></html>');
  const repaired = await prepareDesignReview({ baseUrl: 'http://x.test/', root, shoot });
  assert.deepEqual([...new Set(shots.map((shot) => shot.split(' ')[0]))], ['/about/']);
  assert.equal(repaired.pages.find((page) => page.pageType === 'home').shots, first.pages.find((page) => page.pageType === 'home').shots, 'home keeps its shots, so its review stays current');
  assert.notEqual(repaired.pages.find((page) => page.pageType === 'about').shots, first.pages.find((page) => page.pageType === 'about').shots);
  // The site's stylesheet changed (every page's built key) but neither page looks different: both are shot again and
  // both keep their shots' key, so neither is reviewed again.
  await mkdir(join(root, 'dist/_astro'), { recursive: true });
  await writeFile(join(root, 'dist/_astro/site.css'), '.footer-only { color: red; }');
  shots.length = 0;
  const restyled = await prepareDesignReview({ baseUrl: 'http://x.test/', root, shoot });
  assert.equal(shots.length, 4);
  assert.deepEqual(restyled.pages.map((page) => page.shots), repaired.pages.map((page) => page.shots));
  // A manifest written before pixel keys (its `shots` is the built key) is kept as it is while the page is unchanged.
  const legacy = { ...restyled, pages: restyled.pages.map(({ source, ...page }) => ({ ...page, shots: source })) };
  await writeFile(join(root, 'docs/research/design-review/manifest.json'), JSON.stringify(legacy));
  shots.length = 0;
  const upgraded = await prepareDesignReview({ baseUrl: 'http://x.test/', root, shoot });
  assert.deepEqual(shots, []);
  assert.deepEqual(upgraded.pages.map((page) => page.shots), legacy.pages.map((page) => page.shots));
  // The review reads the measured blocks too: a page that looks the same but measures otherwise is reviewed again.
  await writeFile(join(root, 'dist/index.html'), '<html><body><main>home, realigned</main></body></html>');
  const realigned = await prepareDesignReview({ baseUrl: 'http://x.test/', root, shoot });
  assert.notEqual(realigned.pages.find((page) => page.pageType === 'home').shots, upgraded.pages.find((page) => page.pageType === 'home').shots);
  assert.equal(realigned.pages.find((page) => page.pageType === 'about').shots, upgraded.pages.find((page) => page.pageType === 'about').shots);
});

test('the built site is served for the audits by a plain static server; a taken port fails at once', async () => {
  const { serveStatic } = await import('../lib/static-server.mjs');
  const root = await mkdtemp(join(tmpdir(), 'serve-'));
  await mkdir(join(root, 'about'), { recursive: true });
  await writeFile(join(root, 'index.html'), '<h1>home</h1>');
  await writeFile(join(root, 'about/index.html'), '<h1>about</h1>');
  await writeFile(join(root, '404.html'), 'gone');
  const server = await serveStatic(root, 0);
  const { port } = server;
  try {
    assert.equal(await (await fetch(`http://127.0.0.1:${port}/`)).text(), '<h1>home</h1>');
    const about = await fetch(`http://127.0.0.1:${port}/about/`);
    assert.equal(about.headers.get('content-type'), 'text/html; charset=utf-8');
    assert.equal(await about.text(), '<h1>about</h1>');
    const missing = await fetch(`http://127.0.0.1:${port}/nope/`);
    assert.equal(missing.status, 404);
    assert.equal(await missing.text(), 'gone');
    await assert.rejects(serveStatic(root, port), /EADDRINUSE/);
  } finally {
    await server.close();
  }
});

test('the JSON-LD count is of the page own blocks: the ImageObject the build adds per content photo is left out, any other extra block still counts', () => {
  const own = ['Organization', 'WebSite', 'BreadcrumbList', 'Service'];
  assert.equal(ownSchemaCount([...own, 'ImageObject', 'ImageObject', 'ImageObject']), 4);
  // A block more than the page's own (a second Organization, a typed list, one that is not JSON) is still one too many.
  assert.equal(ownSchemaCount([...own, 'Organization', 'ImageObject']), 5);
  assert.equal(ownSchemaCount([...own, ['Product', 'ImageObject'], null]), 6);
});
