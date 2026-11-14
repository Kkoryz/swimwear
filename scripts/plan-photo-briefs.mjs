#!/usr/bin/env node

// Plans what each page section's photo shows from the page's own copy (lib/photo-briefs.mjs), for a trade whose image
// briefs say so (config/image-briefs*.json planFromCopy; a service business): one judgment per page
// (config/agent-steps/photo-briefs.md) over its copy and its photo positions. Writes src/data/photo-briefs.json; the
// readings are kept by the page's copy, positions and the instructions (docs/research/photo-briefs.json), so a page is
// read again only when one of them changes. A trade that does not plan from copy writes nothing (its photos come from
// its stock subjects and Site Factory's visuals, as before).
// Usage: node scripts/plan-photo-briefs.mjs [--concurrency 2]

import { createHash } from 'node:crypto';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cliArgs, runMain } from './lib/cli.mjs';
import { runJudge } from './lib/judge-exec.mjs';
import { readJson, writeJson } from './lib/json-io.mjs';
import { PHOTO_BRIEFS_SCHEMA, briefSlots, parseBriefs } from './lib/photo-briefs.mjs';
import { loadSitePages, pageCopy } from './lib/site-pages.mjs';
import { imageBriefs } from './lib/trade.mjs';

const PROMPT = fileURLToPath(new URL('../config/agent-steps/photo-briefs.md', import.meta.url));
const TARGET = 'src/data/photo-briefs.json';
// A page's reading is kept while its copy, its photo positions and the instructions are the same.
const briefKey = (...parts) => createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 16);

// A small edit keeps a page's reading (Site Factory deleting a repeated sentence must not plan, and remake, its photos
// again): the same photo positions (each section's count) and most of its words the same. A reading recorded before
// the text was kept is held to its positions alone.
const KEEP_SIMILARITY = 0.85;
const wordSet = (text) => new Set(text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);
export function similarText(left, right) {
  const [a, b] = [wordSet(left), wordSet(right)];
  const shared = [...a].filter((word) => b.has(word)).length;
  return shared / Math.max(1, new Set([...a, ...b]).size);
}
const positions = (slots) => JSON.stringify(slots.map((slot) => [slot.blockId, slot.count]).sort());
const readPositions = (photos) => JSON.stringify(Object.entries(photos ?? {}).map(([blockId, list]) => [blockId, list.length]).sort());
export function keepsReading(prior, { text, slots, rules }) {
  if (!prior || prior.rules !== rules) return false;
  if (positions(slots) !== (prior.positions ?? readPositions(prior.photos))) return false;
  return prior.text ? similarText(prior.text, text) >= KEEP_SIMILARITY : true;
}

// A page read again (a photo position added or gone, its copy rewritten) keeps the photos of its sections that are the
// same: the same positions and, where the earlier text was kept, most of the section's words the same, so the photos
// already made for them are not made again (the hotel site's split rows gaining a photo had 25 made photos queued
// again with their pages' other sections read anew).
const sectionLines = (text = '') => new Map(text.split('\n').map((line) => /^\[([^\]]+)\] (.*)$/s.exec(line)).filter(Boolean).map((match) => [match[1], match[2]]));
export function keptSections(prior, fresh, { text, slots, rules }) {
  if (!prior?.photos || !rules) return fresh;
  const [was, now] = [sectionLines(prior.text), sectionLines(text)];
  const kept = { ...fresh };
  for (const slot of slots) {
    const before = prior.photos[slot.blockId];
    if (before?.length !== slot.count) continue;
    if (prior.text && (!was.has(slot.blockId) || similarText(was.get(slot.blockId), now.get(slot.blockId) ?? '') < KEEP_SIMILARITY)) continue;
    kept[slot.blockId] = before;
  }
  return kept;
}

// A page's copy for the judge: each section's heading and text, in order.
export function pageText(page) {
  const hero = [page.hero?.heading, ...(page.hero?.lead ?? [])].filter(Boolean).join(' ');
  const sections = (page.blocks ?? []).map((block) => `[${block.id}] ${pageCopy({ blocks: [block] }).join(' ').slice(0, 1200)}`);
  return [`[hero] ${hero}`, ...sections].join('\n');
}

