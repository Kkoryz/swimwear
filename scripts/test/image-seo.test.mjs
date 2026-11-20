import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { altCandidates, handfixImageSeo, sitePhotos, undoImageSeo } from '../handfix-image-seo.mjs';
import { createWorkspace } from '../create-workspace.mjs';
import { ownPhotoRoutes } from '../lib/image-plan.mjs';
import { articleVisualPrompt } from '../lib/image-prompt.mjs';
import { altProductReport, contentImages, imageObjectSchema, imageSeoOn, imageSlug, libraryNamer, libraryProducts, photoTerm, productMentions, productTerm, publishedName, removePublished, schemaSourceType, uniqueName, writeImageSeo } from '../lib/image-seo.mjs';
import { BUILD_CHECKS } from '../lib/preflight/build-checks.mjs';
import { focusPath } from '../lib/photo-focus.mjs';
import { schemaProblems } from '../lib/schema-rules.mjs';
import { photoReuseProblems } from '../lib/seo-site-checks.mjs';
import { sitemapXml, withSitemapImages } from '../lib/seo-head.mjs';

const identity = { siteName: 'Tapa Works', origin: 'https://tapaworks.test' };
const label = (text) => ({ planned: { label: text } });

test('the switch is on only where site.json says true: a site built before it stays as built, a new workspace starts with it', async () => {
  assert.equal(imageSeoOn({}), false);
  assert.equal(imageSeoOn(null), false);
  assert.equal(imageSeoOn({ imageSeo: true }), true);
  assert.equal(imageSeoOn({ imageSeo: false }), false);
  const off = BUILD_CHECKS.find((check) => check.code === 'image_seo_off');
  assert.equal(off.level, 'notice');
  assert.ok(off.run({ site: { line: 'aloha shirts' } }), 'a site without it is told so');
  assert.equal(off.run({ site: { imageSeo: true } }), false);
  const sandbox = await mkdtemp(join(tmpdir(), 'image-seo-workspace-'));
  try {
    await mkdir(join(sandbox, 'source'));
    await writeFile(join(sandbox, 'source/site-template.json'), JSON.stringify({ schemaVersion: 'seo-site-template-v1', sourceUrl: 'https://example.com/', route: '/', components: [], islands: [] }));
    await createWorkspace({ source: join(sandbox, 'source'), destination: join(sandbox, 'site'), sourceUrl: 'https://example.com/', repo: false });
    assert.deepEqual(JSON.parse(await readFile(join(sandbox, 'site/site.json'), 'utf8')), { imageSeo: true });
  } finally { await rm(sandbox, { recursive: true, force: true }); }
});

test("a page's product is its label's last two words, singular; the H1 and primary query are not used", () => {
  assert.deepEqual(productTerm(label('Big & Tall Aloha Shirts')).core, ['aloha', 'shirt']);
  assert.deepEqual(productTerm(label("Women's Hawaiian Shirts")).core, ['hawaiian', 'shirt']);
  assert.deepEqual(productTerm(label('Swimwear')).core, ['swimwear']);
  // Words the label joins with a hyphen are one term, and a count stays with what it counts.
  assert.deepEqual(productTerm(label('One-Piece Swimsuits')).core, ['one', 'piece', 'swimsuit']);
  assert.deepEqual(productTerm(label('Plus Size One Piece Swimsuits')).core, ['one', 'piece', 'swimsuit']);
  assert.deepEqual(productTerm(label('3 Piece Suits')).core, ['3', 'piece', 'suit']);
  assert.equal(productMentions('A woman in a navy one-piece swimsuit by a pool', productTerm(label('One-Piece Swimsuits'))), 1);
  assert.equal(imageSlug({ alt: 'A woman in a navy swimsuit by a pool', term: productTerm(label('One-Piece Swimsuits')) }), 'one-piece-swimsuit-woman-navy-pool');
  assert.equal(productTerm({ hero: { heading: 'Aloha Shirt Manufacturer' }, planned: { primaryQuery: 'aloha shirt manufacturer' } }), null);
  const term = productTerm(label('Aloha Shirts'));
  assert.equal(productMentions('A man in burgundy aloha shirts on stone steps', term), 1);
  assert.equal(productMentions('An aloha shirt beside an aloha shirt', term), 2);
  assert.equal(productMentions('A man in a burgundy floral shirt', term), 0);
});

