// What code measures for the claude-seo audit (scripts/claude-seo-audit.mjs), so the audit model reads numbers instead
// of running tools: claude-seo's scripts are not installed or run (owner 2026-11-17), and the audit runs with read
// tools only. The tools are the ones of Strandmill's hand-run audit of 2026-11-17 (docs/research/seo-audit-3/): a Node
// static server over the copied release build that answers like the Nginx config (a directory without its slash is a
// 301 to it, an unknown path is 404.html with status 404), and the site's own Playwright:
// - every page without JavaScript: title, meta, canonical, robots, Open Graph, headings, word count, JSON-LD, images,
//   links, forms (measurements/pages/<page>.json), and every internal link's status;
// - the focus pages on a desktop screen and on a throttled phone: FCP, LCP, CLS, requests, bytes, overflow, where the
//   H1 and the first actions are, a screenshot of each (screenshots/<page>-desktop.png, -mobile.png);
// - every page on the phone, scrolled to the end: overflow, script errors, failed requests, broken images.
// What a measurement could not read is written as an error, never left out.
// The server is its own and not lib/static-server.mjs: that one serves a directory without its slash as a page (the
// audits and the design shots do not need the 301), and changing it would run every step that uses it again.

import { createServer } from 'node:http';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { writeJson } from './json-io.mjs';

// The pages measured on both screens (owner 2026-11-17: "挑 10 个重点页").
export const SEO_AUDIT_FOCUS_PAGES = 10;
export const SEO_AUDIT_DESKTOP = Object.freeze({ width: 1366, height: 768 });
export const SEO_AUDIT_PHONE = Object.freeze({ width: 390, height: 844, deviceScaleFactor: 3 });
// The phone's network and CPU (owner 2026-11-17: "150 ms RTT / 1.6 Mbps / 4 倍 CPU 降速"; the upload is Lighthouse's
// mobileSlow4G 750 kbps), set through the Chrome DevTools Protocol as given, without DevTools' adjustment.
export const SEO_AUDIT_THROTTLING = Object.freeze({ requestLatencyMs: 150, downloadThroughputKbps: 1600, uploadThroughputKbps: 750, cpuSlowdownMultiplier: 4 });
const LOAD_TIMEOUT_MS = 60000;

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.mp4': 'video/mp4' };

// Serves dir on 127.0.0.1 (any free port) as the Nginx config does: { port, origin, close }.
export function serveAudit(dir) {
  const root = resolve(dir);
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://x');
    const path = decodeURIComponent(url.pathname);
    const file = normalize(join(root, path));
    if (file !== root && !file.startsWith(`${root}\\`) && !file.startsWith(`${root}/`)) { response.writeHead(403); response.end(); return; }
    const info = await stat(file).catch(() => null);
    if (info?.isDirectory() && !path.endsWith('/')) { response.writeHead(301, { location: `${path}/${url.search}` }); response.end(); return; }
    const target = info?.isDirectory() ? join(file, 'index.html') : file;
    const body = await readFile(target).catch(() => null);
    if (body) { response.writeHead(200, { 'content-type': TYPES[extname(target).toLowerCase()] ?? 'application/octet-stream' }); response.end(body); return; }
    const missing = await readFile(join(root, '404.html')).catch(() => null);
    response.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
    response.end(missing ?? 'Not found');
  });
  return new Promise((done, fail) => {
    server.once('error', fail);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      done({ port, origin: `http://127.0.0.1:${port}`, close: () => new Promise((closed) => server.close(() => closed())) });
    });
  });
}

// The focus pages: the home page, then the first page of each page type in the site's order, then the next pages in
// order, up to count. The same pages each run while the site's pages stay the same.
export function focusPages(pages, count = SEO_AUDIT_FOCUS_PAGES) {
  const chosen = [];
  const add = (page) => { if (chosen.length < count && !chosen.includes(page)) chosen.push(page); };
  for (const page of pages) if (page.route === '/') add(page);
  const types = new Set(chosen.map((page) => page.pageType));
  for (const page of pages) if (!types.has(page.pageType)) { types.add(page.pageType); add(page); }
  for (const page of pages) add(page);
  return chosen;
}

// A page's name in the measurement and screenshot files: home, about-us, 404.
export const pageSlug = (route) => (route === '/' ? 'home' : route.replace(/^\/|\/$/g, '').replace(/\.html$/, '').replace(/[^A-Za-z0-9-]+/g, '-') || 'home');

