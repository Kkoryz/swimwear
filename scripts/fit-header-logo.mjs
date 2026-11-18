#!/usr/bin/env node

// The header's logo file, made for how the header shows it (four-site audit 2026-11-17: every site loaded a 2200 x 240
// PNG of 155-180 KB on every page to show it about 190 x 20, and Staylumen's dark grey wordmark sat on its black header,
// all but invisible). The brand step's full-size logo (stage 00's, the drawn wordmark or the typeset one) is the source:
// it leaves public/ for docs/research/brand/ (the schema logo and the icons are their own files, the share image is made
// from it before), and the header gets a WebP at twice the size it shows at (an SVG stays as it is while it reads and is
// small). The header is drawn in a browser with the site's own stylesheets, the logo shown and then hidden: the logo's
// ink against what is painted behind it. Below LOGO_MIN_CONTRAST (WCAG's 3:1 for graphics) the logo is made again in an
// inverse ink (the header's own text colour, else white or black, whichever reads) and the header uses that one; an
// inverse that still does not read stops the step. The footer names the site in text, which the contrast audit reads.
// Runs at the end of the brand step and again before each build (the treatment and the repairs set the header's colours
// after the brand step). Usage: node scripts/fit-header-logo.mjs

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { contrastRatio } from './lib/contrast.mjs';
import { runMain } from './lib/cli.mjs';
import { HEADER_LOGO_MAX_BYTES } from './lib/image-budgets.mjs';
import { readJson, writeJson } from './lib/json-io.mjs';
import { codeClosure } from './lib/module-graph.mjs';
import { plainCss, sourceDigest } from './lib/source-norm.mjs';
import { cssRules, pageCss, pageWords, sharedCss } from './lib/css-subset.mjs';

// WCAG 2.2 1.4.11: a logo is exempt, but one that does not reach the 3:1 of graphics does not read as the brand.
export const LOGO_MIN_CONTRAST = 3;
// Where the full-size logo is kept once it leaves public/.
export const LOGO_SOURCE = 'docs/research/brand/logo.png';
export const HEADER_FILE = 'logo-header.webp';
export const INVERSE_FILE = 'logo-header-inverse.webp';
// The small PNG left at the full-size logo's old address (site13 blind audit M3: the reference's footer rule
// content:url(/logo.png) answered 404 once the full-size logo left public/): the logo in its own ink at the header
// file's size, twice the size it shows at. Recorded in logoFit.png (the identity's and FIT_RECORD's), so a later run
// does not take it for a fresh full-size logo of the brand step.
export const SMALL_PNG_FILE = 'logo.png';
// The last fit and what it was made from (fitKey).
export const FIT_RECORD = 'docs/research/brand/header-logo-fit.json';
// The header file's pixels per CSS pixel shown.
const DENSITY = 2;
// Viewports the header is measured at: the widest the logo shows decides the file's size.
const VIEWPORTS = Object.freeze([{ width: 1440, height: 900 }, { width: 390, height: 844 }]);

const hex = (rgb) => `#${rgb.map((value) => Math.round(value).toString(16).padStart(2, '0')).join('')}`;
const rgbOf = (colour) => {
  const value = String(colour ?? '').trim();
  if (/^#[0-9a-f]{6}$/i.test(value)) return [1, 3, 5].map((index) => parseInt(value.slice(index, index + 2), 16));
  const parts = value.match(/rgba?\(([^)]+)\)/)?.[1].split(/[ ,/]+/).filter(Boolean).map(Number);
  return parts && parts.length >= 3 && (parts[3] ?? 1) > 0.5 ? parts.slice(0, 3) : null;
};

// The size a logo of naturalWidth x naturalHeight shows at in a box (object-fit: contain), in CSS pixels.
export function shownSize(box, natural) {
  const aspect = natural.width / natural.height;
  const width = Math.min(box.width, box.height * aspect);
  return { width, height: width / aspect };
}

// The logo's ink against what is behind it, from two shots of the same box (raw RGB, the logo shown and hidden): every
// pixel the logo changes is a sample; the logo's solid strokes (the ninetieth percentile, past anti-aliased edges) give
// its contrast. A logo that changes no pixel does not show at all: 1:1. background is the hidden shot's typical colour
// under the logo.
export function inkContrast(shown, hidden, channels = 3) {
  const samples = [];
  const behind = [];
  for (let index = 0; index + 2 < shown.length; index += channels) {
    const a = [shown[index], shown[index + 1], shown[index + 2]];
    const b = [hidden[index], hidden[index + 1], hidden[index + 2]];
    if (Math.max(...a.map((value, k) => Math.abs(value - b[k]))) < 3) continue;
    samples.push(contrastRatio(a, b));
    behind.push(b);
  }
  if (!samples.length) {
    const middle = Math.floor(hidden.length / channels / 2) * channels;
    return { ratio: 1, background: hex([hidden[middle], hidden[middle + 1], hidden[middle + 2]]), pixels: 0 };
  }
  samples.sort((x, y) => x - y);
  const luminance = (rgb) => rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  behind.sort((x, y) => luminance(x) - luminance(y));
  return { ratio: Math.round(samples[Math.floor(samples.length * 0.9)] * 100) / 100, background: hex(behind[Math.floor(behind.length / 2)]), pixels: samples.length };
}

