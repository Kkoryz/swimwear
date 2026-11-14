#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { revealDeferredContent, scrollThroughPage } from './lib/reveal.mjs';
import { writeJson } from './lib/json-io.mjs';

export const REFERENCE_VIEWPORTS = Object.freeze([
  { id: 'desktop-1440', width: 1440, height: 1000 },
  { id: 'tablet-768', width: 768, height: 1024 },
  { id: 'mobile-390', width: 390, height: 844 },
]);

const STYLE_PROPERTIES = Object.freeze([
  'display', 'position', 'inset', 'top', 'right', 'bottom', 'left', 'z-index',
  'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
  'box-sizing', 'overflow', 'overflow-x', 'overflow-y',
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'grid-template-columns', 'grid-template-rows', 'grid-auto-flow',
  'flex-direction', 'flex-wrap', 'justify-content', 'align-items', 'align-content', 'gap',
  'font-family', 'font-size', 'font-style', 'font-weight', 'line-height', 'letter-spacing',
  'text-align', 'text-decoration', 'text-transform', 'white-space',
  'color', 'background', 'background-color', 'background-image', 'background-position', 'background-size',
  'border', 'border-radius', 'box-shadow', 'opacity', 'visibility',
  'transform', 'transform-origin', 'transition', 'animation',
  'object-fit', 'object-position', 'filter', 'backdrop-filter', 'cursor',
]);

const CONTENT_TYPE_EXTENSIONS = new Map([
  ['image/avif', '.avif'], ['image/gif', '.gif'], ['image/jpeg', '.jpg'],
  ['image/png', '.png'], ['image/svg+xml', '.svg'], ['image/webp', '.webp'],
  ['font/otf', '.otf'], ['font/ttf', '.ttf'], ['font/woff', '.woff'], ['font/woff2', '.woff2'],
  ['video/mp4', '.mp4'], ['video/webm', '.webm'],
]);

export function normalizeReferenceUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
    url.hash = '';
    return url.href;
  } catch {
    throw new Error('reference URL must be an absolute HTTP(S) URL');
  }
}

