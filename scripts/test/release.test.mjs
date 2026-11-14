import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { reviewEntries } from '../approve-images.mjs';
import { pageProblems } from '../lib/seo-audit.mjs';
import { placeSiteSlots } from '../lib/page-assembly.mjs';
import { planLibrary } from '../lib/image-plan.mjs';
import { leadFormBlock } from '../lib/lead-form.mjs';
import { referenceLeaks } from '../lib/release-guard.mjs';
import { importSiteMedia } from '../import-site-media.mjs';
import { confirmItem } from '../signoff.mjs';

test('approval needs a reviewer and alt text; rejection sends the image back to generation', () => {
  const plan = { entries: [{ id: 'a', status: 'generated', alt: 'A model in leggings.', web: {} }, { id: 'b', status: 'generated', alt: '', web: {} }, { id: 'c', status: 'planned' }] };
  assert.throws(() => reviewEntries(plan, { ids: ['a'] }), /reviewer/);
  assert.throws(() => reviewEntries(plan, { ids: ['c'], reviewer: 'Owner' }), /not generated/);
  assert.throws(() => reviewEntries(plan, { ids: ['b'], reviewer: 'Owner' }), /no alt text/);
  assert.deepEqual(reviewEntries(plan, { ids: ['a'], reviewer: 'Owner', at: 'T' }), ['a']);
  assert.equal(plan.entries[0].review, 'approved');
  assert.equal(plan.entries[0].rights.status, 'owned');
  reviewEntries(plan, { ids: ['b'], reviewer: 'Owner', reject: 'looks staged' });
  assert.equal(plan.entries[1].status, 'planned');
  assert.equal(plan.entries[1].web, undefined);
});

test('an image the plan drops is kept in the register as retired', () => {
  const briefs = { placeholderKinds: ['process'], caps: { hero: 1, product: 1, process: 1, material: 1, lifestyle: 1 }, sizes: { hero: '1536x1024', product: '1024x1024' }, subjects: { hero: ['{category} hero'], product: ['{category}'] }, categoryStopWords: ['manufacturer'] };
  const previous = { entries: [{ id: 'general-process-1', status: 'generated', master: 'm.png' }] };
  const plan = planLibrary({ pages: [], components: {}, line: 'x', briefs, styleRefs: {}, previous });
  assert.deepEqual(plan.entries.map((entry) => [entry.id, entry.status]), [['general-process-1', 'retired']]);
});

test('a form slot on an authored page gets the form contract, disabled until connected, before the closing CTA', () => {
  const blocks = [{ id: 'i', type: 'intro' }, { id: 'c', type: 'cta' }];
  const mapping = [];
  placeSiteSlots(blocks, mapping, { planned: { page_type: 'contact' }, blueprints: { contact: [{ id: 'form', block: 'form', fill: 'site' }] } });
  assert.deepEqual(blocks.map((block) => block.type), ['intro', 'form', 'cta']);
  const form = leadFormBlock('form');
  assert.equal(form.status, 'not-connected');
  assert.equal(form.endpoint, '/api/leads');
  assert.ok(form.consent.privacyRoute);
  assert.ok(form.fields.every((field) => field.name));
});

test('the release guard finds pages that still use competitor files', async () => {
  const dist = await mkdtemp(join(tmpdir(), 'release-'));
  await mkdir(join(dist, 'about'));
  await writeFile(join(dist, 'index.html'), '<img src="/media/generated/a-960.webp">');
  await writeFile(join(dist, 'about/index.html'), '<img src="/media/reference/hero-1.webp">');
  const leaks = await referenceLeaks(dist);
  assert.equal(leaks.length, 1);
  assert.equal(leaks[0].path, 'media/reference');
});