export async function planPhotoBriefs({ root = process.cwd(), concurrency = 2, run = runJudge } = {}) {
  const briefs = await imageBriefs(root);
  if (!briefs.planFromCopy) {
    await rm(resolve(root, TARGET), { force: true });
    return { planned: false, read: 0, failures: [] };
  }
  const template = await readFile(PROMPT, 'utf8');
  const rules = briefKey(template, briefs.siteKind);
  // The pages as written, without the briefs of an earlier run laid on them.
  const pages = await loadSitePages(root, { photoBriefs: false });
  const variants = await readJson(resolve(root, 'src/data/template-variants.json'));
  const slots = briefSlots(pages, variants.components);
  const cachePath = resolve(root, 'docs/research/photo-briefs.json');
  const previous = await readJson(cachePath, null);
  const readings = {};
  const queue = [];
  for (const page of pages.filter((item) => slots[item.route])) {
    const text = pageText(page);
    const key = briefKey(text, slots[page.route], rules);
    const prior = previous?.readings?.[page.route];
    if (prior?.key === key) readings[page.route] = prior;
    else if (keepsReading(prior && { ...prior, rules: prior.rules ?? previous?.rules }, { text, slots: slots[page.route], rules })) readings[page.route] = { ...prior, key, text, positions: positions(slots[page.route]), rules };
    else queue.push({ page, key, text });
  }
  await mkdir(resolve(root, 'docs/research/photo-briefs'), { recursive: true });
  const failures = [];
  let read = 0;
  const worker = async () => {
    for (let item = queue.shift(); item; item = queue.shift()) {
      const { page, key, text } = item;
      const own = slots[page.route];
      const prompt = template
        .replaceAll('{{siteKind}}', briefs.siteKind)
        .replaceAll('{{label}}', page.hero?.heading ?? page.route)
        .replaceAll('{{route}}', page.route)
        .replaceAll('{{pageType}}', page.pageType)
        .replaceAll('{{status}}', page.status === 'placeholder' ? ' Its copy is not written yet: every heading marked [Placeholder] says what the section will hold, in the words of a template made for manufacturers. Read each as the nearest thing this business does and plan the photo from what this kind of section of this business\'s page shows.' : '')
        .replaceAll('{{text}}', pageText(page))
        .replaceAll('{{slots}}', own.map((slot) => `- ${slot.blockId}${slot.heading ? ` ("${slot.heading}")` : ''}: ${slot.count} photo${slot.count > 1 ? 's' : ''}`).join('\n'));
      const lastMessage = resolve(root, 'docs/research/photo-briefs', `${page.route.replace(/[^\w-]+/g, '_') || 'home'}.reply.txt`);
      const result = await run({ root, prompt, images: [], lastMessage, sandbox: 'read-only', lean: true, judge: true, label: `photo-briefs ${page.route}` });
      try {
        if (result.code !== 0) throw new Error(result.stderr.slice(-300));
        const photos = keptSections(previous?.readings?.[page.route], parseBriefs(await readFile(lastMessage, 'utf8'), own), { text, slots: own, rules: previous?.rules === rules ? rules : null });
        readings[page.route] = { key, text, positions: positions(own), rules, photos };
        read += 1;
      } catch (error) { failures.push({ route: page.route, error: error.message }); }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  await writeJson(cachePath, { schemaVersion: PHOTO_BRIEFS_SCHEMA, rules, readings });
  // A page that failed has no briefs (its photos are its classes' until it is read): never an earlier copy's.
  await writeJson(resolve(root, TARGET), Object.fromEntries(Object.entries(readings).map(([route, reading]) => [route, reading.photos])));
  return { planned: true, read, failures, readings };
}

runMain(import.meta.url, async () => {
  const { values } = cliArgs({ concurrency: { type: 'string' } });
  const result = await planPhotoBriefs({ concurrency: Number(values.concurrency ?? 2) });
  if (!result.planned) { console.log('the trade plans no photos from copy (config/image-briefs*.json planFromCopy)'); return; }
  for (const [route, reading] of Object.entries(result.readings)) for (const [block, photos] of Object.entries(reading.photos)) for (const photo of photos) console.log(`${route} ${block}: ${photo.content}${photo.setting ? ` (${photo.setting})` : ''}`);
  console.log(JSON.stringify({ read: result.read, failures: result.failures.length }));
  for (const failure of result.failures) console.log(`failed: ${failure.route}: ${failure.error}`);
  if (result.failures.length) process.exitCode = 1;
});