function cleanFamily(value = '') {
  return value.split(',')[0].trim().replace(/^['"]|['"]$/g, '');
}

export function buildFontLock({ sourceUrl, elements, assets }) {
  const find = (predicate) => elements.find((element) => predicate(element) && element.styles?.['font-family']);
  const role = (element) => element ? {
    family: cleanFamily(element.styles['font-family']),
    weight: element.styles['font-weight'],
    size: element.styles['font-size'],
    lineHeight: element.styles['line-height'],
  } : null;
  const body = find((element) => element.tag === 'p' && element.directText) || find((element) => element.tag === 'body');
  const hero = find((element) => element.tag === 'h1' && element.directText);
  const display = find((element) => element.tag === 'h2' && element.directText);
  const subheading = find((element) => element.tag === 'h3' && element.directText);
  // Navigation: the first visible link text inside the header or nav, from computed styles (no page-builder rules).
  const navigation = find((element) => element.tag === 'a' && /(^|> )(header|nav)\b/i.test(element.selector) && element.directText && element.rect?.width > 1)
    || find((element) => /(header|nav)/i.test(element.selector) && element.directText && element.rect?.width > 1);
  return {
    schemaVersion: 'seo-site-font-lock-v1', sourceUrl,
    roles: { body: role(body), hero: role(hero), display: role(display), subheading: role(subheading), navigation: role(navigation || body) },
    assets: assets.filter((asset) => asset.contentType?.startsWith('font/')),
    requiredCssTokens: ['--font-body', '--font-hero', '--font-display', '--font-subheading', '--font-ui'],
  };
}

function assetExtension(url, contentType) {
  const normalizedType = contentType.split(';', 1)[0].trim().toLowerCase();
  const known = CONTENT_TYPE_EXTENSIONS.get(normalizedType);
  if (known) return known;
  const suffix = extname(new URL(url).pathname).toLowerCase();
  return /^\.[a-z0-9]{1,5}$/.test(suffix) ? suffix : '.bin';
}

async function extractPage(page, viewport) {
  return page.evaluate(({ viewport, styleProperties }) => {
    function selectorFor(element) {
      const parts = [];
      let current = element;
      while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.documentElement) {
        let part = current.localName;
        if (current.id) {
          part += `#${CSS.escape(current.id)}`;
          parts.unshift(part);
          break;
        }
        const siblings = current.parentElement
          ? [...current.parentElement.children].filter((child) => child.localName === current.localName)
          : [];
        if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
        parts.unshift(part);
        current = current.parentElement;
      }
      return parts.join(' > ');
    }

    function stylesFor(element, pseudo = null) {
      const computed = getComputedStyle(element, pseudo);
      return Object.fromEntries(styleProperties.map((property) => [property, computed.getPropertyValue(property)]));
    }

    const elements = [...document.querySelectorAll('*')].map((element) => {
      const rect = element.getBoundingClientRect();
      const before = stylesFor(element, '::before');
      const after = stylesFor(element, '::after');
      return {
        selector: selectorFor(element),
        tag: element.localName,
        attributes: Object.fromEntries([...element.attributes].map(({ name, value }) => [name, value])),
        directText: [...element.childNodes]
          .filter((node) => node.nodeType === Node.TEXT_NODE)
          .map((node) => node.textContent)
          .join('')
          .trim(),
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        styles: stylesFor(element),
        before: before.content === 'none' ? null : before,
        after: after.content === 'none' ? null : after,
      };
    });

    const controls = [...document.querySelectorAll('a,button,input,select,textarea,[role],[tabindex]')].map((element) => ({
      selector: selectorFor(element), tag: element.localName,
      role: element.getAttribute('role'),
      text: element.innerText?.trim() || element.getAttribute('aria-label') || '',
      href: element.href || null, type: element.getAttribute('type'),
      expanded: element.getAttribute('aria-expanded'), visible: Boolean(element.getClientRects().length),
    }));

    const assets = [...document.querySelectorAll('img,video,source,link[rel~="icon"]')].map((element) => ({
      tag: element.localName, src: element.currentSrc || element.src || element.href || null,
      srcset: element.srcset || null, alt: element.alt || null, poster: element.poster || null,
      width: element.naturalWidth || element.videoWidth || null,
      height: element.naturalHeight || element.videoHeight || null,
    }));

    const backgrounds = elements
      .filter(({ styles }) => styles['background-image'] !== 'none')
      .map(({ selector, styles }) => ({ selector, value: styles['background-image'] }));
    const fonts = document.fonts
      ? [...document.fonts].map((font) => ({ family: font.family, style: font.style, weight: font.weight, status: font.status }))
      : [];
    const mediaQueries = [];
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          if (rule.constructor.name === 'CSSMediaRule') mediaQueries.push(rule.conditionText);
        }
      } catch {}
    }

    return {
      schemaVersion: 'seo-site-reference-extraction-v1', capturedAt: new Date().toISOString(),
      url: location.href, title: document.title, viewport,
      document: { lang: document.documentElement.lang, bodyClass: document.body.className,
        scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight },
      metadata: [...document.head.querySelectorAll('meta,link')].map((element) => ({
        tag: element.localName,
        attributes: Object.fromEntries([...element.attributes].map(({ name, value }) => [name, value])),
      })),
      elements, controls, assets, backgrounds, fonts, mediaQueries: [...new Set(mediaQueries)],
    };
  }, { viewport, styleProperties: STYLE_PROPERTIES });
}

