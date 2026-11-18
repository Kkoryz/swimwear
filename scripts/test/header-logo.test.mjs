import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import { HEADER_FILE, INVERSE_FILE, LOGO_SOURCE, fitHeaderLogo, inkContrast, inkedLogo, inverseInk, measureHeaderLogo, shownSize, siteCss } from '../fit-header-logo.mjs';
import { HEADER_LOGO_MAX_BYTES } from '../lib/image-budgets.mjs';

const TEMPLATE = resolve(import.meta.dirname, '../..');
// Two shots of a 4-pixel box: the logo shown over and hidden from the same background.
const shots = (ink, background, inked = 2) => {
  const hidden = Buffer.from(Array.from({ length: 4 }, () => background).flat());
  const shown = Buffer.from(Array.from({ length: 4 }, (_, index) => (index < inked ? ink : background)).flat());
  return [shown, hidden];
};

test("the logo's ink is read against what is painted behind it: Staylumen's #171717 on black does not read, white does, an invisible one is 1:1", () => {
  // Four-site audit 2026-11-17: Staylumen's dark grey wordmark on its black header.
  const dark = inkContrast(...shots([23, 23, 23], [0, 0, 0]));
  assert.ok(dark.ratio < 3 && dark.ratio > 1);
  assert.equal(dark.background, '#000000');
  assert.equal(inkContrast(...shots([255, 255, 255], [0, 0, 0])).ratio, 21);
  assert.deepEqual(inkContrast(...shots([0, 0, 0], [0, 0, 0])), { ratio: 1, background: '#000000', pixels: 0 });
  // The inverse takes the header's own text colour when it reads, else white or black.
  assert.equal(inverseInk('#000000', 'rgb(240, 236, 228)'), '#f0ece4');
  assert.equal(inverseInk('#000000', 'rgb(40, 40, 40)'), '#ffffff');
  assert.equal(inverseInk('#f5f5f5'), '#000000');
  // A logo shows in its box at the box's height, or narrower when the box's width caps it (object-fit: contain).
  assert.deepEqual(shownSize({ width: 192, height: 40 }, { width: 2819, height: 240 }), { width: 192, height: 192 / (2819 / 240) });
  assert.deepEqual(shownSize({ width: 256, height: 40 }, { width: 400, height: 100 }), { width: 160, height: 40 });
});

test('an inverse logo keeps its shape in the new ink: opacity from a transparent logo, darkness from one on white', async () => {
  const { default: sharp } = await import('sharp');
  const transparent = await sharp({ create: { width: 2, height: 1, channels: 4, background: { r: 23, g: 23, b: 23, alpha: 0 } } }).composite([{ input: { create: { width: 1, height: 1, channels: 4, background: { r: 23, g: 23, b: 23, alpha: 1 } } }, left: 0, top: 0 }]).png().toBuffer();
  const inked = await sharp(await inkedLogo(sharp, transparent, '#ffffff')).raw().toBuffer();
  assert.deepEqual([...inked], [255, 255, 255, 255, 255, 255, 255, 0]);
  const onWhite = await sharp({ create: { width: 2, height: 1, channels: 3, background: '#ffffff' } }).composite([{ input: { create: { width: 1, height: 1, channels: 3, background: '#000000' } }, left: 1, top: 0 }]).png().toBuffer();
  assert.deepEqual([...(await sharp(await inkedLogo(sharp, onWhite, '#ffffff')).raw().toBuffer())], [255, 255, 255, 0, 255, 255, 255, 255]);
});

// A site root with an identity and the brand step's full-size wordmark (2819 x 240 like Staylumen's) in public/.
async function site(ink = { r: 23, g: 23, b: 23 }) {
  const { default: sharp } = await import('sharp');
  const root = await mkdtemp(join(tmpdir(), 'header-logo-'));
  await mkdir(join(root, 'public'), { recursive: true });
  await mkdir(join(root, 'src/data'), { recursive: true });
  const letters = Array.from({ length: 9 }, (_, index) => ({ input: { create: { width: 220, height: 200, channels: 4, background: { ...ink, alpha: 1 } } }, left: 40 + index * 310, top: 20 }));
  await sharp({ create: { width: 2819, height: 240, channels: 4, background: { ...ink, alpha: 0 } } }).composite(letters).png().toFile(join(root, 'public/logo.png'));
  await writeFile(join(root, 'src/data/site-identity.json'), JSON.stringify({ schemaVersion: 'seo-site-identity-v1', siteName: 'Staylumen', origin: 'https://staylumen.com', logo: { src: '/logo.png', width: 2819, height: 240 }, schemaLogo: { src: '/icon-512.png', width: 512, height: 512 } }));
  return root;
}