test('a file name: lower-case ASCII words of the alt and the product, short, unique, the alt order kept when it names the product', () => {
  const term = productTerm(label('Big & Tall Aloha Shirts'));
  assert.equal(imageSlug({ alt: 'A man in a burgundy aloha shirt reclines on stone steps between whitewashed walls beside the sea.', term }), 'man-burgundy-aloha-shirt-reclines-stone-steps');
  // The product first where the alt does not name it, the alt's own words after it, each word once.
  assert.equal(imageSlug({ alt: 'A man in a burgundy floral shirt reclines on stone steps.', term }), 'aloha-shirt-man-burgundy-floral-reclines-stone');
  assert.equal(imageSlug({ alt: 'Café façade at dusk', term: null }), 'cafe-facade-dusk');
  assert.ok(imageSlug({ alt: 'one two three four five six seven eight nine ten eleven twelve thirteen', term: null }).length <= 50);
  assert.equal(imageSlug({ alt: '', term: null }), null);
  const taken = new Set(['beach-towel']);
  assert.equal(uniqueName('beach-towel', taken), 'beach-towel-2');
  assert.equal(uniqueName('beach-towel', taken), 'beach-towel-3');
  // Off, or nothing to name it by: the id, as before.
  assert.equal(publishedName({ on: false, alt: 'A beach towel', term: null, taken: new Set(), fallback: 'general-hero-1' }), 'general-hero-1');
  assert.equal(publishedName({ on: true, alt: '', term: null, taken: new Set(), fallback: 'general-hero-1' }), 'general-hero-1');
});

test("a photo's product: its alt's, else the goods it was made to show; never a scene's or a fabric's", () => {
  const pages = [{ route: '/', ...label('Aloha Shirt') }, { route: '/beach-towels/', ...label('Beach Towels') }];
  const routes = { '/': 'general', '/beach-towels/': 'beach towel' };
  const goods = { category: 'beach towel', photoClass: 'goods', kind: 'product', products: 'beach towels in cotton terry', alt: 'A striped towel on sand' };
  assert.deepEqual(photoTerm(goods, { routes, pages }).core, ['beach', 'towel']);
  assert.equal(photoTerm({ ...goods, photoClass: 'process' }, { routes, pages }), null, 'a scene of the making');
  assert.equal(photoTerm({ ...goods, kind: 'material' }, { routes, pages }), null, 'a fabric close-up');
  assert.deepEqual(photoTerm({ category: 'general', photoClass: 'process', alt: 'A worker folds an aloha shirt' }, { routes, pages }).core, ['aloha', 'shirt'], 'named by its alt');
});

test('the sitemap lists content photos as <image:image> only when given them; the plain sitemap is unchanged', () => {
  const page = (route) => ({ route, status: 'authored', seo: { canonical: route } });
  const plain = sitemapXml([page('/a/')], identity);
  assert.equal(plain, '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>https://tapaworks.test/a/</loc></url>\n</urlset>\n');
  const images = new Map([['https://tapaworks.test/a/', ['https://tapaworks.test/media/photos/x-960.webp?a&b']]]);
  const withImages = sitemapXml([page('/a/')], identity, null, images);
  assert.match(withImages, /xmlns:image="http:\/\/www.google.com\/schemas\/sitemap-image\/1.1"/);
  assert.match(withImages, /<image:image><image:loc>https:\/\/tapaworks.test\/media\/photos\/x-960.webp\?a&amp;b<\/image:loc><\/image:image><\/url>/);
  assert.equal(withSitemapImages(plain, images), withImages);
  assert.equal(withSitemapImages(plain, new Map()), plain);
});

test('an ImageObject keeps Google\'s image metadata rules and names a model-made photo so', () => {
  const node = imageObjectSchema({ src: '/media/photos/x-960.webp', identity, owner: 'Tapa Works', year: 2026, sourceType: 'trainedAlgorithmicMedia' });
  assert.equal(node.contentUrl, 'https://tapaworks.test/media/photos/x-960.webp');
  assert.equal(node.copyrightNotice, '© 2026 Tapa Works');
  assert.equal(node.digitalSourceType, 'https://schema.org/TrainedAlgorithmicMediaDigitalSource');
  assert.deepEqual(schemaProblems(node), []);
  assert.equal(schemaSourceType('compositeWithTrainedAlgorithmicMedia'), 'https://schema.org/CompositeWithTrainedAlgorithmicMediaDigitalSource');
  assert.equal(schemaSourceType(undefined), null);
  assert.equal(imageObjectSchema({ src: '/a.webp', identity, owner: 'T', year: 2026 }).digitalSourceType, undefined, 'none without a record');
  assert.deepEqual(schemaProblems({ '@context': 'https://schema.org', '@type': 'ImageObject', contentUrl: 'https://x.test/a.webp' }).map((problem) => problem.issue).sort(), ['json_ld_recommended_missing', 'json_ld_recommended_missing', 'json_ld_recommended_missing', 'json_ld_required_missing']);
});

