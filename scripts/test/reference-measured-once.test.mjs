import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { captureStamp, measuredBeside } from '../lib/reference-access.mjs';
import { measureReferenceDensity } from '../measure-reference-density.mjs';
import { scaffoldReferencePatterns } from '../scaffold-placeholder-pages.mjs';

// Strandmill 2026-11-20: a template update ran the patterns and density steps again, both visited the live competitor,
// whose product page had been redesigned since the site's capture of the 14th, and every product page took another
// design while the review's reference shots stayed the old ones. The live pages are measured once for each capture.
const capture = (root, folder, capturedAt) => mkdir(join(root, folder), { recursive: true }).then(() => writeFile(join(root, folder, 'desktop-1440.json'), JSON.stringify({ schemaVersion: 'seo-site-reference-extraction-v1', capturedAt, url: 'https://reference.example/', elements: [] }, null, 2)));
// A live page that counts its visits (one heading: too few sections for the patterns step, enough for the density).
const liveSite = async () => {
  const hits = [];
  const server = createServer((request, response) => { hits.push(request.url); response.writeHead(200, { 'content-type': 'text/html' }); response.end('<!doctype html><title>t</title><main><h1>One</h1><p>some words here</p></main>'); });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  return { server, hits, url: `http://127.0.0.1:${server.address().port}/` };
};
const pagesOf = (hits) => hits.filter((hit) => !hit.includes('favicon'));

test('the mark of a capture is the latest capturedAt of its DOMs; none without a capture', async () => {
  const root = await mkdtemp(join(tmpdir(), 'capture-stamp-'));
  assert.equal(await captureStamp(root), null);
  await capture(root, 'docs/research/raw', '2026-11-14T06:27:41.215Z');
  await capture(root, 'docs/research/reference-pages/manufacturer/raw', '2026-11-14T06:29:22.205Z');
  await mkdir(join(root, 'docs/research/reference-pages/about/raw'), { recursive: true });
  assert.equal(await captureStamp(root), '2026-11-14T06:29:22.205Z');
  // An earlier report stands beside the capture it names, or beside the present one when it names none (written
  // before captures were recorded); never without a capture, never beside another.
  assert.equal(measuredBeside({ pages: [] }, '2026-11-14'), true);
  assert.equal(measuredBeside({ capture: '2026-11-14', pages: [] }, '2026-11-14'), true);
  assert.equal(measuredBeside({ capture: '2026-11-14', pages: [] }, '2026-11-20'), false);
  assert.equal(measuredBeside({ pages: [] }, null), false);
  assert.equal(measuredBeside(null, '2026-11-14'), false);
});

