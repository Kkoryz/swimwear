#!/usr/bin/env node

// Plans what each page section's photo shows from the page's own copy (lib/photo-briefs.mjs), for a trade whose image
// briefs say so (config/image-briefs*.json planFromCopy: every trade since 2026-11-17): one judgment per page
// (config/agent-steps/photo-briefs.md) over its copy and its photo positions. Writes src/data/photo-briefs.json; the
// readings are kept by the page's copy, positions and the instructions (docs/research/photo-briefs.json), so a page is
// read again only when one of them changes. A trade that does not plan from copy writes nothing (its photos come from
// its stock subjects and Site Factory's visuals, as before).
// Site Factory's own photo candidates of a section (its package with include_photos: sections[].visuals of type
// photo, kept by the import as the block's photoCandidates) are the section's briefs as they are; only the positions
// they leave are read here. A position whose library photo the image-fit judge found on its page's subject keeps it
// (owner 2026-11-17: no batch remakes), so a site already made plans only its other positions from its copy.
// Usage: node scripts/plan-photo-briefs.mjs [--concurrency 2]

import { createHash } from 'node:crypto';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cliArgs, runMain } from './lib/cli.mjs';
import { runJudge } from './lib/judge-exec.mjs';
import { readJson, writeJson } from './lib/json-io.mjs';
import { PHOTO_BRIEFS_SCHEMA, briefSlots, parseBriefs } from './lib/photo-briefs.mjs';
import { LIBRARY_PATH } from './lib/release-guard.mjs';
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
// A section whose earlier photo the text check refused (`refused`: the subjects held) is planned anew, never kept.
export function keptSections(prior, fresh, { text, slots, rules, refused = new Set() }) {
  if (!prior?.photos || !rules) return fresh;
  const [was, now] = [sectionLines(prior.text), sectionLines(text)];
  const kept = { ...fresh };
  for (const slot of slots) {
    const before = prior.photos[slot.blockId];
    if (before?.length !== slot.count) continue;
    if (before.some((brief) => refused.has(brief.content))) continue;
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

// The instructions with what the trade's photos show (its image briefs' photoScope and scopeRule: a service business's
// scenes of its work, a clothing manufacturer's products and factory; owner 2026-11-17, aloha: every site plans its
// photos from its copy before any is made). The readings are kept by these filled instructions, so a trade whose
// wording is unchanged keeps them.
export function scopedPrompt(template, briefs) {
  for (const field of ['photoScope', 'scopeRule']) if (typeof briefs[field] !== 'string' || !briefs[field].trim()) throw new Error(`config/image-briefs*.json of trade ${briefs.trade ?? 'apparel'} has no ${field}: the photo briefs need it`);
  return template.replaceAll('{{photoScope}}', briefs.photoScope).replaceAll('{{scopeRule}}', briefs.scopeRule);
}

// Site Factory's photo candidates for a page's positions (sections[].visuals of type photo, carried when Site Factory's
// package sets include_photos; the import keeps them as the block's photoCandidates, lib/sf-kinds.mjs): what Site
// Factory wrote for the section from its copy is the brief of the section's positions, in order, up to their number
// (owner 2026-11-17, via Site Factory). { blockId: [visual] }; the rest of a page's positions are planned here.
export function candidateBriefs(page, slots) {
  const blocks = new Map((page.blocks ?? []).map((block) => [block.id, block]));
  const taken = {};
  for (const slot of slots) {
    const candidates = (blocks.get(slot.blockId)?.photoCandidates ?? []).filter((visual) => visual?.type === 'photo' && typeof visual.content === 'string' && visual.content.trim());
    if (!candidates.length) continue;
    taken[slot.blockId] = candidates.slice(0, slot.count).map((visual, index) => ({ id: `sf-${slot.blockId}-${index + 1}`, type: 'photo', content: visual.content.trim(), ...(visual.setting ? { setting: String(visual.setting).trim() } : {}), ...(visual.caption ? { caption: String(visual.caption).trim() } : {}), source: 'site-factory', ...(visual.id ? { sfId: visual.id } : {}) }));
  }
  return taken;
}

// Site Factory's candidates no position takes (a text section, a card set: the template has no photo position there).
export function unusedCandidates(page, slots) {
  const counts = new Map(slots.map((slot) => [slot.blockId, slot.count]));
  return (page.blocks ?? []).flatMap((block) => (block.photoCandidates ?? []).slice(counts.get(block.id) ?? 0).map((visual) => ({ route: page.route, blockId: block.id, content: visual.content ?? '' })));
}

const norm = (text) => String(text ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
// The positions of a page that already show library photos the image-fit judge found on the page's subject
// (docs/research/image-fit.json, the last build): kept as they are, not planned from the copy (owner 2026-11-17: the
// aloha merge planned site13's 59 section positions from its copy; a site whose photos fit is not made again). A
// position is its block (data-block-id; else its heading), each of its photos a library photo that fits.
export function fittingPositions(imageFit, route, slots) {
  const images = (imageFit?.pages ?? []).find((page) => page.route === route)?.images ?? [];
  const fitting = new Set();
  for (const slot of slots) {
    const shown = images.filter((image) => (image.block ? image.block === slot.blockId : slot.heading && norm(image.section) === norm(slot.heading)));
    if (shown.length >= slot.count && shown.every((image) => image.fit === 'fits' && image.src.startsWith(`/${LIBRARY_PATH}/`))) fitting.add(slot.blockId);
  }
  return fitting;
}

export async function planPhotoBriefs({ root = process.cwd(), concurrency = 2, run = runJudge } = {}) {
  const briefs = await imageBriefs(root);
  if (!briefs.planFromCopy) {
    await rm(resolve(root, TARGET), { force: true });
    return { planned: false, read: 0, failures: [] };
  }
  const template = scopedPrompt(await readFile(PROMPT, 'utf8'), briefs);
  const rules = briefKey(template, briefs.siteKind);
  // The pages as written, without the briefs of an earlier run laid on them.
  const pages = await loadSitePages(root, { photoBriefs: false });
  const variants = await readJson(resolve(root, 'src/data/template-variants.json'));
  const slots = briefSlots(pages, variants.components);
  const cachePath = resolve(root, 'docs/research/photo-briefs.json');
  const previous = await readJson(cachePath, null);
  const imageFit = await readJson(resolve(root, 'docs/research/image-fit.json'), null);
  // The section photos already made (image-plan.json): a page whose briefs are all made keeps them when only the
  // instructions change (owner 2026-11-17: the service trade's photos now show what the work delivers; the pages
  // already made stay as they are, the next reading of a page follows the new instructions).
  const made = new Set(((await readJson(resolve(root, 'docs/research/image-plan.json'), null))?.entries ?? []).filter((entry) => ['generated', 'approved'].includes(entry.status) && entry.intent?.route).map((entry) => `${entry.intent.route}#${entry.intent.id}`));
  const allMade = (route, prior) => Object.values(prior?.photos ?? {}).flat().length > 0 && Object.values(prior.photos).flat().every((photo) => made.has(`${route}#${photo.id}`));
  const readings = {};
  const queue = [];
  const unused = [];
  // Photos this site's text check held before they were made (check-photo-text.mjs: a generic scene on a service site,
  // a subject the page does not name): the page is read again with them named as refused, and they stay in its record,
  // so the same answer is never taken from the reading's cache again (site11 2026-11-17: /revenue-management/'s closing
  // photo, a motel owner phoning in a courtyard, planned again word for word three runs in a row).
  const heldNow = new Map();
  const heldSubjects = new Set();
  for (const item of (await readJson(resolve(root, 'docs/research/images/text-check.json'), null))?.held ?? []) {
    heldSubjects.add(item.subject);
    for (const route of item.routes ?? []) (heldNow.get(route) ?? heldNow.set(route, []).get(route)).push(`${item.subject} (${(item.problems ?? []).map((problem) => (problem.detail ? `${problem.code}: ${problem.detail}` : problem.code)).join('; ') || 'held'})`);
  }
  for (const page of pages.filter((item) => slots[item.route])) {
    const all = slots[page.route];
    const prior = previous?.readings?.[page.route];
    const refused = [...new Set([...(prior?.refused ?? []), ...(heldNow.get(page.route) ?? [])])];
    // Positions a fitting photo keeps (none planned before for them), then Site Factory's candidates; the rest is
    // read here.
    const kept = fittingPositions(imageFit, page.route, all.filter((slot) => !prior?.photos?.[slot.blockId] && !(prior?.kept ?? []).includes(slot.blockId)));
    for (const blockId of prior?.kept ?? []) if (fittingPositions(imageFit, page.route, all.filter((slot) => slot.blockId === blockId)).has(blockId)) kept.add(blockId);
    const fromSf = candidateBriefs(page, all.filter((slot) => !kept.has(slot.blockId)));
    unused.push(...unusedCandidates(page, all.filter((slot) => !kept.has(slot.blockId))));
    const own = all.filter((slot) => !kept.has(slot.blockId)).map((slot) => ({ ...slot, count: slot.count - (fromSf[slot.blockId]?.length ?? 0) })).filter((slot) => slot.count > 0);
    const extra = { ...(kept.size ? { kept: [...kept].sort() } : {}), ...(Object.keys(fromSf).length ? { sf: fromSf } : {}), ...(refused.length ? { refused } : {}) };
    const text = pageText(page);
    const key = briefKey(text, own, rules, ...(Object.keys(extra).length ? [extra] : []));
    const ready = { key, text, positions: positions(own), ...extra };
    // A photo newly refused: the page is read again whatever else held (its copy and positions as before).
    if ((heldNow.get(page.route) ?? []).some((line) => !(prior?.refused ?? []).includes(line)) && own.length) queue.push({ page, key, text, own, extra });
    else if (prior?.key === key) readings[page.route] = prior;
    else if (!own.length) readings[page.route] = { ...ready, rules, photos: {} };
    else if (keepsReading(prior && { ...prior, rules: prior.rules ?? previous?.rules }, { text, slots: own, rules })) readings[page.route] = { ...prior, ...ready, rules };
    // Read under other instructions, its photos all made: kept, with the instructions it was read under.
    else if (keepsReading(prior && { ...prior, rules }, { text, slots: own, rules }) && allMade(page.route, prior)) readings[page.route] = { ...prior, ...ready, rules: prior.rules ?? previous?.rules };
    else queue.push({ page, key, text, own, extra });
  }
  await mkdir(resolve(root, 'docs/research/photo-briefs'), { recursive: true });
  const failures = [];
  let read = 0;
  const worker = async () => {
    for (let item = queue.shift(); item; item = queue.shift()) {
      const { page, key, text, own, extra } = item;
      const prompt = template
        .replaceAll('{{siteKind}}', briefs.siteKind)
        .replaceAll('{{label}}', page.hero?.heading ?? page.route)
        .replaceAll('{{route}}', page.route)
        .replaceAll('{{pageType}}', page.pageType)
        .replaceAll('{{status}}', page.status === 'placeholder' ? ' Its copy is not written yet: every heading marked [Placeholder] says what the section will hold, in the words of a template made for manufacturers. Read each as the nearest thing this business does and plan the photo from what this kind of section of this business\'s page shows.' : '')
        .replaceAll('{{text}}', pageText(page))
        .replaceAll('{{slots}}', own.map((slot) => `- ${slot.blockId}${slot.heading ? ` ("${slot.heading}")` : ''}: ${slot.count} photo${slot.count > 1 ? 's' : ''}`).join('\n'))
        // The photos planned before for this page that the site's text check refused (above): named so none comes back.
        + (extra.refused?.length ? `\n\nThese photos were planned for this page before and refused before they were made; plan none of them, nor one like them:\n${extra.refused.map((line) => `- ${line}`).join('\n')}\n` : '');
      const lastMessage = resolve(root, 'docs/research/photo-briefs', `${page.route.replace(/[^\w-]+/g, '_') || 'home'}.reply.txt`);
      const result = await run({ root, prompt, images: [], lastMessage, sandbox: 'read-only', lean: true, judge: true, label: `photo-briefs ${page.route}` });
      try {
        if (result.code !== 0) throw new Error(result.stderr.slice(-300));
        const photos = keptSections(previous?.readings?.[page.route], parseBriefs(await readFile(lastMessage, 'utf8'), own), { text, slots: own, rules: previous?.rules === rules ? rules : null, refused: heldSubjects });
        readings[page.route] = { key, text, positions: positions(own), ...extra, rules, photos };
        read += 1;
      } catch (error) { failures.push({ route: page.route, error: error.message }); }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  await writeJson(cachePath, { schemaVersion: PHOTO_BRIEFS_SCHEMA, rules, readings });
  // A page that failed has no briefs (its photos are its classes' until it is read): never an earlier copy's. Site
  // Factory's candidates of a section come before the photos planned here for it.
  const briefsOf = (reading) => { const out = {}; for (const [blockId, list] of [...Object.entries(reading.sf ?? {}), ...Object.entries(reading.photos ?? {})]) (out[blockId] ||= []).push(...list); return out; };
  await writeJson(resolve(root, TARGET), Object.fromEntries(Object.entries(readings).map(([route, reading]) => [route, briefsOf(reading)]).filter(([, photos]) => Object.keys(photos).length)));
  return { planned: true, read, failures, readings, unused, kept: Object.values(readings).reduce((sum, reading) => sum + (reading.kept?.length ?? 0), 0) };
}

runMain(import.meta.url, async () => {
  const { values } = cliArgs({ concurrency: { type: 'string' } });
  const result = await planPhotoBriefs({ concurrency: Number(values.concurrency ?? 2) });
  if (!result.planned) { console.log('the trade plans no photos from copy (config/image-briefs*.json planFromCopy)'); return; }
  for (const [route, reading] of Object.entries(result.readings)) for (const [block, photos] of [...Object.entries(reading.sf ?? {}), ...Object.entries(reading.photos)]) for (const photo of photos) console.log(`${route} ${block}${photo.source === 'site-factory' ? ' (Site Factory)' : ''}: ${photo.content}${photo.setting ? ` (${photo.setting})` : ''}`);
  console.log(JSON.stringify({ read: result.read, failures: result.failures.length, keptFitting: result.kept, unusedCandidates: result.unused.length }));
  for (const item of result.unused) console.log(`unused Site Factory photo candidate: ${item.route} ${item.blockId}: ${item.content} (no photo position there)`);
  for (const failure of result.failures) console.log(`failed: ${failure.route}: ${failure.error}`);
  if (result.failures.length) process.exitCode = 1;
});
