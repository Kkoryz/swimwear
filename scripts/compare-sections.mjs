#!/usr/bin/env node

// Section-by-section review sheet: each reference section crop (docs/research/pattern-sections) beside the
// candidate block built from it (placeholder blocks keep the reference index in their id: s<index>).
// Usage: node scripts/compare-sections.mjs <candidate-base-url> [--width 1440]

import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { cliArgs, runMain, usage } from './lib/cli.mjs';
import { scrollThroughPage } from './lib/reveal.mjs';
import { readJson } from './lib/json-io.mjs';

export async function compareSections({ baseUrl, root = process.cwd(), width = 1440 }) {
  const inventory = await readJson(resolve(root, 'docs/research/pattern-inventory.json'));
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  const outDir = resolve(root, 'docs/design-references/section-comparisons');
  await mkdir(outDir, { recursive: true });
  const sheets = [];
  try {
    for (const entry of inventory.pages.filter((page) => page.route)) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      await page.goto(new URL(entry.route, baseUrl).href, { waitUntil: 'networkidle' });
      await scrollThroughPage(page);
      const rows = [];
      for (const section of entry.sections) {
        const reference = section.crop ? (await readFile(resolve(root, section.crop)).catch(() => null)) : null;
        const selector = section.pattern.startsWith('hero-') ? '[data-authoring-block="hero"]' : `[data-block-id="s${section.index}"], [data-block-id="s${section.index}-gallery"]`;
        const candidates = await page.$$(selector);
        const shots = [];
        for (const handle of candidates) shots.push(await handle.screenshot({ animations: 'disabled' }).catch(() => null));
        rows.push({ index: section.index, pattern: section.pattern, decision: section.decision, reference: reference?.toString('base64'), candidate: shots.filter(Boolean).map((shot) => shot.toString('base64')) });
      }
      await page.close();
      const html = `<body style="margin:0;padding:16px;font:14px Arial;background:#fff">
        <h1 style="font-size:20px;margin:0 0 12px">${entry.pageType}: reference ${entry.reference} → candidate ${entry.route} · coverage ${entry.coverage}%</h1>
        ${rows.map((row) => `<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start;border-top:2px solid #ddd;padding:10px 0">
          <div><b>REF #${row.index} · ${row.pattern}</b>${row.reference ? `<img style="display:block;width:100%;margin-top:6px;border:1px solid #ccc" src="data:image/png;base64,${row.reference}">` : ''}</div>
          <div><b>OURS · ${row.decision}</b>${row.candidate.map((shot) => `<img style="display:block;width:100%;margin-top:6px;border:1px solid #ccc" src="data:image/png;base64,${shot}">`).join('') || '<p>(skipped)</p>'}</div>
        </div>`).join('')}</body>`;
      const sheet = await browser.newPage({ viewport: { width: 1600, height: 900 } });
      await sheet.setContent(html, { waitUntil: 'load' });
      const path = resolve(outDir, `${entry.pageType}.png`);
      await sheet.screenshot({ path, fullPage: true });
      await sheet.close();
      sheets.push({ pageType: entry.pageType, path, sections: rows.length, unmatched: rows.filter((row) => !row.candidate.length && !row.decision.startsWith('skip')).map((row) => row.index) });
    }
  } finally {
    await browser.close();
  }
  return sheets;
}

runMain(import.meta.url, async () => {
  const baseUrl = cliArgs().positionals.find((arg) => /^https?:/.test(arg));
  if (!baseUrl) return usage('Usage: node scripts/compare-sections.mjs <candidate-base-url>');
  console.log(JSON.stringify(await compareSections({ baseUrl }), null, 2));
}, { stack: true });
