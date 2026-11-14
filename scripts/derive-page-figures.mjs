#!/usr/bin/env node

// Writes src/data/page-figures.json: the figures the band under each page's hero shows (lib/page-figures.mjs), route ->
// [{ value, label }]. One judgment per page (config/agent-steps/page-figures.md); readings are kept by the page's text
// and the instructions (docs/research/page-figures.json), so a page is read again only when either changes. The home
// and about pages keep the site-wide band and the legal pages have none: they are not read.
// Usage: node scripts/derive-page-figures.mjs [--concurrency 2]

import { createHash } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cliArgs, runMain } from './lib/cli.mjs';
import { runJudge } from './lib/judge-exec.mjs';
import { readJson, writeJson } from './lib/json-io.mjs';
import { NO_BAND_PAGE_TYPES, PAGE_FIGURES_SCHEMA, SITE_BAND_PAGE_TYPES, normalizeText, pageText, parseFigures, pickFigures } from './lib/page-figures.mjs';

const PROMPT = fileURLToPath(new URL('../config/agent-steps/page-figures.md', import.meta.url));
const hash = (text) => createHash('sha256').update(text).digest('hex').slice(0, 16);

export async function derivePageFigures({ root = process.cwd(), concurrency = 2, run = runJudge } = {}) {
  const template = await readFile(PROMPT, 'utf8');
  const rules = hash(template);
  const pages = [...await readJson(resolve(root, 'src/data/authoring-pages.json'), []), ...await readJson(resolve(root, 'src/data/placeholder-pages.json'), [])];
  const texts = new Map(pages.map((page) => [page.route, pageText(page)]));
  const siteTexts = [...texts.values()].map(normalizeText);
  const cachePath = resolve(root, 'docs/research/page-figures.json');
  const previous = await readJson(cachePath, null);
  const readings = previous?.rules === rules ? { ...previous.readings } : {};
  const banded = pages.filter((page) => !SITE_BAND_PAGE_TYPES.includes(page.pageType) && !NO_BAND_PAGE_TYPES.includes(page.pageType));
  const queue = banded.filter((page) => readings[page.route]?.text !== hash(texts.get(page.route)));
  await mkdir(resolve(root, 'docs/research/page-figures'), { recursive: true });
  const failures = [];
  let read = 0;
  const worker = async () => {
    for (let page = queue.shift(); page; page = queue.shift()) {
      const text = texts.get(page.route);
      const prompt = template.replace('{{route}}', page.route).replace('{{text}}', text);
      const lastMessage = resolve(root, 'docs/research/page-figures', `${page.route.replace(/[^\w-]+/g, '_') || 'home'}.reply.txt`);
      const result = await run({ root, prompt, images: [], lastMessage, sandbox: 'read-only', lean: true, judge: true, label: `page-figures ${page.route}` });
      try {
        if (result.code !== 0) throw new Error(result.stderr.slice(-300));
        readings[page.route] = { text: hash(text), figures: parseFigures(await readFile(lastMessage, 'utf8')) };
        read += 1;
      } catch (error) { failures.push({ route: page.route, error: error.message }); }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  // The bands are picked again every run: whether a figure is common depends on all the pages.
  const figures = Object.fromEntries(banded.filter((page) => readings[page.route]).map((page) => [page.route, pickFigures(readings[page.route].figures, texts.get(page.route), siteTexts)]));
  await writeJson(cachePath, { schemaVersion: PAGE_FIGURES_SCHEMA, rules, readings });
  await writeJson(resolve(root, 'src/data/page-figures.json'), figures);
  return { read, failures, figures };
}

runMain(import.meta.url, async () => {
  const { values } = cliArgs({ concurrency: { type: 'string' } });
  const result = await derivePageFigures({ concurrency: Number(values.concurrency ?? 2) });
  for (const [route, list] of Object.entries(result.figures)) console.log(`${route}: ${list.map((figure) => `${figure.value} (${figure.label})`).join(' · ') || 'no band'}`);
  console.log(JSON.stringify({ read: result.read, failures: result.failures.length }));
  for (const failure of result.failures) console.log(`failed: ${failure.route}: ${failure.error}`);
  if (result.failures.length) process.exitCode = 1;
});