test('the patterns step keeps the measure taken beside the capture and visits no page; another capture, or other peers, is measured live', async () => {
  const { server, hits, url } = await liveSite();
  const root = await mkdtemp(join(tmpdir(), 'patterns-once-'));
  try {
    await mkdir(join(root, 'docs/research/pattern-sections/home'), { recursive: true });
    await mkdir(join(root, 'src/data'), { recursive: true });
    await cp('src/data/template-variants.json', join(root, 'src/data/template-variants.json'));
    await writeFile(join(root, 'docs/research/pattern-sections/home/01-hero-full.png'), 'crop');
    await capture(root, 'docs/research/raw', '2026-11-14T06:27:41.215Z');
    const kept = { pageType: 'home', reference: url, modules: { splitMedia: 'single', splitSequence: ['single', 'wide'], mediaModules: [{ at: 0.45, type: 'band' }] }, heroVariant: 'full', coverage: 90, headings: { start: 3, center: 1 }, heroText: null, sections: [{ index: 1, pattern: 'hero-full' }] };
    // An inventory written before captures were recorded: it is the present capture's.
    const inventoryPath = join(root, 'docs/research/pattern-inventory.json');
    await writeFile(inventoryPath, JSON.stringify({ schemaVersion: 'seo-site-pattern-inventory-v1', pages: [kept], headings: { start: 3, center: 1 } }));
    const pagesPlan = { pages: [{ page_id: 'home', page_type: 'home', label: 'Home', url: '/' }, { page_id: 'contact', page_type: 'contact', label: 'Contact', url: '/contact/' }], header_nav: [{ label: 'Contact', page_id: 'contact', children: [] }], footer_nav: [] };
    const run = () => scaffoldReferencePatterns({ pagesPlan, references: { home: url }, root });
    const { report } = await run();
    assert.equal(hits.length, 0, 'no page is visited');
    assert.equal(report.capture, '2026-11-14T06:27:41.215Z');
    assert.deepEqual(report.pages[0], { ...kept, peers: [] });
    assert.deepEqual(report.headings, { start: 3, center: 1 });
    assert.deepEqual(JSON.parse(await readFile(join(root, 'src/data/template-variants.json'), 'utf8')).components.pageTypes.home.mediaModules, kept.modules.mediaModules, 'the page type keeps its patterns');
    assert.equal(await readFile(join(root, 'docs/research/pattern-sections/home/01-hero-full.png'), 'utf8'), 'crop', 'the crops are kept');
    // The same run again: the same inventory, still no visit.
    const written = await readFile(inventoryPath, 'utf8');
    await run();
    assert.equal(await readFile(inventoryPath, 'utf8'), written);
    assert.equal(hits.length, 0);
    // Other competitors' pages named for the page type since (site.json designPeers): measured live again.
    await writeFile(join(root, 'site.json'), JSON.stringify({ designPeers: { home: [`${url}peer/`] } }));
    await assert.rejects(run(), /could not find the section list/);
    assert.ok(pagesOf(hits).includes('/'), 'the page is visited');
    await rm(join(root, 'site.json'));
    // Another capture: its pages are measured live beside it.
    hits.length = 0;
    await capture(root, 'docs/research/raw', '2026-11-20T07:14:00.000Z');
    await assert.rejects(run(), /could not find the section list/);
    assert.ok(pagesOf(hits).includes('/'), 'the page is visited');
    // No capture at all (a site whose capture another machine holds): measured live, as before.
    hits.length = 0;
    await rm(join(root, 'docs/research/raw'), { recursive: true });
    await assert.rejects(run(), /could not find the section list/);
    assert.ok(pagesOf(hits).includes('/'));
  } finally {
    server.close();
  }
});

test('the density step keeps the measures taken beside the capture; a page never measured, or another capture, is measured live', async () => {
  const { server, hits, url } = await liveSite();
  const root = await mkdtemp(join(tmpdir(), 'density-once-'));
  try {
    await capture(root, 'docs/research/reference-pages/home/raw', '2026-11-14T06:27:41.215Z');
    await mkdir(join(root, 'docs/research/raw'), { recursive: true });
    const metrics = { contentHeight: 4000, images: 5, structured: 2, words: 869, wordsPer1000px: 217, photoAreaPct: 30, structuredAreaPct: 8, visualAreaPct: 38, longestTextOnlyPx: 900 };
    const kept = [{ url, pageType: 'home', metrics }, { url: `${url}product/`, metrics }];
    const path = join(root, 'docs/research/raw/reference-density.json');
    await writeFile(path, JSON.stringify({ schemaVersion: 'seo-site-reference-density-v2', measuredAt: '2026-11-14T06:40:00.000Z', pages: kept }));
    const report = await measureReferenceDensity({ urls: [`home=${url}`, `${url}product/`], root });
    assert.equal(hits.length, 0, 'no page is visited');
    assert.deepEqual(report.pages, kept);
    assert.equal(report.measuredAt, '2026-11-14T06:40:00.000Z');
    assert.equal(report.capture, '2026-11-14T06:27:41.215Z');
    // A page added to the measure since: it alone is visited.
    const more = await measureReferenceDensity({ urls: [`home=${url}`, `${url}product/`, `${url}about/`], root });
    assert.deepEqual(pagesOf(hits), ['/about/']);
    assert.deepEqual(more.pages.slice(0, 2), kept);
    assert.ok(more.pages[2].metrics.words > 0);
    assert.notEqual(more.measuredAt, '2026-11-14T06:40:00.000Z');
    // Another capture: every page is measured again beside it.
    hits.length = 0;
    await capture(root, 'docs/research/reference-pages/home/raw', '2026-11-20T07:14:00.000Z');
    const again = await measureReferenceDensity({ urls: [`home=${url}`, `${url}product/`], root });
    assert.deepEqual(pagesOf(hits), ['/', '/product/']);
    assert.equal(again.capture, '2026-11-20T07:14:00.000Z');
    assert.notDeepEqual(again.pages[0].metrics, metrics);
  } finally {
    server.close();
  }
});
