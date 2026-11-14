import assert from 'node:assert/strict';
import test from 'node:test';

import { altFromDescription, altProblems, pageAltProblems } from '../lib/alt-text.mjs';

test('an alt text says what the image shows, 10-125 characters, without "image of" or a company claim', () => {
  assert.deepEqual(altProblems('Model in a floral bikini on a white iron chair'), []);
  assert.deepEqual(altProblems(''), ['missing']);
  assert.deepEqual(altProblems('', { decorative: true }), []);
  assert.deepEqual(altProblems('A bikini', { decorative: true }), ['decorative_with_alt']);
  assert.deepEqual(altProblems('Bikini'), ['too_short']);
  assert.deepEqual(altProblems('x'.repeat(126)), ['too_long']);
  assert.deepEqual(altProblems('A photo of a sewing room with twelve machines'), ['image_of']);
  assert.deepEqual(altProblems('Bikinis from 50 pieces, shipped in 35 days'), ['claim']);
  assert.deepEqual(altProblems('OEKO-TEX certified fabric rolls on a shelf'), ['claim']);
  // A number that describes the picture is fine.
  assert.deepEqual(altProblems('Two models in matching one-piece swimsuits on a beach'), []);
});

test('on one page every alt is different and the main keyword is in at most one', () => {
  const images = [
    { src: '/a.webp', alt: 'Bikini manufacturer cutting room with fabric rolls' },
    { src: '/b.webp', alt: 'Bikini manufacturer sewing line with overlock machines' },
    { src: '/c.webp', alt: 'Bikini manufacturer cutting room with fabric rolls' },
    { src: '/d.webp', alt: '', decorative: true },
  ];
  assert.deepEqual(pageAltProblems(images, { keyword: 'bikini manufacturer' }).map(({ src, problem }) => `${src} ${problem}`), ['/b.webp keyword_repeated', '/c.webp duplicate', '/c.webp keyword_repeated']);
  assert.deepEqual(pageAltProblems(images.slice(0, 2)), []);
});

test('a reference photo\'s analysis description loses its working notes', () => {
  assert.equal(altFromDescription('Model in leopard-print one-piece lying on sand (landscape)'), 'Model in leopard-print one-piece lying on sand');
  assert.equal(altFromDescription('Three models in swimwear around a white vintage convertible on a beach; left third darkened by a gradient baked into the image (home hero)'), 'Three models in swimwear around a white vintage convertible on a beach');
  assert.equal(altFromDescription('Close torso crop of a floral bikini among tall grasses (portrait; home mobile hero)'), 'Close torso crop of a floral bikini among tall grasses');
  assert.equal(altFromDescription('a photo of rolls of recycled nylon; stacked by colour'), 'Rolls of recycled nylon; stacked by colour');
  assert.equal(altFromDescription(''), '');
});

test('the stage 10 audit warns about alt rules; the launch preflight holds on the images that ship', async () => {
  const { pageProblems } = await import('../lib/seo-audit.mjs');
  const { runChecks, CHECKS } = await import('../preflight.mjs');
  const page = { route: '/bikini/', status: 'authored', seo: { title: 'T', description: 'D', canonical: '/bikini/' }, jsonLd: [], hero: { heading: 'Bikini' }, blocks: [] };
  const html = '<html lang="en"><head><title>T</title></head><body><main><h1>Bikini</h1><img src="/g/a.webp" alt="A photo of bikinis on a rail" width="10" height="10"><img class="page-hero__backdrop" src="/g/b.webp" alt="" width="10" height="10"></main></body></html>';
  const warnings = pageProblems({ html, page, identity: null, nav: { header: [], footer: [] } }).filter((problem) => problem.level === 'warning' && problem.issue.startsWith('alt_'));
  assert.deepEqual(warnings.map((problem) => problem.issue), ['alt_image_of']);
  const check = CHECKS.filter((item) => item.code === 'image_alt_rules');
  const ctx = { pages: [page], built: new Map([['/bikini/', html]]), keywords: new Map() };
  assert.deepEqual(runChecks(ctx, check).holds.map((hold) => hold.items), [['/bikini/ a.webp: image_of']]);
});
