import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { DEFAULT_HERO_PHONE_RATIO, cropBox, derivePhoneHeroes, fillsRatio, frameCrops, phoneFrames, widestFile } from '../derive-phone-heroes.mjs';
import { heroPhoto } from '../lib/media-slots.mjs';
import { FOCUS_BATCH, focusPath, photosInUse } from '../lib/photo-focus.mjs';

// A competitor section as the pattern inventory records it, with its shape at 390px (measurePhoneSections).
const section = (index, decision, photo = null, extra = {}) => ({ index, pattern: decision, decision, height: 500, words: 20, largeImages: photo ? 1 : 0, phone: { height: photo ? photo.height : 300, words: 5, photo: photo && { ...photo, ratio: Math.round((photo.width / photo.height) * 100) / 100 } }, ...extra });

test("each of our phone frames takes the ratio of the competitor section it was made from, measured at 390px: the hero its first hero section, a closing band its last photo band", () => {
  // gyknit: a square banner on the about page (370 x 372), a 350 x 462 photo panel closing the wholesale page, a plain
  // hero there; the home hero 1.57; swimwear's home closes on a 0.60 panel after a plain band.
  const inventory = { pages: [
    { pageType: 'about', sections: [section(1, 'hero:media-banner', { width: 370, height: 372 }), section(2, 'intro/proof')] },
    { pageType: 'home', sections: [section(1, 'hero:media-split', { width: 390, height: 248 }), section(11, 'cta:inline'), section(15, 'band', { width: 390, height: 300 }), section(17, 'band', { width: 390, height: 650 })] },
    { pageType: 'product_wholesale', sections: [section(1, 'hero:plain'), section(6, 'band', { width: 350, height: 462 })] },
    // A competitor page measured before phone shapes were recorded: nothing to follow.
    { pageType: 'contact', sections: [{ index: 1, pattern: 'hero-banner', decision: 'hero:media-banner' }] },
  ] };
  const modules = [
    { pageType: 'about', index: 1, module: 'hero:media-banner' }, { pageType: 'home', index: 1, module: 'hero:media-split' },
    { pageType: 'home', index: 11, module: 'cta:band' }, { pageType: 'home', index: 15, module: 'band:left' }, { pageType: 'home', index: 17, module: 'cta:image-band' },
    { pageType: 'product_wholesale', index: 1, module: 'hero:plain' }, { pageType: 'product_wholesale', index: 6, module: 'cta:image-band' },
  ];
  assert.deepEqual(phoneFrames(inventory, modules), { hero: { byPageType: { about: 0.99, home: 1.57 } }, cta: { byPageType: { home: 0.6, product_wholesale: 0.76 } } });
  // Without named modules the capture's decisions stand in (a hero); a band is not a closing band until named.
  assert.deepEqual(phoneFrames(inventory, []), { hero: { byPageType: { about: 0.99, home: 1.57 } }, cta: { byPageType: {} } });
  assert.deepEqual(phoneFrames(null, modules), { hero: { byPageType: {} }, cta: { byPageType: {} } });
  // A 3 / 1 photo cannot fill a square frame showing 60% of itself; a 4 / 3 one can.
  assert.equal(fillsRatio({ width: 900, height: 300 }, 1), false);
  assert.equal(fillsRatio({ width: 400, height: 300 }, 1), true);
});

