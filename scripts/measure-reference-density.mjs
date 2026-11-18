#!/usr/bin/env node

// Measures the reference pages' visual density at 1440 and stores the bands the candidate must stay within, and the
// words a picture-less run may hold (lib/density.mjs textRunWords) and the band itself for the image planning
// (src/data/template-variants.json components.textRunWords and components.densityBands, the visual budget of
// lib/visual-budget.mjs: the keys this step writes there). A URL given as <page type>=<url> is measured for that page
// type alone (its own band, lib/density.mjs pageTypeBands: the home page by the competitor's home); the others are the
// benchmark every other page type is held to.
// Usage: node scripts/measure-reference-density.mjs <url>... [<page type>=<url>]...

import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { normalizeReferenceUrl } from './capture-reference.mjs';
import { runMain } from './lib/cli.mjs';
import { revealDeferredContent } from './lib/reveal.mjs';
import { DENSITY_SCHEMA, DENSITY_TOLERANCE, measureDensity, pageTypeBands, textRunWords } from './lib/density.mjs';
import { readJson, writeJson } from './lib/json-io.mjs';
import { BLOCKED_STATUSES } from './lib/reference-access.mjs';

// A command-line URL: <page type>=<url> for a page type's own band, else a URL of the benchmark.
export function densityTarget(arg) {
  const typed = /^([a-z][a-z_]*)=(.+)$/.exec(arg);
  return typed ? { pageType: typed[1], url: typed[2] } : { url: arg };
}

export async function measureReferenceDensity({ urls, root = process.cwd() }) {
  if (!urls.length) throw new Error('pass at least one reference URL');
  const targets = urls.map((item) => (typeof item === 'string' ? densityTarget(item) : item));
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  const pages = [];
  const previous = await readJson(resolve(root, 'docs/research/raw/reference-density.json'), null);
  try {
    for (const { url: given, pageType } of targets) {
      const url = normalizeReferenceUrl(given);
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
      if (!response?.ok()) {
        const status = response?.status() ?? null;
        // A reference that refuses this machine keeps the measure an earlier run took of the same address
        // (lib/reference-access.mjs; site12's hhmhotels.com, 2026-11-17); one never measured stops the step.
        const kept = BLOCKED_STATUSES.includes(status) ? previous?.pages?.find((item) => item.url === url && (item.pageType ?? null) === (pageType ?? null)) : null;
        await page.close();
        if (!kept) throw new Error(`reference density failed: ${status ?? 'no response'} ${url}`);
        console.warn(`density: ${url} answered ${status}; it keeps the measure an earlier run took (stale in docs/research/raw/reference-density.json)`);
        pages.push({ ...kept, stale: { status } });
        continue;
      }
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      await revealDeferredContent(page);
      pages.push({ url, ...(pageType ? { pageType } : {}), metrics: await measureDensity(page) });
      await page.close();
    }
  } finally {
    await browser.close();
  }
  const report = { schemaVersion: DENSITY_SCHEMA, measuredAt: new Date().toISOString(), viewport: { width: 1440, height: 1000 }, tolerance: DENSITY_TOLERANCE, pages, bands: pageTypeBands(pages) };
  await mkdir(resolve(root, 'docs/research/raw'), { recursive: true });
  await writeJson(resolve(root, 'docs/research/raw/reference-density.json'), report);
  const variantsPath = resolve(root, 'src/data/template-variants.json');
  const variants = await readJson(variantsPath, null);
  // The words a picture-less run may hold, from the benchmark (the untyped pages, all when every one is typed).
  const untyped = pages.filter((page) => !page.pageType);
  const words = textRunWords(untyped.length ? untyped : pages, report.bands);
  if (variants?.components) await writeJson(variantsPath, { ...variants, components: { ...variants.components, textRunWords: words, densityBands: report.bands } });
  return report;
}

runMain(import.meta.url, async () => {
  const report = await measureReferenceDensity({ urls: process.argv.slice(2).filter((arg) => arg !== '--') });
  console.log(JSON.stringify({ pages: report.pages.map((page) => ({ url: page.url, pageType: page.pageType, ...page.metrics })), bands: report.bands }, null, 2));
}, { stack: true });