test('the SEO audit rejects incomplete Product markup and structured-data links to unbuilt pages', () => {
  const identity = { siteName: 'Knit Pace', origin: 'https://knitpace.com', schemaLogo: { src: '/icon-512.png' } };
  const page = { route: '/a/', status: 'authored', hero: { heading: 'A' }, seo: { title: 'T', description: 'D', canonical: '/a/' } };
  const og = ['og:title', 'og:description', 'og:url', 'og:image'].map((key) => `<meta property="${key}" content="x">`).join('');
  const schema = '{"@type":"Product","name":"A","url":"https://knitpace.com/held/"}';
  const html = `<head><title>T</title><meta name="description" content="D"><link rel="canonical" href="https://knitpace.com/a/">${og}<script type="application/ld+json">${schema}</script></head><main></main>`;
  const issues = pageProblems({ html, page, identity, nav: { header: [], footer: [] }, builtRoutes: new Set(['/', '/a/']) }).map((problem) => problem.issue);
  assert.ok(issues.includes('json_ld_required_missing'), 'a Product without offers, review or rating');
  assert.ok(issues.includes('json_ld_unbuilt_url'));
});

test('site photos become responsive WebP with their class and nothing about how they were made; an unknown kind fails', async () => {
  const { default: sharp } = await import('sharp');
  const project = await mkdtemp(join(tmpdir(), 'line-'));
  const root = await mkdtemp(join(tmpdir(), 'site-'));
  await mkdir(join(project, 'media'));
  await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#888888' } }).png().toFile(join(project, 'media/floor.png'));
  await writeFile(join(project, 'media/media.json'), JSON.stringify({ schema_version: 'sf/media/v1', photos: [{ file: 'floor.png', kind: 'factory', alt: 'A sewing floor.' }] }));
  const data = await importSiteMedia({ project, root });
  assert.equal(data.photos[0].class, 'process');
  assert.deepEqual(Object.keys(data.photos[0]).sort(), ['alt', 'class', 'height', 'kind', 'sourceFile', 'src', 'srcset', 'width']);
  assert.equal(data.photos[0].src, '/media/site/floor-960.webp');
  assert.match(data.photos[0].srcset, /floor-480.webp 480w, .*floor-960.webp 960w/);
  await writeFile(join(project, 'media/media.json'), JSON.stringify({ schema_version: 'sf/media/v1', photos: [{ file: 'floor.png', kind: 'drone', alt: 'x' }] }));
  await assert.rejects(importSiteMedia({ project, root }), /unknown photo kind/);
});

test('every fact a page cites is found, wherever it is cited; a page fact list is not a citation', async () => {
  const { citedFactIds } = await import('../lib/sf-structured.mjs');
  const page = { sections: [{ fact_ids: ['a', 'b'] }], structured: { key_figures: [{ fact_id: 'c' }], process_steps: [{ fact_ids: ['b', 'd'] }] }, facts: [{ fact_id: 'z' }] };
  assert.deepEqual([...citedFactIds(page)].sort(), ['a', 'b', 'c', 'd']);
});

test('a sign-off item is confirmed with who and when; unknown items and a missing name fail', () => {
  const signoff = { items: [{ id: 'founded', factId: 'founded', description: 'real founding year', status: 'pending' }] };
  assert.throws(() => confirmItem(signoff, { id: 'founded' }), /--by/);
  assert.throws(() => confirmItem(signoff, { id: 'x', by: 'Owner' }), /no sign-off item/);
  confirmItem(signoff, { id: 'founded', by: 'Owner', at: 'T' });
  assert.deepEqual([signoff.items[0].status, signoff.items[0].confirmedBy], ['confirmed', 'Owner']);
});

test('a blueprint slot that declares its photography decides the template photos; undeclared slots keep the module design', async () => {
  const { mediaSlots } = await import('../lib/media-slots.mjs');
  const { mediaPolicy } = await import('../lib/page-blueprints.mjs');
  const grid = { type: 'featureGrid', items: [{}, {}, {}] };
  const components = { featureGridMedia: true };
  assert.deepEqual(mediaSlots(grid, undefined, components), ['product', 'product', 'product']);
  assert.deepEqual(mediaSlots({ ...grid, ...mediaPolicy({ media: 'none' }) }, undefined, components), []);
  assert.deepEqual(mediaSlots({ ...grid, ...mediaPolicy({ media: { kind: 'lifestyle', count: 1 } }) }, undefined, components), ['lifestyle', 'lifestyle', 'lifestyle']);
  assert.deepEqual(mediaPolicy({}), {});
});

test('a project with no photos of its own yet imports none instead of failing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'no-media-'));
  const project = join(root, 'project');
  await mkdir(project, { recursive: true });
  const data = await importSiteMedia({ project, root });
  assert.deepEqual(data.photos, []);
});