test('only the photos the renderer puts in a phone frame are cut: each page\'s hero, the photo its closing band is allocated; nothing where the competitor has no frame', () => {
  const wide = { src: '/media/reference/hero-1.png', alt: 'Three models', width: 900, height: 300 };
  const narrow = { src: '/media/reference/hero-2.png', alt: 'A workshop', width: 400, height: 300 };
  const band = { src: '/media/reference/lifestyle-1.png', alt: 'A run', width: 900, height: 300 };
  const spare = { src: '/media/reference/lifestyle-2.png', alt: 'A gym', width: 900, height: 300 };
  const components = { hero: 'media-banner', heroByPageType: { about: 'media-banner', product_wholesale: 'plain', solution: 'plain' }, cta: 'inline', pageTypes: { product_wholesale: { cta: 'image-band', mediaModules: [] } }, media: { hero: narrow, heroByPageType: { about: wide }, pools: { lifestyle: [band, spare] } } };
  const cta = { id: 'cta', type: 'cta', heading: 'Ask', cta: { label: 'Contact', href: '/contact/' }, links: [] };
  const pages = [
    { route: '/about/', pageType: 'about', status: 'placeholder', blocks: [] },
    { route: '/wholesale-bra/', pageType: 'product_wholesale', status: 'authored', blocks: [cta] },
    { route: '/solutions/oem/', pageType: 'solution', status: 'authored', blocks: [cta] },
  ];
  const frames = { hero: { byPageType: { about: 0.99, solution: 0.99 } }, cta: { byPageType: { product_wholesale: 0.76, solution: 0.76 } } };
  const cuts = frameCrops({ pages, components, frames });
  // The about hero (wide) at 0.99; the wholesale band's allocated photo at 0.76. Not the narrow default hero (it fills
  // 0.99), not the spare lifestyle photo (nothing shows it there), not the solution page (a plain hero, an inline band).
  assert.deepEqual(cuts.map(({ photo, ratios }) => [photo.src, ratios]), [['/media/reference/hero-1.png', [0.99]], ['/media/reference/lifestyle-1.png', [0.76]]]);
  assert.deepEqual(frameCrops({ pages, components, frames: { hero: { byPageType: {} }, cta: { byPageType: {} } } }), []);
  // The owner's own hero photo comes first, as the renderer resolves it; a photo with a phone twin already is left.
  const own = { class: 'hero', src: '/media/site/hero.webp', srcset: '', width: 1600, height: 500, alt: 'our hall', pages: ['/about/'] };
  assert.equal(heroPhoto(pages[0], components, [own]).src, own.src);
  assert.equal(heroPhoto(pages[1], components, [own]).src, narrow.src);
  assert.equal(heroPhoto({ route: '/privacy/', pageType: 'privacy', blocks: [] }, components), null);
  assert.deepEqual(frameCrops({ pages, components: { ...components, media: { ...components.media, heroByPageType: { about: { ...wide, sources: [{ media: 'x', src: '/p.webp' }] } } } }, frames }).map(({ photo }) => photo.src), ['/media/reference/lifestyle-1.png']);
});