// The ink an inverse logo takes on a background: the header's own text colour when it reads (4.5:1, so the logo keeps
// a margin over 3:1), else white or black, whichever reads more.
export function inverseInk(background, textColour = null) {
  const behind = rgbOf(background);
  const text = rgbOf(textColour);
  if (text && contrastRatio(text, behind) >= 4.5) return hex(text);
  return contrastRatio([255, 255, 255], behind) >= contrastRatio([0, 0, 0], behind) ? '#ffffff' : '#000000';
}

// A logo in one ink, its shape kept: each pixel's opacity stays (a logo on transparency) or is its darkness (a logo
// drawn opaque on white).
export async function inkedLogo(sharp, input, ink) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let opaque = true;
  for (let index = 3; index < data.length && opaque; index += 4) opaque = data[index] === 255;
  const [r, g, b] = rgbOf(ink);
  const out = Buffer.alloc(data.length);
  for (let index = 0; index < data.length; index += 4) {
    const alpha = opaque ? 255 - Math.round(data[index] * 0.2126 + data[index + 1] * 0.7152 + data[index + 2] * 0.0722) : data[index + 3];
    out.set([r, g, b, alpha], index);
  }
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

// The header file: the logo at width x height as WebP, the highest quality that keeps it within HEADER_LOGO_MAX_BYTES.
export async function headerWebp(sharp, input, { width, height }) {
  const sized = await sharp(input, { density: 300 }).resize({ width, height, fit: 'fill' }).png().toBuffer();
  let file;
  for (const quality of [90, 80, 70, 60]) {
    file = await sharp(sized).webp({ quality, alphaQuality: 100, effort: 6 }).toBuffer();
    if (file.length <= HEADER_LOGO_MAX_BYTES) break;
  }
  return file;
}

// The site's stylesheets as the browser reads them, without Tailwind (global.css's relative imports inlined in order).
export async function siteCss(root, file = 'src/styles/global.css', seen = new Set()) {
  const path = resolve(root, file);
  if (seen.has(path) || !existsSync(path)) return '';
  seen.add(path);
  // A byte-order mark inside the joined sheet would void the rule after it (Staylumen's reference.css starts with one).
  const text = await readFile(path, 'utf8');
  const css = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const parts = [];
  let rest = css;
  for (const match of css.matchAll(/@import\s+(?:url\()?["']([^"']+)["']\)?[^;]*;/g)) {
    rest = rest.replace(match[0], '');
    if (match[1].startsWith('.')) parts.push(await siteCss(root, resolve(dirname(path), match[1]), seen));
  }
  return [...parts, rest].join('\n');
}

// The header the logo is measured in: the template's header markup with the logo and one navigation link.
export const headerMarkup = ({ layout, src = '', width = 1, height = 1 }) => `
    <header class="site-header" data-site-header data-layout="${layout}" data-dropdown="mega">
      <div class="site-header__brand-row"><div class="container"><a href="/" class="site-header__brand"><img class="site-header__logo" src="${src}" alt="" width="${width}" height="${height}"></a></div></div>
      <div class="container site-header__bar"><nav class="site-nav" aria-label="Primary"><ul class="site-nav__list"><li class="site-nav__item"><a href="/a/" class="site-nav__link">Products</a></li></ul></nav></div>
    </header><main style="min-height:400px"></main>`;