test('the header gets the logo at twice the size it shows, as a WebP within the budget; the full-size PNG leaves public/', async () => {
  const root = await site();
  const seen = [];
  const measure = async ({ logo }) => { seen.push(logo); return { views: [{ viewport: 1440, box: { width: 192, height: 40 }, ratio: 12.5, background: '#ffffff' }, { viewport: 390, box: { width: 175, height: 40 }, ratio: 12.5, background: '#ffffff' }], textColour: 'rgb(23, 23, 23)' }; };
  const identity = await fitHeaderLogo({ root, measure });
  assert.deepEqual(identity.logo, { src: `/${HEADER_FILE}`, width: 384, height: 33 });
  assert.equal(identity.logoFit.inverse, false);
  assert.equal(seen[0].width, 2819, 'measured at the source size');
  assert.ok((await stat(join(root, 'public', HEADER_FILE))).size <= HEADER_LOGO_MAX_BYTES);
  assert.ok(existsSync(join(root, LOGO_SOURCE)), 'the full-size logo is kept outside public/');
  // A small /logo.png at the header file's size stays for a stylesheet that names it (site13 blind audit M3).
  const { default: sharp } = await import('sharp');
  const small = await sharp(join(root, 'public/logo.png')).metadata();
  assert.deepEqual([small.width, small.height, identity.logoFit.png.src], [384, 33, '/logo.png']);
  assert.ok((await stat(join(root, 'public/logo.png'))).size <= HEADER_LOGO_MAX_BYTES);
  assert.deepEqual(JSON.parse(await readFile(join(root, 'src/data/site-identity.json'), 'utf8')).logo, identity.logo);
  // Fitted again (the build step), from the kept source and the same stylesheets: the same file, not measured again
  // (owner 2026-11-17, site13's 40-minute run); the brand step's new identity gets the fit back.
  const again = await fitHeaderLogo({ root, measure });
  assert.deepEqual(again.logo, identity.logo);
  assert.equal((await sharp(join(root, LOGO_SOURCE)).metadata()).width, 2819, 'the small PNG is not taken for a fresh full-size logo');
  assert.equal((await sharp(join(root, 'public/logo.png')).metadata()).width, 384);
  assert.equal(seen.length, 1, 'the same inputs are not measured again');
  await writeFile(join(root, 'src/data/site-identity.json'), JSON.stringify({ schemaVersion: 'seo-site-identity-v1', siteName: 'Staylumen', origin: 'https://staylumen.com', logo: { src: '/logo.png', width: 2819, height: 240 } }));
  assert.deepEqual((await fitHeaderLogo({ root, measure })).logo, identity.logo);
  assert.equal(seen.length, 1);
  assert.equal((await sharp(join(root, LOGO_SOURCE)).metadata()).width, 2819, 'a new identity from the brand step does not make the small PNG the full-size logo');
  await mkdir(join(root, 'src/styles'), { recursive: true });
  await writeFile(join(root, 'src/styles/global.css'), '/* only a comment */');
  await fitHeaderLogo({ root, measure });
  assert.equal(seen.length, 1, 'a comment in the stylesheets changes nothing');
  await writeFile(join(root, 'src/styles/global.css'), '.site-header { background: #003049; }');
  await fitHeaderLogo({ root, measure });
  assert.equal(seen.length, 2, 'a header with other colours is measured again');
  await writeFile(join(root, 'src/styles/global.css'), '.site-header { background: #003049; }\n.table-block td { padding: 1rem; }');
  await fitHeaderLogo({ root, measure });
  assert.equal(seen.length, 2, 'a rule the header cannot use changes nothing');
  assert.equal(JSON.parse(await readFile(join(root, 'src/data/site-identity.json'), 'utf8')).logoFit.key, undefined, 'the identity (an input of every audit) does not carry the key');
});