test('a hero photo too wide for the competitor\'s phone hero gets a crop at its ratio, next to the photo; one that fills it, none; an inventory without phone shapes gives none', async () => {
  const { default: sharp } = await import('sharp');
  // On Windows a cached input keeps its file open: the crop is written again in the same process.
  sharp.cache(false);
  const root = await mkdtemp(join(tmpdir(), 'phone-heroes-'));
  await mkdir(join(root, 'public/media/reference'), { recursive: true });
  await sharp({ create: { width: 900, height: 300, channels: 3, background: '#888' } }).png().toFile(join(root, 'public/media/reference/hero-1.png'));
  await sharp({ create: { width: 400, height: 300, channels: 3, background: '#888' } }).png().toFile(join(root, 'public/media/reference/hero-2.png'));
  await mkdir(join(root, 'src/data'), { recursive: true });
  const wide = { src: '/media/reference/hero-1.png', alt: 'Three models', width: 900, height: 300 };
  const narrow = { src: '/media/reference/hero-2.png', alt: 'A workshop', width: 400, height: 300 };
  await writeFile(join(root, 'src/data/template-variants.json'), JSON.stringify({ components: { hero: 'media-banner', heroByPageType: { about: 'media-banner', solution: 'plain' }, media: { hero: narrow, heroByPageType: { about: wide } } } }));
  await writeFile(join(root, 'src/data/authoring-pages.json'), '[]');
  await writeFile(join(root, 'src/data/placeholder-pages.json'), JSON.stringify([{ route: '/about/', pageType: 'about', status: 'placeholder', blocks: [] }, { route: '/solutions/', pageType: 'solution', status: 'placeholder', blocks: [] }]));
  await mkdir(join(root, 'docs/research/analysis'), { recursive: true });
  const inventoryPath = join(root, 'docs/research/pattern-inventory.json');
  await writeFile(inventoryPath, JSON.stringify({ pages: [{ pageType: 'about', sections: [{ index: 1, decision: 'hero:media-banner' }] }] }));
  await writeFile(join(root, 'docs/research/analysis/section-modules.json'), JSON.stringify([{ pageType: 'about', index: 1, module: 'hero:media-banner' }]));
  // An inventory from before phone shapes: no frame is measured, no crop is cut, nothing breaks.
  const before = await derivePhoneHeroes({ root });
  assert.deepEqual([before.crops, before.frames], [0, { hero: { byPageType: {} }, cta: { byPageType: {} } }]);
  await writeFile(inventoryPath, JSON.stringify({ pages: [{ pageType: 'about', sections: [section(1, 'hero:media-banner', { width: 370, height: 372 })] }] }));
  const { frames, crops, soft } = await derivePhoneHeroes({ root });
  assert.deepEqual(frames, { hero: { byPageType: { about: 0.99 } }, cta: { byPageType: {} } });
  assert.equal(crops, 1);
  // From a 300px tall photo the crop is too narrow to stay sharp on a phone: used, and reported.
  assert.equal(soft.length, 1);
  const written = JSON.parse(await readFile(join(root, 'src/data/phone-heroes.json'), 'utf8'));
  assert.deepEqual(written.crops, { '/media/reference/hero-1.png': { '0.99': { src: '/media/reference/hero-1-phone-99.webp', width: 297, height: 300 } } });
  const meta = await sharp(join(root, 'public/media/reference/hero-1-phone-99.webp')).metadata();
  assert.deepEqual([meta.width, meta.height], [297, 300]);
  // Without a judged subject the crop is reported; with one, it is cut around it.
  assert.deepEqual(written.unfocused, ['/media/reference/hero-1.png']);
  // The subject at the right edge: the photo's right part, red there and grey elsewhere.
  await sharp({ create: { width: 900, height: 300, channels: 3, background: '#888' } }).composite([{ input: { create: { width: 300, height: 300, channels: 3, background: '#f00' } }, left: 600, top: 0 }]).png().toFile(join(root, 'public/media/reference/hero-1.png'));
  await mkdir(join(root, 'docs/research/photo-focus'), { recursive: true });
  await writeFile(join(root, focusPath(wide.src)), JSON.stringify({ src: wide.src, x: 0.85, y: 0.5, subject: 'a model' }));
  const focused = await derivePhoneHeroes({ root });
  assert.deepEqual(focused.unfocused, []);
  const { data } = await sharp(join(root, 'public/media/reference/hero-1-phone-99.webp')).raw().toBuffer({ resolveWithObject: true });
  assert.ok(data[0] > 200 && data[1] < 60, 'the crop is the red right part');
  // The judged subjects go to the renderer, for every frame that cuts the photo.
  assert.deepEqual(JSON.parse(await readFile(join(root, 'src/data/photo-focus.json'), 'utf8')), { '/media/reference/hero-1.png': { x: 0.85, y: 0.5 } });
});

