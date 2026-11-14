import assert from 'node:assert/strict';
import test from 'node:test';

import { COLUMNS, handoffRows, imagePositions, photoToShoot } from '../handoff.mjs';
import { photoSources, realPhotoSrcs } from '../lib/photo-sources.mjs';

// A built page carries no mark of how a photo was made: only srcs, alts and the sections they sit in.
const page = `<html><body><header><img src="/logo.png" alt="Brand"></header><main>
<section class="page-hero" data-authoring-block="hero"><img src="/media/reference/hero-1.webp" alt="Models on a beach"><h1>Bikini maker</h1></section>
<section data-authoring-block="splitMedia" data-block-id="fabrics"><h2>Fabric &amp; Print</h2><img src="/media/reference/material-01.webp" alt="Floral print"></section>
<section data-authoring-block="splitMedia" data-block-id="quality"><h2>Quality checks</h2><img src="/media/site/qc-960.webp" alt="Inspector"></section>
<section data-authoring-block="band" data-block-id="band" data-media-slot="process"><h2>Our floor</h2></section>
<section data-authoring-block="caseStudies" data-block-id="owner-caseStudies"><h2>Client projects</h2><img src="/media/photos/a-960.webp" alt="Trunks"></section>
</main></body></html>`;
const siteMedia = { photos: [{ class: 'process', src: '/media/site/qc-960.webp', srcset: '/media/site/qc-480.webp 480w, /media/site/qc-960.webp 960w', sourceFile: 'qc.png' }] };
const plan = { entries: [{ id: 'a', kind: 'product', web: { src: '/media/photos/a-960.webp', srcset: '/media/photos/a-960.webp 960w' } }] };
const sourceOf = photoSources({ plan, siteMedia });

test('every image position of a built page is found with its section; where each photo comes from is read from the records, not the page', () => {
  const positions = imagePositions(page);
  assert.deepEqual(positions.map((position) => [position.block, position.src ?? position.slot, position.heading]), [
    ['hero', '/media/reference/hero-1.webp', ''],
    ['fabrics', '/media/reference/material-01.webp', 'Fabric & Print'],
    ['quality', '/media/site/qc-960.webp', 'Quality checks'],
    ['band', 'process', ''],
    ['owner-caseStudies', '/media/photos/a-960.webp', 'Client projects'],
  ]);
  assert.deepEqual(['/media/reference/hero-1.webp', '/media/site/qc-480.webp', '/media/photos/a-960.webp', '/logo.png'].map((src) => [sourceOf(src).source, sourceOf(src).kind]), [['competitor', 'hero'], ['site', 'process'], ['library', 'product'], [null, null]]);
});

test('the photo to shoot follows the class, sharpened by the section only where it fits', () => {
  assert.equal(photoToShoot('product', 'Factory-Direct Manufacturing'), photoToShoot('product'));
  assert.match(photoToShoot('process', 'Quality checks'), /质检/);
  assert.match(photoToShoot('material', 'Fabric & Print'), /面料或印花/);
  assert.match(photoToShoot('product', 'Private Label & Packaging'), /包装/);
  assert.match(photoToShoot('product', 'Client projects', 'caseStudies'), /案例订单/);
});

test('the handoff rows: open sign-off items, contact details, placeholder structured data and each image position, in the agreed columns', () => {
  const pages = [{ route: '/bikini/', status: 'authored', structuredDataPlaceholders: [{ '@type': 'Product', properties: ['offers'] }] }, { route: '/trunks/', status: 'placeholder' }];
  const rows = handoffRows({
    pages,
    signoff: { items: [{ id: 'founded', description: 'Confirm 2011', status: 'pending' }, { id: 'proof-clients', description: 'x', status: 'confirmed' }] },
    contact: { email: 'sales@x.com', phone: '', same_as: [], placeholder: true },
    built: new Map([['/bikini/', page], ['/trunks/', page]]),
    sourceOf,
  });
  assert.ok(rows.every((row) => JSON.stringify(Object.keys(row)) === JSON.stringify(COLUMNS)));
  assert.deepEqual(rows.filter((row) => row.category !== '图片').map((row) => row.field_id), ['company:founded', 'contact:email', 'contact:phone', 'contact:address', 'contact:hours', 'contact:same_as', 'schema:/bikini/:Product.offers']);
  // Only what is missing is required: what the project has is shown and optional; a city is not a street address.
  const asked = Object.fromEntries(rows.filter((row) => row.category !== '图片').map((row) => [row.field_id, [row.required, row.status]]));
  assert.deepEqual(asked['company:founded'], ['选填', '已有，可改']);
  assert.deepEqual(asked['contact:email'], ['选填', '已有，可改']);
  assert.deepEqual(asked['contact:phone'], ['必填', '待填']);
  assert.deepEqual(asked['contact:same_as'], ['必填', '待填']);
  assert.equal(rows.find((row) => row.field_id === 'schema:/bikini/:Product.offers').category, '价格');
  const images = rows.filter((row) => row.category === '图片');
  assert.equal(images.length, 10);
  // The factory photo and the empty factory slot must be real photos; the rest wait for the owner or the page.
  assert.deepEqual(images.slice(0, 5).map((row) => row.status), ['待填', '待填', '必须实拍替换', '必须实拍替换', '待填']);
  assert.match(images[4].current_placeholder, /^AI 生成图/);
  assert.equal(images[5].status, '页面未定稿');
  assert.ok(images.every((row) => row.source === '08' && row.owner_value === '' && row.required === '必填'));
  assert.equal(images[1].field_id, 'image:/bikini/:fabrics:2');
});

test('a factory photo the owner supplied as real is no row and no stand-in', () => {
  const real = new Set(realPhotoSrcs(siteMedia, ['qc.png']));
  assert.ok(real.has('/media/site/qc-960.webp') && real.has('/media/site/qc-480.webp'));
  const rows = handoffRows({ pages: [{ route: '/bikini/', status: 'authored' }], built: new Map([['/bikini/', page]]), sourceOf, realSrcs: real });
  assert.ok(!rows.some((row) => row.current_placeholder?.includes('qc-960')));
});

test('a logo the site made for itself is listed for the owner to replace; a supplied one is not', () => {
  const made = handoffRows({ pages: [], built: new Map(), sourceOf: () => null, identity: { source: 'make-wordmark' } });
  assert.deepEqual(made.filter((row) => row.field_id === 'brand:logo').map((row) => [row.status, row.current_placeholder]), [['已有，可改', 'AI 生成的纯文字标']]);
  assert.equal(handoffRows({ pages: [], built: new Map(), sourceOf: () => null, identity: { source: 'stage-00' } }).filter((row) => row.field_id === 'brand:logo').length, 0);
});
