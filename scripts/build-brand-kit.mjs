#!/usr/bin/env node

// Fallback brand kit, for a line whose stage 00 brand (projects/<line>/brand/, see import-brand-kit.mjs) is not ready:
// a monogram mark and a wordmark typeset in the template's display font and accent colour, written under the same
// site-root file names stage 00 uses, plus src/data/site-identity.json. Nothing is drawn by an image model.
// Usage: node scripts/build-brand-kit.mjs --name "Crest Knit" --domain crestknit.com

import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { canonicalOrigin, fontFaceUrl, identityFromFiles, monogram, resolveToken } from './lib/brand-kit.mjs';
import { cliArgs, runMain, usage } from './lib/cli.mjs';
import { writeJson } from './lib/json-io.mjs';
import { writeShareImage } from './lib/share-image.mjs';

const MARK_SIZES = [
  { file: 'icon-512.png', size: 512 },
  { file: 'icon-192.png', size: 192 },
  { file: 'apple-touch-icon.png', size: 180 },
  { file: 'favicon-48.png', size: 48 },
];
const WORDMARK_HEIGHT = 160;

// WCAG relative luminance and contrast, to pick white or ink letters on the accent square.
function luminance(hex) {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? [...value].map((c) => c + c).join('') : value.slice(0, 6);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
const isHex = (value) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value || '');

export async function buildBrandKit({ name, domain, root = process.cwd() }) {
  const css = await readFile(resolve(root, 'src/styles/global.css'), 'utf8');
  const accent = resolveToken(css, '--accent');
  const ink = [resolveToken(css, '--heading-color'), resolveToken(css, '--text-primary')].find(isHex) ?? '#111111';
  if (!isHex(accent)) throw new Error(`--accent must be a hex colour in global.css, found ${accent}`);
  const family = (resolveToken(css, '--font-display') || resolveToken(css, '--font-body') || 'sans-serif').split(',')[0].replace(/["']/g, '').trim();
  const fontPath = fontFaceUrl(css, family);
  const letters = monogram(name);
  const letterColour = contrast('#ffffff', accent) >= 3 ? '#ffffff' : ink;
  const fontFace = fontPath ? `@font-face { font-family: "BrandFont"; src: url("${pathToFileURL(resolve(root, 'public', fontPath.replace(/^\//, ''))).href}"); font-weight: 100 900; }` : '';
  const fontStack = `${fontPath ? '"BrandFont", ' : ''}"${family}", sans-serif`;
  const mark = (size) => `<div class="mark" style="width:${size}px;height:${size}px;border-radius:${Math.round(size * 0.22)}px;font-size:${Math.round(size * 0.46)}px">${letters}</div>`;
  const html = `<!doctype html><html><head><style>
    ${fontFace}
    body { margin: 0; background: transparent; }
    .mark { display: grid; place-items: center; background: ${accent}; color: ${letterColour}; font-family: ${fontStack}; font-weight: 700; letter-spacing: -0.02em; line-height: 1; }
    .wordmark { display: inline-flex; align-items: center; gap: ${Math.round(WORDMARK_HEIGHT * 0.22)}px; padding: 8px; }
    .wordmark span { font-family: ${fontStack}; font-weight: 700; font-size: ${Math.round(WORDMARK_HEIGHT * 0.62)}px; line-height: 1; color: ${ink}; letter-spacing: -0.01em; white-space: nowrap; }
  </style></head><body>
    ${MARK_SIZES.map(({ size }) => `<div id="m${size}" style="display:inline-block">${mark(size)}</div>`).join('')}
    <div id="wordmark" class="wordmark">${mark(WORDMARK_HEIGHT)}<span>${name.replace(/</g, '&lt;')}</span></div>
  </body></html>`;

  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  const outDir = resolve(root, 'public');
  await mkdir(outDir, { recursive: true });
  const files = Object.fromEntries(MARK_SIZES.map(({ file, size }) => [file, { width: size, height: size }]));
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    for (const { file, size } of MARK_SIZES) await page.locator(`#m${size} .mark`).screenshot({ path: resolve(outDir, file), omitBackground: true });
    const box = await page.locator('#wordmark').boundingBox();
    await page.locator('#wordmark').screenshot({ path: resolve(outDir, 'logo.png'), omitBackground: true });
    files['logo.png'] = { width: Math.round(box.width), height: Math.round(box.height) };
    // The share image: the wordmark on the site's page colour.
    const { default: sharp } = await import('sharp');
    const paper = /^#[0-9a-f]{6}$/i.test(resolveToken(css, '--surface-primary') ?? '') ? resolveToken(css, '--surface-primary') : '#ffffff';
    files['og-image.png'] = await writeShareImage(sharp, { logo: resolve(outDir, 'logo.png'), background: paper, path: resolve(outDir, 'og-image.png') });
  } finally {
    await browser.close();
  }
  const identity = { ...identityFromFiles({ siteName: name, origin: canonicalOrigin(domain), source: 'build-brand-kit', files }), generated: { monogram: letters, font: family, accent, letterColour, ink } };
  await mkdir(resolve(root, 'src/data'), { recursive: true });
  await writeJson(resolve(root, 'src/data/site-identity.json'), identity);
  return identity;
}

runMain(import.meta.url, async () => {
  const { name, domain } = cliArgs({ name: { type: 'string' }, domain: { type: 'string' } }).values;
  if (!name || !domain) return usage('Usage: node scripts/build-brand-kit.mjs --name "<site name>" --domain <domain>');
  console.log(JSON.stringify(await buildBrandKit({ name, domain }), null, 2));
});