test('every photo the site shows is judged once, FOCUS_BATCH to a run, numbered in its prompt and images', async () => {
  const { focusRuns } = await import('../site-run.mjs');
  const root = await mkdtemp(join(tmpdir(), 'photo-focus-'));
  await mkdir(join(root, 'src/data'), { recursive: true });
  const photo = (name) => ({ src: `/media/reference/${name}.jpg`, alt: name, width: 800, height: 600 });
  const pool = Array.from({ length: FOCUS_BATCH + 1 }, (_, index) => photo(`p${index}`));
  const components = { media: { hero: photo('hero'), heroOptions: [photo('hero')], pools: { product: pool }, routePools: { '/a/': { product: [photo('p0'), { slot: 'process' }] } } } };
  assert.equal(photosInUse(components).length, FOCUS_BATCH + 2, 'each photo once, no placeholder slot');
  await writeFile(join(root, 'src/data/template-variants.json'), JSON.stringify({ components }));
  await mkdir(join(root, 'config/agent-steps'), { recursive: true });
  await writeFile(join(root, 'config/agent-steps/photo-focus.md'), 'Name the subject of {{photos}}');
  const { rules } = (await focusRuns(root))[0].values;
  await mkdir(join(root, 'docs/research/photo-focus'), { recursive: true });
  await writeFile(join(root, focusPath('/media/reference/hero.jpg')), JSON.stringify({ src: '/media/reference/hero.jpg', x: 0.5, y: 0.4, rules }));
  const runs = await focusRuns(root);
  assert.deepEqual(runs.map((run) => run.images.length), [FOCUS_BATCH, 1], 'the judged hero is not asked again');
  assert.match(runs[0].values.photos, /^1\. \/media\/reference\/p0\.jpg\n2\. /);
  // A photo made again under its name is judged again: each answer records the bytes it judged (Strandmill's six
  // remade photos kept the points of the photos they replaced, 2026-11-17).
  await mkdir(join(root, 'public/media/reference'), { recursive: true });
  await writeFile(join(root, 'public/media/reference/hero.jpg'), 'the first hero');
  const { utimes } = await import('node:fs/promises');
  const later = new Date(Date.now() + 60_000);
  await utimes(join(root, focusPath('/media/reference/hero.jpg')), later, later);
  const [hero] = (await focusRuns(root)).flatMap((run) => JSON.parse(run.values.srcs).map((src, index) => ({ src, sha: JSON.parse(run.values.shas)[index] }))).filter((item) => item.src.endsWith('/hero.jpg'));
  assert.equal(hero, undefined, 'an answer from before it recorded the bytes counts for a photo no newer than the answer');
  const { focusReply } = await import('../site-run.mjs');
  const earlier = new Date(Date.now() - 60_000);
  await utimes(join(root, focusPath('/media/reference/hero.jpg')), earlier, earlier);
  await writeFile(join(root, 'public/media/reference/hero.jpg'), 'the hero made again');
  const asked = (await focusRuns(root)).find((run) => run.values.srcs.includes('hero.jpg'));
  assert.ok(asked, 'a photo newer than its answer is asked again');
  const [answer] = focusReply({ ...asked.values, srcs: JSON.stringify(['/media/reference/hero.jpg']), shas: JSON.stringify([JSON.parse(asked.values.shas)[JSON.parse(asked.values.srcs).indexOf('/media/reference/hero.jpg')]]) }, [{ index: 1, x: 0.5, y: 0.5, subject: 'a hero' }]);
  await writeFile(join(root, answer.path), JSON.stringify(answer.data));
  assert.ok(!(await focusRuns(root)).some((run) => run.values.srcs.includes('hero.jpg')), 'answered for these bytes');
  await writeFile(join(root, 'public/media/reference/hero.jpg'), 'the hero made a third time');
  assert.ok((await focusRuns(root)).some((run) => run.values.srcs.includes('hero.jpg')), 'other bytes: asked again');
  // New instructions: every photo is judged again.
  await writeFile(join(root, 'config/agent-steps/photo-focus.md'), 'Name the product in {{photos}}');
  assert.deepEqual((await focusRuns(root)).map((run) => run.images.length), [FOCUS_BATCH, 2]);
});

test('a crop around a point keeps the ratio and stays inside the photo', () => {
  assert.deepEqual(cropBox({ width: 900, height: 300 }, 1, { x: 0.5, y: 0.5 }), { left: 300, top: 0, width: 300, height: 300 });
  assert.deepEqual(cropBox({ width: 900, height: 300 }, 1, { x: 0.99, y: 0.1 }), { left: 600, top: 0, width: 300, height: 300 });
  assert.deepEqual(cropBox({ width: 900, height: 300 }, 1, { x: 0, y: 0.5 }), { left: 0, top: 0, width: 300, height: 300 });
  // A portrait photo cut wider: the full width, a band around the point.
  assert.deepEqual(cropBox({ width: 400, height: 1000 }, 1, { x: 0.5, y: 0.2 }), { left: 0, top: 0, width: 400, height: 400 });
  assert.deepEqual(cropBox({ width: 400, height: 1000 }, 1, { x: 0.5, y: 0.5 }), { left: 0, top: 300, width: 400, height: 400 });
});