const page = (photos) => `<html><head><link rel="canonical" href="https://tapaworks.test/a/"></head><body><header><img src="/logo.webp" alt="Tapa Works"></header><main id="main">${photos}</main></body></html>`;

test("a page's content photos: in its main content, with an alt, its own files, once each; an overlay hero's photo with its alt is one", () => {
  const html = page('<img class="hero__backdrop" src="/media/photos/h-960.webp" alt=""><img class="page-hero__backdrop" src="/media/photos/main-960.webp" alt="A man in an aloha shirt"><img src="/media/photos/a-960.webp" alt="An aloha shirt"><img src="/media/photos/a-960.webp" alt="An aloha shirt"><img src="/media/photos/c-960.webp" alt="" data-decorative><img src="https://x.test/b.webp" alt="B">');
  assert.deepEqual(contentImages(html).map((image) => image.src), ['/media/photos/main-960.webp', '/media/photos/a-960.webp']);
});

test('a brand name with a dollar sign is written into the page as it is', async () => {
  const root = await mkdtemp(join(tmpdir(), 'image-seo-dollar-'));
  try {
    await mkdir(join(root, 'dist'), { recursive: true });
    await writeFile(join(root, 'dist/index.html'), page('<img src="/media/photos/a-960.webp" alt="An aloha shirt">'));
    await writeImageSeo(join(root, 'dist'), { root, identity: { siteName: "Save$& Co $'", origin: 'https://x.test' }, year: 2026 });
    const html = await readFile(join(root, 'dist/index.html'), 'utf8');
    assert.equal(JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]).creditText, "Save$& Co $'");
    assert.equal(html.match(/<\/head>/g).length, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('the image maker is given the product name for the alt of a photo of the goods only, and only while the switch is on', async () => {
  const root = await mkdtemp(join(tmpdir(), 'image-products-'));
  try {
    await mkdir(join(root, 'src/data'), { recursive: true });
    await writeFile(join(root, 'src/data/authoring-pages.json'), JSON.stringify([{ route: '/', planned: { label: 'Aloha Shirt' } }, { route: '/one-piece/', planned: { label: 'One-Piece Swimsuits' } }]));
    const plan = { routes: { '/': 'general', '/one-piece/': 'one piece swimsuit' } };
    const goods = { category: 'one piece swimsuit', photoClass: 'goods', kind: 'product', products: 'one-piece swimsuits with low backs' };
    assert.equal((await libraryProducts(root, plan))(goods), null, 'off: no site.json');
    await writeFile(join(root, 'site.json'), JSON.stringify({ imageSeo: true }));
    const productOf = await libraryProducts(root, plan);
    assert.equal(productOf(goods), 'one piece swimsuit');
    assert.equal(productOf({ ...goods, photoClass: 'process' }), null, 'a scene of the making');
    assert.equal(productOf({ ...goods, kind: 'material' }), null, 'a fabric close-up');
    const briefs = { prompts: { realism: 'R.', realismPerson: 'P.', realismFabric: 'F.', constraints: 'c', worker: 'W.' } };
    const ask = (product) => articleVisualPrompt({ type: 'photo', title: 't', content: 'a swimsuit on a rail', purpose: 'p', section: 's' }, { master: 'm.png', profile: { lighting: 'l', colour: 'c', rendering: 'r' }, briefs, article: 'a', product });
    assert.match(ask('one piece swimsuit'), /describing only what is visible, calling the product "one piece swimsuit" once if the photo shows it; no 'image of'/);
    assert.match(ask(null), /describing only what is visible; no 'image of' or 'photo of', no brand, price, quantity, lead time or other claim>/, 'without a product the sentence is as it was');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('a photo made again under another name leaves no file of its earlier name, and no other photo loses one', async () => {
  const root = await mkdtemp(join(tmpdir(), 'image-remove-'));
  try {
    const photos = join(root, 'public/media/photos');
    await mkdir(photos, { recursive: true });
    for (const file of ['man-shirt-480.webp', 'man-shirt-960.webp', 'man-shirt-960-phone-80.webp', 'man-shirt-2-960.webp', 'man-shirt-steps-960.webp']) await writeFile(join(photos, file), '');
    await removePublished(root, '/media/photos/man-shirt-960.webp');
    assert.deepEqual((await readdir(photos)).sort(), ['man-shirt-2-960.webp', 'man-shirt-steps-960.webp']);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('a general photo judged off a service page is found by its register entry when its name no longer says general', () => {
  const pages = [{ route: '/packaging/', pageType: 'solution' }, { route: '/embroidery/', pageType: 'solution' }];
  const fit = { pages: [
    { route: '/packaging/', images: [{ src: '/media/photos/folded-shirts-shelf-960.webp', fit: 'wrong_subject' }] },
    { route: '/embroidery/', images: [{ src: '/media/photos/worker-sews-collar-960.webp', fit: 'wrong_subject' }] },
  ] };
  const entry = (id, kind, name) => ({ id, category: 'general', kind, web: { src: `/media/photos/${name}-960.webp`, srcset: `/media/photos/${name}-480.webp 480w, /media/photos/${name}-960.webp 960w` } });
  const plan = { routes: {}, entries: [entry('general-product-7', 'product', 'folded-shirts-shelf'), entry('general-process-1', 'process', 'worker-sews-collar')] };
  assert.deepEqual([...ownPhotoRoutes(pages, fit, { placeholderKinds: ['process'] }, plan)], ['/packaging/'], 'the misfit page; not the one whose photo is a factory stand-in');
  assert.deepEqual([...ownPhotoRoutes(pages, fit, { placeholderKinds: ['process'] }, { routes: {} })], [], 'by their names alone neither is found');
});

test('the build: an ImageObject per content photo before </head>, the sitemap lists each listed page\'s photos', async () => {
  const root = await mkdtemp(join(tmpdir(), 'image-seo-'));
  try {
    await mkdir(join(root, 'dist/a'), { recursive: true });
    await mkdir(join(root, 'docs/research'), { recursive: true });
    await writeFile(join(root, 'docs/research/image-plan.json'), JSON.stringify({ entries: [{ id: 'p', web: { src: '/media/photos/a-960.webp', srcset: '/media/photos/a-480.webp 480w, /media/photos/a-960.webp 960w' }, origin: { digitalSourceType: 'trainedAlgorithmicMedia' } }] }));
    await writeFile(join(root, 'dist/a/index.html'), page('<img src="/media/photos/a-960.webp" alt="An aloha shirt"><img src="/media/site/own-960.webp" alt="Our sewing floor">'));
    await writeFile(join(root, 'dist/sitemap.xml'), sitemapXml([{ route: '/a/', status: 'authored', seo: { canonical: '/a/' } }], identity));
    const result = await writeImageSeo(join(root, 'dist'), { root, identity, year: 2026 });
    assert.deepEqual(result, { pages: 1, images: 2, sitemapImages: 2 });
    const html = await readFile(join(root, 'dist/a/index.html'), 'utf8');
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((match) => JSON.parse(match[1]));
    assert.deepEqual(blocks.map((block) => [block.contentUrl, block.digitalSourceType ?? null]), [['https://tapaworks.test/media/photos/a-960.webp', 'https://schema.org/TrainedAlgorithmicMediaDigitalSource'], ['https://tapaworks.test/media/site/own-960.webp', null]]);
    assert.ok(html.indexOf('ImageObject') < html.indexOf('</head>'));
    assert.match(await readFile(join(root, 'dist/sitemap.xml'), 'utf8'), /<image:loc>https:\/\/tapaworks.test\/media\/site\/own-960.webp<\/image:loc><\/image:image><\/url>/);
    // No identity, nothing written.
    assert.deepEqual(await writeImageSeo(join(root, 'dist'), { root, identity: null }), { pages: 0, images: 0, sitemapImages: 0 });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('the alt report counts content photos naming the page\'s or the site\'s product, and an alt naming it twice', () => {
  const home = { route: '/', ...label('Aloha Shirt') };
  const towels = { route: '/towels/', ...label('Beach Towels') };
  const built = [[home, page('<img src="/m/a.webp" alt="A woman in an aloha shirt"><img src="/m/b.webp" alt="A woman in a floral shirt">')], [towels, page('<img src="/m/c.webp" alt="A beach towel on a beach towel">')]];
  const report = altProductReport(built);
  assert.deepEqual([report.images, report.named, report.repeated, report.unnamed], [3, 2, ['/towels/ c.webp'], ['/ b.webp']]);
});

test('a photo named for what it shows still counts as its register entry in the reuse check', () => {
  const pages = ['/a/', '/b/', '/c/', '/d/'].map((route) => ({ route, status: 'authored', pageType: 'solution' }));
  const built = new Map(pages.map((item) => [item.route, '<main id="main"><img src="/media/photos/worker-sews-shirt-960.webp" alt=""></main>']));
  const plan = { entries: [{ id: 'general-process-1', category: 'general', kind: 'process', web: { src: '/media/photos/worker-sews-shirt-960.webp', srcset: '/media/photos/worker-sews-shirt-960.webp 960w' } }] };
  assert.deepEqual(photoReuseProblems(pages, built).map((item) => item.issue), [], 'by its name alone it is not found');
  assert.deepEqual(photoReuseProblems(pages, built, plan).map((item) => [item.route, item.issue]), [['/media/photos/general-process-1', 'process_reused']]);
});

test('the library namer names a photo for what it shows while on, by its id while off', async () => {
  const root = await mkdtemp(join(tmpdir(), 'image-namer-'));
  try {
    await mkdir(join(root, 'src/data'), { recursive: true });
    await mkdir(join(root, 'public/media/photos'), { recursive: true });
    await writeFile(join(root, 'public/media/photos/aloha-shirt-man-stone-steps-960.webp'), '');
    await writeFile(join(root, 'src/data/authoring-pages.json'), JSON.stringify([{ route: '/', planned: { label: 'Aloha Shirt' } }]));
    const entry = { id: 'general-hero-1', category: 'general', photoClass: 'goods', kind: 'hero', products: 'aloha shirts' };
    assert.equal((await libraryNamer(root, { routes: {} }))(entry, 'A man on stone steps'), 'general-hero-1', 'a site.json without the switch: off');
    await writeFile(join(root, 'site.json'), JSON.stringify({ imageSeo: true }));
    const on = await libraryNamer(root, { routes: { '/': 'general' } });
    assert.equal(on(entry, 'A man on stone steps'), 'aloha-shirt-man-stone-steps-2', 'apart from a published name');
    await writeFile(join(root, 'site.json'), JSON.stringify({ imageSeo: false }));
    assert.equal((await libraryNamer(root, { routes: {} }))(entry, 'A man on stone steps'), 'general-hero-1');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('the hand fix renames the shown photos and every reference, keeps names on a rerun, and undoes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'image-handfix-'));
  try {
    const photos = join(root, 'public/media/photos');
    await mkdir(photos, { recursive: true });
    await mkdir(join(root, 'src/data'), { recursive: true });
    await mkdir(join(root, 'docs/research/photo-focus'), { recursive: true });
    for (const file of ['general-hero-1-480.webp', 'general-hero-1-960.webp', 'general-hero-1-960-phone-80.webp', 'general-hero-10-960.webp', 'retired-1-960.webp']) await writeFile(join(photos, file), file);
    const web = { src: '/media/photos/general-hero-1-960.webp', srcset: '/media/photos/general-hero-1-480.webp 480w, /media/photos/general-hero-1-960.webp 960w', width: 960, height: 640 };
    await writeFile(join(root, 'docs/research/image-plan.json'), JSON.stringify({ routes: { '/': 'general' }, entries: [
      { id: 'general-hero-1', category: 'general', kind: 'hero', photoClass: 'goods', products: 'aloha shirts', alt: 'A man in a burgundy floral shirt on stone steps', web },
      { id: 'general-hero-10', category: 'general', kind: 'hero', photoClass: 'process', alt: 'A worker at a cutting table', web: { src: '/media/photos/general-hero-10-960.webp', srcset: '/media/photos/general-hero-10-960.webp 960w' } },
      { id: 'retired-1', status: 'retired', alt: 'Old', web: { src: '/media/photos/retired-1-960.webp', srcset: '/media/photos/retired-1-960.webp 960w' } },
    ] }));
    await writeFile(join(root, 'src/data/authoring-pages.json'), JSON.stringify([{ route: '/', planned: { label: 'Aloha Shirt' }, seo: {}, hero: {}, blocks: [] }]));
    await writeFile(join(root, 'src/data/template-variants.json'), JSON.stringify({ components: { media: { hero: { ...web, alt: 'A man in a burgundy floral shirt on stone steps' }, pools: { process: [{ src: '/media/photos/general-hero-10-960.webp', alt: 'A worker at a cutting table' }] } } } }));
    await writeFile(join(root, 'src/data/phone-heroes.json'), JSON.stringify({ crops: { [web.src]: { '0.80': { src: '/media/photos/general-hero-1-960-phone-80.webp' } } } }));
    await writeFile(join(root, focusPath(web.src)), JSON.stringify({ src: web.src, x: 0.5, y: 0.5 }));
    await writeFile(join(root, 'site.json'), JSON.stringify({ line: 'aloha shirts' }));
    const dry = await handfixImageSeo({ root });
    assert.equal(dry.renames.length, 4);
    assert.ok(existsSync(join(photos, 'general-hero-1-960.webp')), 'a dry run changes nothing');
    const done = await handfixImageSeo({ root, apply: true });
    assert.deepEqual((await readdir(photos)).sort(), ['aloha-shirt-man-burgundy-floral-stone-steps-480.webp', 'aloha-shirt-man-burgundy-floral-stone-steps-960-phone-80.webp', 'aloha-shirt-man-burgundy-floral-stone-steps-960.webp', 'retired-1-960.webp', 'worker-cutting-table-960.webp']);
    assert.equal(done.map['/media/photos/general-hero-1-960.webp'], '/media/photos/aloha-shirt-man-burgundy-floral-stone-steps-960.webp');
    const variants = await readFile(join(root, 'src/data/template-variants.json'), 'utf8');
    assert.doesNotMatch(variants, /general-hero-1/);
    assert.match(await readFile(join(root, 'src/data/phone-heroes.json'), 'utf8'), /stone-steps-960-phone-80/);
    assert.match(await readFile(join(root, 'docs/research/image-plan.json'), 'utf8'), /"src":"\/media\/photos\/aloha-shirt-man-burgundy-floral-stone-steps-960.webp"/);
    assert.ok(existsSync(join(root, focusPath('/media/photos/aloha-shirt-man-burgundy-floral-stone-steps-960.webp'))), 'the subject record follows its photo');
    assert.equal(JSON.parse(await readFile(join(root, 'site.json'), 'utf8')).imageSeo, true);
    assert.match(await readFile(join(root, 'handfix/image-seo/url-map.csv'), 'utf8'), /^old_url,new_url\n\/media\/photos\/general-hero-1-480.webp,/);
    const again = await handfixImageSeo({ root, apply: true });
    assert.deepEqual([again.renames.length, again.references.length], [0, 0], 'a rerun keeps the names');
    await undoImageSeo({ root });
    assert.ok(existsSync(join(photos, 'general-hero-1-960.webp')));
    assert.match(await readFile(join(root, 'src/data/template-variants.json'), 'utf8'), /general-hero-1-960/);
    assert.deepEqual(JSON.parse(await readFile(join(root, 'site.json'), 'utf8')), { line: 'aloha shirts' });
    // The alt rewrite asks only about goods whose alt does not name their product.
    assert.deepEqual(altCandidates(await sitePhotos(root)).map((group) => group.entry.id), ['general-hero-1']);
    // An approved alt file: the photo's alt wherever the data gives it, its register entry too (src/data holds arrays:
    // authoring-pages.json, whose Array entries() is no register).
    const withAlts = await handfixImageSeo({ root, apply: true, alts: { '/media/photos/general-hero-1-960.webp': 'A man in a burgundy aloha shirt on stone steps' } });
    assert.deepEqual([withAlts.alts.alts, withAlts.alts.files], [2, ['src/data/template-variants.json', 'docs/research/image-plan.json']]);
    assert.match(await readFile(join(root, 'src/data/template-variants.json'), 'utf8'), /A man in a burgundy aloha shirt on stone steps/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