// What a page shows without JavaScript (run in the page).
function extractPage() {
  const text = (node) => (node?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const meta = (selector) => document.querySelector(selector)?.getAttribute('content') ?? null;
  const main = document.querySelector('main') ?? document.body;
  const body = text(main);
  return {
    lang: document.documentElement.lang || null,
    title: document.title, titleLength: document.title.length,
    description: meta('meta[name="description"]'), descriptionLength: meta('meta[name="description"]')?.length ?? 0,
    robots: meta('meta[name="robots"]'),
    canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null,
    og: Object.fromEntries([...document.querySelectorAll('meta[property^="og:"]')].map((node) => [node.getAttribute('property'), node.getAttribute('content')])),
    headings: [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')].map((node) => ({ level: Number(node.tagName.slice(1)), text: text(node) })),
    words: body ? body.split(' ').length : 0,
    jsonLd: [...document.querySelectorAll('script[type="application/ld+json"]')].map((node) => {
      try {
        const data = JSON.parse(node.textContent);
        const types = [];
        const visit = (value) => { if (Array.isArray(value)) value.forEach(visit); else if (value && typeof value === 'object') { if (value['@type']) types.push(...[value['@type']].flat()); Object.values(value).forEach(visit); } };
        visit(data);
        return { valid: true, types, context: data['@context'] ?? null };
      } catch (error) { return { valid: false, error: String(error.message) }; }
    }),
    images: [...document.querySelectorAll('img')].map((node) => ({ src: node.getAttribute('src'), alt: node.getAttribute('alt'), width: node.getAttribute('width'), height: node.getAttribute('height'), loading: node.getAttribute('loading'), fetchpriority: node.getAttribute('fetchpriority'), srcset: Boolean(node.getAttribute('srcset')) })),
    links: [...document.querySelectorAll('a[href]')].map((node) => ({ href: node.getAttribute('href'), text: text(node).slice(0, 80), inMain: main.contains(node), rel: node.getAttribute('rel') })),
    forms: [...document.querySelectorAll('form')].map((form) => ({ action: form.getAttribute('action'), method: form.getAttribute('method'), fields: [...form.querySelectorAll('input, select, textarea')].map((field) => ({ name: field.getAttribute('name'), type: field.type || field.tagName.toLowerCase(), required: field.required, label: field.id ? text(document.querySelector(`label[for="${field.id}"]`)) || null : null, autocomplete: field.getAttribute('autocomplete') })) })),
  };
}

// The paint and shift entries of a load (an init script in the page).
function watchPaints() {
  const audit = { fcp: null, lcp: null, lcpElement: null, cls: 0, shifts: [] };
  window.__seoAudit = audit;
  const describe = (node) => (node ? `${node.tagName}${node.className && typeof node.className === 'string' ? `.${node.className.trim().split(/\s+/)[0]}` : ''}` : null);
  new PerformanceObserver((entries) => { for (const entry of entries.getEntries()) { audit.lcp = entry.startTime; audit.lcpElement = [describe(entry.element), entry.url || null].filter(Boolean).join(' '); } }).observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver((entries) => { for (const entry of entries.getEntries()) if (!entry.hadRecentInput) { audit.cls += entry.value; audit.shifts.push({ value: entry.value, at: Math.round(entry.startTime), sources: (entry.sources ?? []).map((source) => describe(source.node)).filter(Boolean) }); } }).observe({ type: 'layout-shift', buffered: true });
  new PerformanceObserver((entries) => { for (const entry of entries.getEntries()) if (entry.name === 'first-contentful-paint') audit.fcp = entry.startTime; }).observe({ type: 'paint', buffered: true });
}

// The first screen after a load (run in the page): the H1 and the first actions, each with its box, and the overflow.
function firstScreen() {
  const box = (node) => { const rect = node.getBoundingClientRect(); return { top: Math.round(rect.top), bottom: Math.round(rect.bottom), fullyVisible: rect.top >= 0 && rect.bottom <= innerHeight, visible: rect.bottom > 0 && rect.top < innerHeight }; };
  const h1 = document.querySelector('h1');
  const actions = [...document.querySelectorAll('main a, main button, header a, header button')].filter((node) => { const rect = node.getBoundingClientRect(); const style = getComputedStyle(node); return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && rect.top < innerHeight && /button|btn|cta/i.test(`${node.className} ${node.getAttribute('role') ?? ''} ${node.tagName}`); }).slice(0, 4);
  return { h1: h1 ? { text: h1.textContent.replace(/\s+/g, ' ').trim(), ...box(h1) } : null, actions: actions.map((node) => ({ text: node.textContent.replace(/\s+/g, ' ').trim().slice(0, 60), ...box(node) })), overflowPx: Math.max(0, document.documentElement.scrollWidth - innerWidth), height: document.documentElement.scrollHeight };
}

// Scrolls a page to its end (lazy images load) and reads its overflow and broken images (run in the page).
async function sweepPage() {
  for (let y = 0; y < document.documentElement.scrollHeight; y += innerHeight) { window.scrollTo(0, y); await new Promise((done) => setTimeout(done, 60)); }
  await new Promise((done) => setTimeout(done, 400));
  const broken = [...document.querySelectorAll('img')].filter((image) => image.complete && image.currentSrc && image.naturalWidth === 0).map((image) => image.currentSrc);
  return { overflowPx: Math.max(0, document.documentElement.scrollWidth - innerWidth), broken, height: document.documentElement.scrollHeight };
}

async function throttle(context, page) {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: SEO_AUDIT_THROTTLING.requestLatencyMs, downloadThroughput: (SEO_AUDIT_THROTTLING.downloadThroughputKbps * 1000) / 8, uploadThroughput: (SEO_AUDIT_THROTTLING.uploadThroughputKbps * 1000) / 8 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: SEO_AUDIT_THROTTLING.cpuSlowdownMultiplier });
}