test('a logo that does not read on the header is made again in an inverse ink and the header uses it; one that still does not read stops the step', async () => {
  const { default: sharp } = await import('sharp');
  const root = await site();
  const box = { width: 192, height: 40 };
  const calls = [];
  const measure = async ({ logo }) => { calls.push(logo.type); return { views: [{ viewport: 1440, box, ratio: logo.type === 'image/png' ? 1.17 : 20.6, background: '#000000' }], textColour: 'rgb(255, 255, 255)' }; };
  const identity = await fitHeaderLogo({ root, measure });
  assert.deepEqual(calls, ['image/png', 'image/webp'], 'the inverse is measured before it is used');
  assert.deepEqual(identity.logo, { src: `/${INVERSE_FILE}`, width: 384, height: 33 });
  assert.deepEqual([identity.logoFit.inverse, identity.logoFit.ink, identity.logoFit.contrast, identity.logoFit.background], [true, '#ffffff', 1.17, '#000000']);
  const { data, info } = await sharp(join(root, 'public', INVERSE_FILE)).raw().toBuffer({ resolveWithObject: true });
  let brightest = 0;
  for (let index = 0; index < data.length; index += info.channels) if (data[index + 3] > 200) brightest = Math.max(brightest, data[index]);
  assert.ok(brightest > 240, 'the inverse is white');
  assert.ok(!existsSync(join(root, 'public', HEADER_FILE)), 'only the file the header uses stays');
  // The header's colours changed (its stylesheet): measured again, and an inverse that does not read either stops it.
  await mkdir(join(root, 'src/styles'), { recursive: true });
  await writeFile(join(root, 'src/styles/global.css'), '.site-header { background: #777777; }');
  const unreadable = async () => ({ views: [{ viewport: 1440, box, ratio: 1.2, background: '#777777' }], textColour: null });
  await assert.rejects(fitHeaderLogo({ root, measure: unreadable }), /header logo does not read/);
});

test("a small SVG that reads stays the header's logo; a site without an identity has nothing to fit", async () => {
  const root = await mkdtemp(join(tmpdir(), 'header-logo-svg-'));
  assert.equal(await fitHeaderLogo({ root, measure: async () => assert.fail('nothing to measure') }), null);
  await mkdir(join(root, 'public'), { recursive: true });
  await mkdir(join(root, 'src/data'), { recursive: true });
  await writeFile(join(root, 'public/logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="100" viewBox="0 0 400 100"><rect x="10" y="10" width="380" height="80" fill="#111"/></svg>');
  await writeFile(join(root, 'src/data/site-identity.json'), JSON.stringify({ siteName: 'Crest Knit', logo: { src: '/logo.svg', width: 400, height: 100 } }));
  const identity = await fitHeaderLogo({ root, measure: async () => ({ views: [{ viewport: 1440, box: { width: 160, height: 40 }, ratio: 18, background: '#ffffff' }], textColour: null }) });
  assert.deepEqual(identity.logo, { src: '/logo.svg', width: 400, height: 100 });
  assert.equal(identity.logoFit.source, 'public/logo.svg');
});

test("the header is drawn with the site's own stylesheets: a treatment's black header (behind a byte-order mark) fails a dark logo, an inverse reads", async () => {
  const { default: sharp } = await import('sharp');
  const root = await mkdtemp(join(tmpdir(), 'header-logo-browser-'));
  await mkdir(join(root, 'src/styles'), { recursive: true });
  for (const file of ['template.css', 'patterns.css']) await copyFile(join(TEMPLATE, 'src/styles', file), join(root, 'src/styles', file));
  await writeFile(join(root, 'src/styles/global.css'), '@import "tailwindcss";\n@import "./template.css";\n@import "./patterns.css";\n@import "./reference.css";\n:root { --surface-primary: #ffffff; --text-primary: #171717; }\n');
  // Staylumen's reference.css: a byte-order mark, then the treatment's palette on :root:root.
  await writeFile(join(root, 'src/styles/reference.css'), String.fromCharCode(0xfeff) + '/* treatment */\n:root:root { --surface-primary: rgb(0 0 0); --text-primary: rgb(255 255 255); }\n.site-header { --logo-height: 40px; --logo-max-width: min(12rem, 45vw); }\n');
  assert.match(await siteCss(root), /:root:root/);
  const wordmark = async (ink) => ({ bytes: await sharp({ create: { width: 1200, height: 100, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: { create: { width: 1000, height: 80, channels: 4, background: { ...ink, alpha: 1 } } }, left: 100, top: 10 }]).png().toBuffer(), type: 'image/png', width: 1200, height: 100 });
  const dark = await measureHeaderLogo({ root, logo: await wordmark({ r: 23, g: 23, b: 23 }) });
  assert.ok(dark.views.every((view) => view.ratio < 3), JSON.stringify(dark.views));
  assert.equal(dark.views[0].background, '#000000');
  assert.equal(Math.round(dark.views[0].box.width), 192, 'the treatment caps the logo at 12rem');
  assert.match(dark.textColour, /255, 255, 255/);
  const light = await measureHeaderLogo({ root, logo: await wordmark({ r: 255, g: 255, b: 255 }) });
  assert.ok(light.views.every((view) => view.ratio >= 3), JSON.stringify(light.views));
});
