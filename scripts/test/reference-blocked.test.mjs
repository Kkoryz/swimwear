import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { BLOCKED_STATUSES, scaffoldReferencePatterns } from '../scaffold-placeholder-pages.mjs';

// site12's hhmhotels.com, 2026-11-17: the reference answers 403 to every client days after it was measured; the
// patterns step keeps that earlier measure, reported as stale, instead of stopping the run.
test('a reference that refuses this machine keeps the earlier measure of the same address, marked stale; one never measured stops the step', async () => {
  const server = createServer((request, response) => { response.writeHead(403, { 'content-type': 'text/plain' }); response.end('forbidden'); });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const root = await mkdtemp(join(tmpdir(), 'reference-blocked-'));
  try {
    await mkdir(join(root, 'docs/research/pattern-sections/home'), { recursive: true });
    await mkdir(join(root, 'src/data'), { recursive: true });
    await cp('src/data/template-variants.json', join(root, 'src/data/template-variants.json'));
    await writeFile(join(root, 'docs/research/pattern-sections/home/01-hero-full.png'), 'crop');
    const kept = { pageType: 'home', reference: url, modules: ['hero:full', 'featureGrid:cards'], heroVariant: 'full', coverage: 90, sections: [] };
    await writeFile(join(root, 'docs/research/pattern-inventory.json'), JSON.stringify({ schemaVersion: 'seo-site-pattern-inventory-v1', pages: [kept], headings: { start: 3, center: 1 }, heroText: { chars: 40, charEm: 0.5, leadWords: 7 } }));
    const pagesPlan = { pages: [{ page_id: 'home', page_type: 'home', label: 'Home', url: '/' }, { page_id: 'contact', page_type: 'contact', label: 'Contact', url: '/contact/' }], header_nav: [{ label: 'Contact', page_id: 'contact', children: [] }], footer_nav: [] };
    const { report } = await scaffoldReferencePatterns({ pagesPlan, references: { home: url }, root });
    assert.ok(BLOCKED_STATUSES.includes(403));
    assert.deepEqual(report.pages[0].modules, kept.modules);
    assert.deepEqual(report.pages[0].stale, { status: 403 });
    assert.deepEqual(report.headings, { start: 3, center: 1 }, 'an inventory without per-page counts keeps its site counts');
    assert.equal(report.heroText.leadWords, 7);
    assert.equal(await readFile(join(root, 'docs/research/pattern-sections/home/01-hero-full.png'), 'utf8'), 'crop', 'the crops are kept');
    await assert.rejects(scaffoldReferencePatterns({ pagesPlan, references: { home: `${url}never-measured/` }, root }), /reference page failed: 403/);
  } finally {
    server.close();
  }
});

test('the density step keeps the earlier measure of a reference that refuses this machine; one never measured stops it', async () => {
  const { measureReferenceDensity } = await import('../measure-reference-density.mjs');
  const server = createServer((request, response) => { response.writeHead(403, { 'content-type': 'text/plain' }); response.end('forbidden'); });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const root = await mkdtemp(join(tmpdir(), 'density-blocked-'));
  try {
    await mkdir(join(root, 'docs/research/raw'), { recursive: true });
    const kept = { url, pageType: 'home', metrics: { contentHeight: 4000, images: 6, structured: 2, words: 640, wordsPer1000px: 160, photoAreaPct: 30, structuredAreaPct: 8, visualAreaPct: 38, longestTextOnlyPx: 900 } };
    await writeFile(join(root, 'docs/research/raw/reference-density.json'), JSON.stringify({ schemaVersion: 'seo-site-reference-density-v2', pages: [kept] }));
    const report = await measureReferenceDensity({ urls: [`home=${url}`], root });
    assert.deepEqual(report.pages[0].metrics, kept.metrics);
    assert.deepEqual(report.pages[0].stale, { status: 403 });
    await assert.rejects(measureReferenceDensity({ urls: [`about=${url}about/`], root }), /reference density failed: 403/);
  } finally {
    server.close();
  }
});