// One load of a focus page on one screen: its numbers and a screenshot.
async function renderPage(browser, origin, page, viewport, shots) {
  const phone = viewport === 'mobile';
  const context = await browser.newContext(phone ? { viewport: { width: SEO_AUDIT_PHONE.width, height: SEO_AUDIT_PHONE.height }, deviceScaleFactor: SEO_AUDIT_PHONE.deviceScaleFactor, isMobile: true, hasTouch: true } : { viewport: SEO_AUDIT_DESKTOP });
  try {
    const tab = await context.newPage();
    if (phone) await throttle(context, tab);
    await tab.addInitScript(watchPaints);
    let requests = 0;
    let bytes = 0;
    const sizes = [];
    tab.on('requestfinished', (request) => { requests += 1; sizes.push(request.sizes().then((size) => { bytes += size.responseBodySize + size.responseHeadersSize; }, () => null)); });
    const response = await tab.goto(`${origin}${page.route}`, { waitUntil: 'load', timeout: LOAD_TIMEOUT_MS });
    await tab.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 500)))));
    await Promise.all(sizes);
    const paints = await tab.evaluate(() => window.__seoAudit);
    const screen = await tab.evaluate(firstScreen);
    const shot = `screenshots/${pageSlug(page.route)}-${viewport}.png`;
    await tab.screenshot({ path: join(shots, '..', shot) });
    return { route: page.route, viewport, status: response?.status() ?? null, fcp: paints.fcp === null ? null : Math.round(paints.fcp), lcp: paints.lcp === null ? null : Math.round(paints.lcp), lcpElement: paints.lcpElement, cls: Number(paints.cls.toFixed(4)), shifts: paints.shifts.slice(0, 5), requests, kb: Math.round(bytes / 1024), ...screen, screenshot: shot };
  } catch (error) {
    return { route: page.route, viewport, error: error.message.split('\n')[0] };
  } finally {
    await context.close().catch(() => null);
  }
}

// Every page on the phone: overflow, script errors, failed requests, broken images.
async function sweep(browser, origin, pages) {
  const context = await browser.newContext({ viewport: { width: SEO_AUDIT_PHONE.width, height: SEO_AUDIT_PHONE.height }, deviceScaleFactor: SEO_AUDIT_PHONE.deviceScaleFactor, isMobile: true, hasTouch: true });
  const rows = [];
  try {
    for (const page of pages) {
      const tab = await context.newPage();
      const errors = [];
      const failed = [];
      tab.on('pageerror', (error) => errors.push(error.message.split('\n')[0]));
      tab.on('console', (message) => { if (message.type() === 'error') errors.push(message.text().slice(0, 200)); });
      tab.on('requestfailed', (request) => failed.push(`${request.url()} ${request.failure()?.errorText ?? ''}`.trim()));
      tab.on('response', (response) => { if (response.status() >= 400 && response.url() !== `${origin}${page.route}`) failed.push(`${response.url()} ${response.status()}`); });
      try {
        const response = await tab.goto(`${origin}${page.route}`, { waitUntil: 'load', timeout: LOAD_TIMEOUT_MS });
        rows.push({ route: page.route, status: response?.status() ?? null, ...(await tab.evaluate(sweepPage)), errors, failed });
      } catch (error) {
        rows.push({ route: page.route, error: error.message.split('\n')[0], errors, failed });
      }
      await tab.close().catch(() => null);
    }
  } finally {
    await context.close().catch(() => null);
  }
  return rows;
}