// The header with the logo in it, drawn by the browser with the site's stylesheets: at each viewport the box the logo
// shows in and its ink against what is painted behind it; the header's text colour.
export async function measureHeaderLogo({ root, logo, layout = 'stacked' }) {
  const { chromium } = await import('playwright');
  const { default: sharp } = await import('sharp');
  const css = (await siteCss(root)).replace(/<\/style/gi, '');
  const src = `data:${logo.type};base64,${logo.bytes.toString('base64')}`;
  const html = `<!doctype html><html lang="en"><head><style>${css}</style></head><body>${headerMarkup({ layout, src, width: logo.width, height: logo.height })}</body></html>`;
  const browser = await chromium.launch({ headless: true });
  try {
    const views = [];
    let textColour = null;
    for (const viewport of VIEWPORTS) {
      const page = await browser.newPage({ viewport, deviceScaleFactor: DENSITY });
      await page.setContent(html, { waitUntil: 'load' });
      await page.$eval('img', (image) => image.decode().catch(() => {}));
      const box = await page.$eval('img', (image) => { const rect = image.getBoundingClientRect(); return { x: rect.left, y: rect.top, width: rect.width, height: rect.height }; });
      textColour ??= await page.$eval('.site-nav__link', (link) => getComputedStyle(link).color).catch(() => null);
      const clip = { x: Math.floor(box.x), y: Math.floor(box.y), width: Math.max(1, Math.ceil(box.width)), height: Math.max(1, Math.ceil(box.height)) };
      const shot = async () => (await sharp(await page.screenshot({ clip, animations: 'disabled' })).removeAlpha().raw().toBuffer());
      const shown = await shot();
      await page.$eval('img', (image) => { image.style.visibility = 'hidden'; });
      const hidden = await shot();
      views.push({ viewport: viewport.width, box, ...inkContrast(shown, hidden) });
      await page.close();
    }
    return { views, textColour };
  } finally {
    await browser.close();
  }
}

// The full-size logo the header file is made from: an SVG in public/ (stage 00's), else the PNG at LOGO_SOURCE. A PNG
// the brand step has just written to public/ moves there first, so no page can load it; the small PNG this step left
// there (logoFit.png: the identity's, or the fit record's once the brand step has written the identity anew) stays.
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function logoSource(root, identity = null, record = null) {
  const fresh = resolve(root, 'public/logo.png');
  const kept = resolve(root, LOGO_SOURCE);
  const small = [identity?.logoFit?.png?.sha256, record?.logoFit?.png?.sha256].filter(Boolean);
  const ours = existsSync(fresh) && existsSync(kept) && small.length > 0 && small.includes(sha256(await readFile(fresh)));
  if (existsSync(fresh) && !ours) {
    await mkdir(dirname(kept), { recursive: true });
    await rm(kept, { force: true });
    await rename(fresh, kept);
  }
  const svg = resolve(root, 'public/logo.svg');
  if (existsSync(svg)) return { path: svg, svg: true };
  return existsSync(kept) ? { path: kept, svg: false } : null;
}

// A logo as the browser is given it, at its own size (an SVG's at 72 dpi: its width and height, else its viewBox).
const asLogo = async (sharp, bytes, type) => { const { width, height } = await sharp(bytes).metadata(); return { bytes, type, width, height }; };

// What a fit is made from: the rules of the site's stylesheets the measured header can use (lib/css-subset.mjs: its
// markup's own and every page's, tokens included; without comments), its layout, the full-size logo and this code
// (lib/source-norm.mjs). The same inputs give the same header file: the fit is not made again (owner 2026-11-17,
// site13's 40-minute run: the header was drawn in a browser again on every brand step and every build).
export async function fitKey(root, { css, layout, logo }) {
  const rules = cssRules(plainCss(css));
  const header = `${sharedCss(rules)}\n${pageCss(rules, pageWords([headerMarkup({ layout })]))}`;
  const hash = createHash('sha256').update(header).update(`layout:${layout}`).update(logo);
  for (const file of await codeClosure(root, ['scripts/fit-header-logo.mjs'])) hash.update(file).update(sourceDigest(file, await readFile(resolve(root, file)).catch(() => Buffer.from('missing'))));
  return hash.digest('hex').slice(0, 24);
}