test("the judge's reply names a point inside each photo of the run by its number; a missing photo or a point outside fails the run", async () => {
  const { focusReply } = await import('../site-run.mjs');
  const srcs = JSON.stringify(['/media/a.jpg', '/media/b.jpg']);
  assert.deepEqual(focusReply({ srcs, rules: 'r1' }, [{ index: 2, x: 0.2, y: 0.5 }, { index: 1, x: 0.7, y: 0.3, subject: 'face' }]), [
    { path: focusPath('/media/a.jpg'), data: { src: '/media/a.jpg', x: 0.7, y: 0.3, subject: 'face', rules: 'r1' } },
    { path: focusPath('/media/b.jpg'), data: { src: '/media/b.jpg', x: 0.2, y: 0.5, subject: '', rules: 'r1' } },
  ]);
  assert.throws(() => focusReply({ srcs }, [{ index: 1, x: 0.7, y: 0.3 }]), /photo 2/);
  assert.throws(() => focusReply({ srcs }, [{ index: 1, x: 70, y: 30 }, { index: 2, x: 0.2, y: 0.5 }]));
  assert.throws(() => focusReply({ srcs }, { x: 0.5, y: 0.5 }));
});

test("a phone crop is cut from the photo's widest file, not the rendition the page names (swimwear 2026-11-15)", () => {
  const photo = { src: '/media/photos/a-960.webp', width: 960, height: 640, srcset: '/media/photos/a-480.webp 480w, /media/photos/a-960.webp 960w, /media/photos/a-1536.webp 1536w' };
  assert.deepEqual(widestFile(photo), { ...photo, src: '/media/photos/a-1536.webp', width: 1536, height: 1024 });
  assert.equal(widestFile({ src: '/a.webp', width: 960, height: 640 }).src, '/a.webp');
  assert.equal(widestFile({ ...photo, srcset: '/media/photos/a-480.webp 480w' }).src, photo.src);
});

test('a phone crop is held to its desktop file by weight: the quality goes down to 70, then the crop narrows to 480; none within is none', async () => {
  const { CROP_MIN_WIDTH, cropWidths, encodeWithin } = await import('../derive-phone-heroes.mjs');
  assert.deepEqual(cropWidths(717), [717, 640, 560, CROP_MIN_WIDTH]);
  assert.deepEqual(cropWidths(461), [461]);
  // An encoding's weight grows with its width and its quality; the budget is a desktop file of 103 KB (site13's general hero).
  const tried = [];
  const render = async (width, quality) => { tried.push(`${width}@${quality}`); return Buffer.alloc(Math.round(width * quality * 2.4)); };
  const fits = await encodeWithin(render, 717, 103 * 1024);
  assert.deepEqual([fits.width, fits.quality, tried], [560, 76, ['717@82', '717@76', '717@70', '640@82', '640@76', '640@70', '560@82', '560@76']]);
  assert.equal((await encodeWithin(render, 717, 200 * 1024)).quality, 82, 'within the budget: as it was');
  assert.equal(await encodeWithin(render, 717, 1024), null);
});