// The status of a path on the audit server, without following a redirect: { status, location }.
const statusOf = async (origin, path) => {
  const response = await fetch(`${origin}${path}`, { redirect: 'manual' }).catch((error) => ({ status: null, error }));
  return { status: response.status, location: response.headers?.get?.('location') ?? null };
};

// Measures the copied release build in dir/dist-release; pages: [{ route, pageType }] (the 404 page is measured too).
// Writes dir/measurements/site.json and pages/<page>.json and dir/screenshots/; returns { playwright, focus }.
export async function measureSite({ dir, pages, chromium = null, count = SEO_AUDIT_FOCUS_PAGES }) {
  const measurements = resolve(dir, 'measurements');
  const shots = resolve(dir, 'screenshots');
  await mkdir(resolve(measurements, 'pages'), { recursive: true });
  await mkdir(shots, { recursive: true });
  const browserType = chromium ?? (await import('playwright')).chromium;
  const playwright = await readFile(resolve('node_modules/playwright/package.json'), 'utf8').then((text) => JSON.parse(text).version, () => 'unknown');
  const focus = focusPages(pages, count);
  const server = await serveAudit(resolve(dir, 'dist-release'));
  const browser = await browserType.launch();
  try {
    const all = [...pages, { route: '/404.html', pageType: '404' }];
    const links = new Set();
    const extracted = [];
    const plain = await browser.newContext({ javaScriptEnabled: false, viewport: SEO_AUDIT_DESKTOP });
    try {
      for (const page of all) {
        const tab = await plain.newPage();
        try {
          const response = await tab.goto(`${server.origin}${page.route}`, { waitUntil: 'load', timeout: LOAD_TIMEOUT_MS });
          const data = await tab.evaluate(extractPage);
          for (const link of data.links) if (link.href.startsWith('/') && !link.href.startsWith('//')) links.add(link.href.split('#')[0] || '/');
          extracted.push({ route: page.route, status: response?.status() ?? null, words: data.words, title: data.title, h1: data.headings.filter((heading) => heading.level === 1).length });
          await writeJson(resolve(measurements, 'pages', `${pageSlug(page.route)}.json`), { route: page.route, pageType: page.pageType, status: response?.status() ?? null, ...data });
        } catch (error) {
          extracted.push({ route: page.route, error: error.message.split('\n')[0] });
        }
        await tab.close().catch(() => null);
      }
    } finally {
      await plain.close().catch(() => null);
    }
    const linkStatus = {};
    for (const link of [...links].sort()) linkStatus[link] = (await statusOf(server.origin, link)).status;
    const sample = pages.find((page) => page.route !== '/' && page.route.endsWith('/'));
    const responses = {
      directoryWithoutSlash: sample ? { path: sample.route.replace(/\/$/, ''), ...(await statusOf(server.origin, sample.route.replace(/\/$/, ''))) } : null,
      unknownPath: { path: '/no-such-page-seo-audit/', ...(await statusOf(server.origin, '/no-such-page-seo-audit/')) },
    };
    const render = [];
    for (const page of focus) for (const viewport of ['desktop', 'mobile']) render.push(await renderPage(browser, server.origin, page, viewport, shots));
    const swept = await sweep(browser, server.origin, all);
    await writeJson(resolve(measurements, 'site.json'), {
      tools: { server: 'Node static server over dist-release/: a directory without its slash is a 301, an unknown path 404.html with status 404', playwright, desktop: SEO_AUDIT_DESKTOP, phone: SEO_AUDIT_PHONE, throttling: SEO_AUDIT_THROTTLING },
      responses,
      pages: extracted,
      links: { checked: Object.keys(linkStatus).length, notOk: Object.fromEntries(Object.entries(linkStatus).filter(([, status]) => status !== 200)) },
      focus: focus.map((page) => page.route),
      render,
      sweep: swept,
    });
    return { playwright, focus: focus.map((page) => page.route) };
  } finally {
    await browser.close().catch(() => null);
    await server.close();
  }
}
