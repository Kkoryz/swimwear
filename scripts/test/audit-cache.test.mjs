import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { auditAuthoringLayout } from '../audit-authoring-layout.mjs';

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
