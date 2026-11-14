import { chromium } from 'playwright';
import { resolve } from 'node:path';

// The owner's own Chrome profile for this tool: they sign in to ChatGPT, Claude, Gemini, Perplexity and Google once.
export async function openBrowser(config) {
  const context = await chromium.launchPersistentContext(resolve(config.browser_profile), {
    channel: 'chrome',
    headless: false,
    viewport: { width: 1280, height: 900 },
    args: ['--disable-blink-features=AutomationControlled'],
  });
  // Citation pills open their source in a new window; record the URL instead (survives navigation).
  await context.addInitScript(() => {
    window.__geoOpened = [];
    window.open = (url) => { window.__geoOpened.push(String(url)); return null; };
  });
  return context;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The engine cannot answer right now (usage limit and the like): the run records it and goes on; `ask` retries later.
export class UnavailableError extends Error {}

// Poll until `read()` returns the same non-empty value `stableCount` times in a row and `done()` (if given) is true.
export async function waitStable(read, { interval = 2500, stableCount = 2, timeout = 240000, done = async () => true } = {}) {
  const start = Date.now();
  let last = null, same = 0;
  while (Date.now() - start < timeout) {
    await sleep(interval);
    const value = await read().catch(() => null);
    if (value && value === last && (await done().catch(() => false))) {
      if (++same >= stableCount - 1) return value;
    } else same = 0;
    last = value;
  }
  throw new Error(`answer did not settle within ${timeout / 1000}s`);
}

// A CAPTCHA, a login wall or a mode the code cannot switch on: wait for the owner to clear it. Never solved by code.
export async function waitForHuman(page, isBlocked, message, { timeout = 15 * 60 * 1000, unattendedChecks = 6 } = {}) {
  if (!(await isBlocked().catch(() => false))) return;
  // Unattended (`geo site` inside the site build): nobody is at the window, so the receipt fails and DataForSEO fills it.
  // Right after the load a signed-in app can still show its signed-out shell: look again for a while before giving up.
  if (process.env.GEO_UNATTENDED) {
    for (let i = 0; i < unattendedChecks; i++) {
      await sleep(5000);
      if (!(await isBlocked().catch(() => true))) return;
    }
    throw new UnavailableError(`unattended, needs a person: ${message} (${page.url()}); if it is a sign-in, run \`geo login\``);
  }
  console.log(`\n⏸  ${message}\n   Waiting for you in the browser window (${page.url()})...`);
  await page.bringToFront();
  const start = Date.now();
  while (Date.now() - start < timeout) {
    await sleep(5000);
    if (!(await isBlocked().catch(() => true))) { console.log('▶  continuing'); return; }
  }
  throw new Error(`blocked: ${message}`);
}

// Anchors in a scope whose host is not one of the engine's own.
export async function externalLinks(locator, ownHosts) {
  return locator.evaluateAll((els, own) => els
    .map((a) => ({ url: a.href, title: (a.getAttribute('aria-label') || a.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 160) }))
    .filter((l) => { try { const h = new URL(l.url).hostname; return /^https?:/.test(l.url) && !own.some((o) => h === o || h.endsWith(`.${o}`)); } catch { return false; } }),
  ownHosts);
}

export async function drainOpened(page) {
  return page.evaluate(() => { const urls = window.__geoOpened || []; window.__geoOpened = []; return urls; });
}

export function dedupeCitations(list) {
  const seen = new Map();
  for (const c of list) if (c.url && !seen.has(c.url)) seen.set(c.url, c);
  return [...seen.values()];
}
