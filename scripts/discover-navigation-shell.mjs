#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { normalizeReferenceUrl } from './capture-reference.mjs';
import { runMain, usage } from './lib/cli.mjs';
import { PAGE_SHELL } from './lib/page-shell.mjs';
import { scrollThroughPage } from './lib/reveal.mjs';

const VIEWPORTS = [
  { id: 'desktop-1440', width: 1440, height: 1000 },
  { id: 'tablet-768', width: 768, height: 1024 },
  { id: 'mobile-390', width: 390, height: 844 },
];

export function normalizeRoutePath(value, sourceUrl) {
  try {
    const url = new URL(value, sourceUrl);
    const source = new URL(sourceUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== source.origin) return null;
    let path = url.pathname.replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/';
    return `${path}${url.search}`;
  } catch { return null; }
}

export function classifyPage(route) {
  if (route === '/') return 'home';
  if (/^\/about(?:\/|$)/.test(route)) return 'about';
  if (/contact/.test(route)) return 'contact';
  if (/(manufacturer|manufacturing|services|private-label|custom-|supplier)/.test(route)) return 'manufacturer';
  return 'content';
}

function extension(url, contentType) {
  const map = new Map([['image/jpeg', '.jpg'], ['image/png', '.png'], ['image/webp', '.webp'], ['image/avif', '.avif'], ['image/gif', '.gif'], ['image/svg+xml', '.svg']]);
  const type = contentType.split(';')[0].toLowerCase();
  return map.get(type) || extname(new URL(url).pathname) || '.bin';
}

async function downloadAsset(url, directory, cache) {
  if (cache.has(url)) return cache.get(url);
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const body = Buffer.from(await response.arrayBuffer());
  const digest = createHash('sha256').update(body).digest('hex');
  const filename = `${digest.slice(0, 20)}${extension(url, response.headers.get('content-type') || '')}`;
  await writeFile(resolve(directory, filename), body);
  const path = `docs/research/navigation-assets/${filename}`;
  cache.set(url, path);
  return path;
}

async function settle(page) {
  await page.waitForLoadState('networkidle', { timeout: 2500 }).catch(() => {});
  await scrollThroughPage(page, { delay: 45, settle: 200 });
}

async function extractRoute(page) {
  return page.evaluate((pageShell) => {
    const text = (element) => element?.textContent?.replace(/\s+/g, ' ').trim() || '';
    const unique = (values) => [...new Set(values.filter(Boolean))];
    const backgroundUrls = (element) => [...getComputedStyle(element).backgroundImage.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map((match) => match[1]);
    const images = unique([...document.images].map((image) => image.currentSrc || image.src));
    const visibleElements = [...document.querySelectorAll('body *')].filter((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width >= 40 && rect.height >= 40 && style.display !== 'none' && style.visibility !== 'hidden';
    });
    const backgrounds = unique(visibleElements
      .map((element) => ({ urls: backgroundUrls(element), area: element.getBoundingClientRect().width * element.getBoundingClientRect().height }))
      .filter((item) => item.urls.length)
      .sort((left, right) => right.area - left.area)
      .flatMap((item) => item.urls));
    const regionCandidates = [...document.querySelectorAll(pageShell.sections)]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width >= innerWidth * .5 && rect.height >= 80 && (text(element) || element.querySelector('img') || backgroundUrls(element).length);
      });
    const sections = regionCandidates.slice(0, 20).map((element, index) => {
      const style = getComputedStyle(element);
      return {
        order: index + 1,
        heading: text(element.querySelector('h1,h2,h3')).slice(0, 180),
        surface: style.backgroundColor,
        backgroundImages: backgroundUrls(element),
        inlineImages: unique([...element.querySelectorAll('img')].map((image) => image.currentSrc || image.src)).slice(0, 6),
        height: Math.round(element.getBoundingClientRect().height),
      };
    });
    const header = document.querySelector(pageShell.header);
    const footer = document.querySelector(pageShell.footer);
    const shell = (element) => element ? {
      position: getComputedStyle(element).position,
      surface: getComputedStyle(element).backgroundColor,
      height: Math.round(element.getBoundingClientRect().height),
      backgroundImages: backgroundUrls(element),
    } : null;
    const contentNodes = (selector) => [...document.querySelectorAll(selector)].filter((element) => {
      if (element.closest('header, footer, nav, [role="banner"], [role="contentinfo"]')) return false;
      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden';
    });
    const headingTexts = unique(contentNodes(`h2, h3, ${pageShell.disclosureTitles}`).map(text));
    const paragraphTexts = unique(contentNodes(`p, ${pageShell.disclosurePanels}`).map(text).filter((value) => value.length >= 40));
    return {
      finalUrl: location.href,
      title: document.title,
      description: document.querySelector('meta[name=description]')?.content || '',
      h1: text(document.querySelector('h1')),
      headings: headingTexts.slice(0, 24),
      paragraphs: paragraphTexts.slice(0, 32),
      imageUrls: unique([...backgrounds, ...images]).filter((value) => /^https?:/.test(value)).slice(0, 8),
      anatomy: {
        bodySurface: getComputedStyle(document.body).backgroundColor,
        header: shell(header),
        footer: shell(footer),
        sections,
      },
    };
  }, PAGE_SHELL);
}