export async function captureReference({ sourceUrl, root = process.cwd() }) {
  const url = normalizeReferenceUrl(sourceUrl);
  const { chromium } = await import('playwright');
  const referenceDir = resolve(root, 'docs', 'design-references');
  const rawDir = resolve(root, 'docs', 'research', 'raw');
  // Captured files are evidence, not site files: they stay out of public/ so no build can publish them.
  const assetDir = resolve(root, 'docs', 'research', 'reference-assets');
  await Promise.all([referenceDir, rawDir, assetDir].map((directory) => mkdir(directory, { recursive: true })));

  const browser = await chromium.launch({ headless: true });
  const capturedAssets = new Map();
  const assetFailures = [];
  const results = [];
  let desktopExtraction = null;

  try {
    for (const viewport of REFERENCE_VIEWPORTS) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      const pendingAssets = [];
      if (viewport.id === 'desktop-1440') {
        page.on('response', (response) => {
          const resourceType = response.request().resourceType();
          if (!['image', 'font', 'media'].includes(resourceType) || !response.ok()) return;
          pendingAssets.push((async () => {
            const assetUrl = response.url();
            if (capturedAssets.has(assetUrl)) return;
            try {
              // A streamed (range-requested) media body is not kept by the browser: fetch the file directly instead.
              const { body, contentType } = await response.body()
                .then((bytes) => ({ body: bytes, contentType: response.headers()['content-type'] || '' }))
                .catch(async () => {
                  const direct = await fetch(assetUrl, { signal: AbortSignal.timeout(120000) });
                  if (!direct.ok) throw new Error(`direct download failed: ${direct.status}`);
                  return { body: Buffer.from(await direct.arrayBuffer()), contentType: direct.headers.get('content-type') || '' };
                });
              const digest = createHash('sha256').update(body).digest('hex');
              const filename = `${digest.slice(0, 20)}${assetExtension(assetUrl, contentType)}`;
              await writeFile(resolve(assetDir, filename), body);
              capturedAssets.set(assetUrl, { url: assetUrl, path: `docs/research/reference-assets/${filename}`, sha256: digest, bytes: body.length, contentType });
            } catch (error) {
              assetFailures.push({ url: assetUrl, issue: error.message });
            }
          })());
        });
      }

      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
      if (!response || !response.ok()) throw new Error(`reference navigation failed: ${response?.status() ?? 'no response'} ${url}`);
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      await revealDeferredContent(page);
      await scrollThroughPage(page);
      await Promise.allSettled(pendingAssets);
      const extraction = await extractPage(page, viewport);
      if (viewport.id === 'desktop-1440') desktopExtraction = extraction;
      await page.screenshot({ path: resolve(referenceDir, `${viewport.id}.png`), fullPage: true, animations: 'disabled' });
      await writeJson(resolve(rawDir, `${viewport.id}.json`), extraction);
      if (viewport.id === 'desktop-1440') await writeFile(resolve(rawDir, 'rendered.html'), await page.content());
      results.push({ id: viewport.id, url: extraction.url, elementCount: extraction.elements.length,
        controlCount: extraction.controls.length, screenshot: `docs/design-references/${viewport.id}.png` });
      await context.close();
    }
  } finally {
    await browser.close();
  }

  const summary = { schemaVersion: 'seo-site-reference-capture-v1', sourceUrl: url,
    captures: results, assets: [...capturedAssets.values()], assetFailures };
  await writeJson(resolve(rawDir, 'capture-summary.json'), summary);
  await writeJson(resolve(rawDir, 'asset-map.json'), Object.fromEntries([...capturedAssets].map(([key, value]) => [key, value.path])));
  const fontLock = buildFontLock({ sourceUrl: url, elements: desktopExtraction?.elements || [], assets: summary.assets });
  await writeJson(resolve(rawDir, 'font-lock.json'), fontLock);
  return summary;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [sourceUrl] = process.argv.slice(2).filter((arg) => arg !== '--');
  if (!sourceUrl) {
    console.error('Usage: node scripts/capture-reference.mjs <source-url>');
    process.exitCode = 1;
  } else {
    try {
      const summary = await captureReference({ sourceUrl });
      console.log(JSON.stringify(summary, null, 2));
      // Missing evidence stops the run: a failed asset is never silently skipped.
      if (summary.assetFailures.length) { console.error(`${summary.assetFailures.length} asset(s) failed; see docs/research/raw/capture-summary.json`); process.exitCode = 1; }
    } catch (error) {
      console.error(error.stack || error.message);
      process.exitCode = 1;
    }
  }
}