test("a crop of a busy photo is written within its photo's desktop file; one that cannot be is not made and is reported", async () => {
  const { default: sharp } = await import('sharp');
  const { existsSync } = await import('node:fs');
  const { stat } = await import('node:fs/promises');
  sharp.cache(false);
  const root = await mkdtemp(join(tmpdir(), 'phone-budget-'));
  await mkdir(join(root, 'public/media/photos'), { recursive: true });
  await mkdir(join(root, 'src/data'), { recursive: true });
  await mkdir(join(root, 'docs/research/analysis'), { recursive: true });
  // A noisy 1536 x 1024 widest file (it compresses badly) and the 960 file the page names.
  const noise = Buffer.alloc(1536 * 1024 * 3);
  for (let index = 0; index < noise.length; index += 1) noise[index] = (index * 2654435761) >>> 24;
  const raw = { raw: { width: 1536, height: 1024, channels: 3 } };
  await sharp(noise, raw).webp({ quality: 90 }).toFile(join(root, 'public/media/photos/a-1536.webp'));
  const desktop = join(root, 'public/media/photos/a-960.webp');
  await sharp(noise, raw).resize({ width: 960 }).webp({ quality: 80 }).toFile(desktop);
  const photo = { src: '/media/photos/a-960.webp', alt: 'A swimsuit', width: 960, height: 640, srcset: '/media/photos/a-960.webp 960w, /media/photos/a-1536.webp 1536w' };
  await writeFile(join(root, 'src/data/template-variants.json'), JSON.stringify({ components: { hero: 'media-banner', media: { hero: photo } } }));
  await writeFile(join(root, 'src/data/authoring-pages.json'), '[]');
  await writeFile(join(root, 'src/data/placeholder-pages.json'), JSON.stringify([{ route: '/about/', pageType: 'about', status: 'placeholder', blocks: [] }]));
  await writeFile(join(root, 'docs/research/pattern-inventory.json'), JSON.stringify({ pages: [{ pageType: 'about', sections: [section(1, 'hero:media-banner', { width: 390, height: 557 })] }] }));
  await writeFile(join(root, 'docs/research/analysis/section-modules.json'), JSON.stringify([{ pageType: 'about', index: 1, module: 'hero:media-banner' }]));
  const made = await derivePhoneHeroes({ root });
  assert.equal(made.crops, 1);
  const crop = JSON.parse(await readFile(join(root, 'src/data/phone-heroes.json'), 'utf8')).crops[photo.src]['0.70'];
  assert.ok((await stat(join(root, 'public', crop.src))).size <= (await stat(desktop)).size, 'no heavier than the desktop file');
  // A desktop file far lighter than any crop can be (a flat 960 file beside the noisy widest one): no crop, reported.
  await sharp({ create: { width: 960, height: 640, channels: 3, background: '#808080' } }).webp().toFile(desktop);
  const none = await derivePhoneHeroes({ root });
  assert.equal(none.crops, 0);
  assert.equal(none.overBudget.length, 1);
  assert.match(none.overBudget[0], /a-960-phone-70\.webp/);
  assert.ok(!existsSync(join(root, 'public', crop.src)), 'the old crop is removed');
});
test("a competitor page whose hero is no section of the capture (baliswim's video heroes, aloha 2026-11-17) takes the measured heroes' median, else a 4:5 frame", () => {
  const inventory = { pages: [
    { pageType: 'solution', sections: [section(1, 'iconList:checks'), section(2, 'splitMedia:tinted')] },
    { pageType: 'about', sections: [section(1, 'figure', { width: 342, height: 257 })] },
  ] };
  const modules = [{ pageType: 'solution', index: 1, module: 'iconList:icons' }, { pageType: 'about', index: 1, module: 'figure' }];
  assert.deepEqual(phoneFrames(inventory, modules).hero.byPageType, { solution: DEFAULT_HERO_PHONE_RATIO, about: DEFAULT_HERO_PHONE_RATIO });
  assert.equal(DEFAULT_HERO_PHONE_RATIO, 0.8);
  // One page type's hero measured: the others without a hero section take it.
  const measured = { pages: [...inventory.pages, { pageType: 'home', sections: [section(1, 'hero:media-overlay', { width: 390, height: 717 })] }] };
  assert.deepEqual(phoneFrames(measured, [...modules, { pageType: 'home', index: 1, module: 'hero:media-overlay' }]).hero.byPageType, { solution: 0.54, about: 0.54, home: 0.54 });
});

test("a page type of the site the competitor has no page of takes the median hero frame too (aloha 2026-11-18: /our-process/, a general page with a split hero)", () => {
  const inventory = { pages: [{ pageType: 'home', sections: [section(1, 'hero:media-overlay', { width: 390, height: 717 })] }] };
  const modules = [{ pageType: 'home', index: 1, module: 'hero:media-overlay' }];
  assert.deepEqual(phoneFrames(inventory, modules, ['home', 'general']).hero.byPageType, { home: 0.54, general: 0.54 });
  assert.deepEqual(phoneFrames(inventory, modules).hero.byPageType, { home: 0.54 }, 'without the site\'s types, the competitor\'s only');
});