export async function discoverNavigationShell({ sourceUrl, root = process.cwd() }) {
  const url = normalizeReferenceUrl(sourceUrl);
  const { chromium } = await import('playwright');
  const researchDir = resolve(root, 'docs', 'research');
  const referenceDir = resolve(root, 'docs', 'design-references', 'routes');
  const dataDir = resolve(root, 'src', 'data');
  const assetDir = resolve(root, 'docs', 'research', 'navigation-assets');
  await Promise.all([researchDir, referenceDir, dataDir, assetDir].map((directory) => mkdir(directory, { recursive: true })));
  const browser = await chromium.launch({ headless: true });
  const discovered = new Map([['/', { route: '/', labels: ['Home'], viewports: [] }]]);
  const externalLinks = new Set();
  const assets = new Map();
  const assetFailures = [];
  const pages = [];
  let representatives = [];

  try {
    for (const viewport of VIEWPORTS) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
      if (!response?.ok()) throw new Error(`navigation discovery failed: ${response?.status() ?? 'no response'}`);
      await settle(page);
      const links = await page.evaluate((header) => {
        let anchors = [...document.querySelectorAll(header.split(', ').map((selector) => `${selector} a[href]`).join(', '))];
        if (!anchors.length) anchors = [...document.querySelectorAll('nav a[href]')];
        return anchors.map((anchor) => ({ href: anchor.href, label: anchor.textContent?.replace(/\s+/g, ' ').trim() || anchor.getAttribute('aria-label') || '' }));
      }, PAGE_SHELL.header);
      for (const link of links) {
        const route = normalizeRoutePath(link.href, url);
        if (!route) { if (/^https?:/.test(link.href)) externalLinks.add(link.href); continue; }
        const entry = discovered.get(route) || { route, labels: [], viewports: [] };
        if (link.label && !entry.labels.includes(link.label)) entry.labels.push(link.label);
        if (!entry.viewports.includes(viewport.id)) entry.viewports.push(viewport.id);
        discovered.set(route, entry);
      }
      await context.close();
    }

    const context = await browser.newContext({ viewport: VIEWPORTS[0] });
    const page = await context.newPage();
    for (const entry of discovered.values()) {
      const target = new URL(entry.route, url).href;
      try {
        const response = await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 90000 });
        if (!response?.ok()) throw new Error(`HTTP ${response?.status() ?? 'no response'}`);
        await settle(page);
        const extracted = await extractRoute(page);
        const localImages = [];
        for (const imageUrl of extracted.imageUrls) {
          try { localImages.push(await downloadAsset(imageUrl, assetDir, assets)); }
          catch (error) { assetFailures.push({ route: entry.route, url: imageUrl, issue: error.message }); }
        }
        pages.push({ ...entry, ...extracted, type: classifyPage(entry.route), images: localImages });
      } catch (error) {
        pages.push({ ...entry, finalUrl: target, type: classifyPage(entry.route), error: error.message, title: '', description: '', h1: '', headings: [], paragraphs: [], images: [] });
      }
    }
    await context.close();

    representatives = ['about', 'manufacturer', 'contact'].map((type) => pages.find((item) => item.type === type && !item.error)).filter(Boolean);
    for (const item of representatives) {
      for (const viewport of [VIEWPORTS[0], VIEWPORTS[2]]) {
        const context = await browser.newContext({ viewport });
        const page = await context.newPage();
        await page.goto(new URL(item.route, url).href, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await settle(page);
        const slug = item.route.slice(1).replaceAll('/', '-') || 'home';
        await page.screenshot({ path: resolve(referenceDir, `${slug}-${viewport.id}.png`), fullPage: true, animations: 'disabled' });
        await context.close();
      }
    }
  } finally { await browser.close(); }

  const manifest = {
    schemaVersion: 'seo-site-navigation-shell-v1', sourceUrl: url, generatedAt: new Date().toISOString(),
    viewports: VIEWPORTS, routeCount: pages.length, routes: pages, representatives: Object.fromEntries(representatives.map((item) => [item.type, item.route])),
    externalLinks: [...externalLinks], assets: Object.fromEntries(assets), assetFailures,
  };
  const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
  await writeFile(resolve(researchDir, 'navigation-shell.json'), serialized);
  await writeFile(resolve(dataDir, 'navigation-shell.json'), serialized);
  return manifest;
}

runMain(import.meta.url, async () => {
  const [sourceUrl] = process.argv.slice(2).filter((arg) => arg !== '--');
  if (!sourceUrl) return usage('Usage: node scripts/discover-navigation-shell.mjs <source-url>');
  const result = await discoverNavigationShell({ sourceUrl });
  console.log(JSON.stringify({ routeCount: result.routeCount, representatives: result.representatives, assetFailures: result.assetFailures.length }, null, 2));
}, { stack: true });