// Fits the header logo of a site with an identity (src/data/site-identity.json): writes the header file, points the
// identity's logo at it and records the measure in identity.logoFit. measure is the browser measurement (tests stub it).
// A fit of the same inputs (fitKey) whose header file is there is kept (FIT_RECORD: the brand step writes the identity
// anew, so the fit is recorded beside it too) and put back into the identity.
export async function fitHeaderLogo({ root = process.cwd(), measure = measureHeaderLogo } = {}) {
  const identityPath = resolve(root, 'src/data/site-identity.json');
  const identity = await readJson(identityPath, null);
  if (!identity) return null;
  const kept = await readJson(resolve(root, FIT_RECORD), null);
  const source = await logoSource(root, identity, kept);
  if (!source) throw new Error(`no full-size logo for the header: public/logo.svg, public/logo.png or ${LOGO_SOURCE}`);
  const layout = (await readJson(resolve(root, 'src/data/template-variants.json'), null))?.components?.header?.layout ?? 'stacked';
  const key = await fitKey(root, { css: await siteCss(root), layout, logo: await readFile(source.path) });
  if (kept?.key === key && kept.logo?.src && existsSync(resolve(root, 'public', kept.logo.src.replace(/^\//, '')))) {
    const same = JSON.stringify(identity.logo) === JSON.stringify(kept.logo) && JSON.stringify(identity.logoFit) === JSON.stringify(kept.logoFit);
    if (same) return identity;
    const restored = { ...identity, logo: kept.logo, logoFit: kept.logoFit };
    await writeJson(identityPath, restored);
    return restored;
  }
  const { default: sharp } = await import('sharp');
  const original = await asLogo(sharp, await readFile(source.path), source.svg ? 'image/svg+xml' : 'image/png');
  const first = await measure({ root, logo: original, layout });
  const widest = first.views.reduce((most, view) => Math.max(most, shownSize(view.box, original).width), 0);
  if (!(widest > 0)) throw new Error('the header shows no logo: its box has no size');
  const size = { width: Math.round(widest * DENSITY), height: Math.max(1, Math.round((widest * DENSITY * original.height) / original.width)) };
  const reads = (result) => Math.min(...result.views.map((view) => view.ratio)) >= LOGO_MIN_CONTRAST;
  const svgBytes = source.svg ? (await stat(source.path)).size : Infinity;
  const publicFile = (name) => resolve(root, 'public', name);
  let logo;
  let fit;
  if (reads(first)) {
    if (svgBytes <= HEADER_LOGO_MAX_BYTES) logo = { src: '/logo.svg', width: original.width, height: original.height };
    else {
      await writeFile(publicFile(HEADER_FILE), await headerWebp(sharp, original.bytes, size));
      logo = { src: `/${HEADER_FILE}`, ...size };
    }
    fit = { inverse: false };
  } else {
    const background = first.views.find((view) => view.ratio < LOGO_MIN_CONTRAST).background;
    const ink = inverseInk(background, first.textColour);
    const inverse = await headerWebp(sharp, await inkedLogo(sharp, await sharp(original.bytes, { density: 300 }).resize({ width: size.width * 2 }).png().toBuffer(), ink), size);
    const again = await measure({ root, logo: { bytes: inverse, type: 'image/webp', ...size }, layout });
    if (!reads(again)) throw new Error(`the header logo does not read: ${Math.min(...first.views.map((view) => view.ratio))}:1 on ${background}, and ${Math.min(...again.views.map((view) => view.ratio))}:1 in ${ink} (needs ${LOGO_MIN_CONTRAST}:1)`);
    await writeFile(publicFile(INVERSE_FILE), inverse);
    logo = { src: `/${INVERSE_FILE}`, ...size };
    fit = { inverse: true, ink, inverseContrast: Math.min(...again.views.map((view) => view.ratio)) };
  }
  // Only the header's file stays in public/, with the small PNG at /logo.png for any stylesheet that names it.
  for (const name of [HEADER_FILE, INVERSE_FILE]) if (logo.src !== `/${name}`) await rm(publicFile(name), { force: true });
  const small = await sharp(original.bytes, { density: 300 }).resize({ width: size.width, height: size.height, fit: 'fill' }).png({ palette: true, compressionLevel: 9 }).toBuffer();
  await writeFile(publicFile(SMALL_PNG_FILE), small);
  const contrast = Math.min(...first.views.map((view) => view.ratio));
  // The key stays in FIT_RECORD only: the identity is an input of every page's audit, and a key that changed while the
  // fit did not would measure every page again.
  const updated = { ...identity, logo, logoFit: { source: source.svg ? 'public/logo.svg' : LOGO_SOURCE, background: first.views.find((view) => view.ratio === contrast).background, contrast, ...fit, png: { src: `/${SMALL_PNG_FILE}`, ...size, sha256: sha256(small) } } };
  await writeJson(identityPath, updated);
  await writeJson(resolve(root, FIT_RECORD), { key, logo: updated.logo, logoFit: updated.logoFit });
  return updated;
}

runMain(import.meta.url, async () => {
  const identity = await fitHeaderLogo();
  if (!identity) return console.log('header logo: no site identity yet');
  const bytes = (await stat(resolve('public', identity.logo.src.slice(1)))).size;
  console.log(`header logo: ${identity.logo.src} ${identity.logo.width}x${identity.logo.height}, ${Math.round(bytes / 1024)} KB; ink ${identity.logoFit.contrast}:1 on ${identity.logoFit.background}${identity.logoFit.inverse ? `, inverse in ${identity.logoFit.ink} ${identity.logoFit.inverseContrast}:1` : ''}`);
});
