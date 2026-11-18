#!/usr/bin/env node

// Library review: numbers every generated photo on one contact sheet and has Codex look at the whole set, the way a
// person reviewing it would, for what pixel hashes cannot see: near-identical shots, the same person appearing
// again, a product colour other than the one planned, a factory scene. Flagged photos are reported, not remade: they
// stay in use, with the reason in libraryReview.flagged and library-review.json (owner 2026-11-18, images never hold a
// run: site13's review sent back 26 photos and the run spent half an hour making them again). --send-back sends them
// back to generation (status "rejected-review" with the reason), when they are to be made again; the owner's approval
// (approve:images) stays the final review. A photo is
// reviewed once: one that passed (libraryReview) is shown for comparison but never sent back by a later review, so a
// run does not remake photos an earlier run accepted; of a look-alike group, the photos already accepted stay.
// A library whose every photo passed an earlier review has nothing a review could send back: no model is asked. The
// same sheet with the same instructions is never judged twice (lib/agent-cache.mjs keptJudgment: the reply is kept by
// the prompt and the sheet's bytes; owner 2026-11-17, site13's 40-minute run judged its 67 unchanged photos again).
// Writes docs/research/images/library-review.json.
// Usage: node scripts/review-image-library.mjs [--dry-run] [--send-back]

import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runMain } from './lib/cli.mjs';
import { keptJudgment } from './lib/agent-cache.mjs';
import { runJudge } from './lib/judge-exec.mjs';
import { fillTemplate } from './lib/image-prompt.mjs';
import { readJson, writeJson } from './lib/json-io.mjs';
import { imageBriefs } from './lib/trade.mjs';

// The trade's review wording (config/image-briefs*.json prompts, lib/trade.mjs).
const TILE = 256;
const COLUMNS = 6;

// Which photos to send back: in a look-alike or same-person group, every photo but one (a photo accepted earlier
// first, else the first); a photo accepted by an earlier review is never sent back.
// A photo planned in the factory: a factory stand-in (briefs.placeholderKinds) or a section's photo asked for there
// (its intent names the work or the place); a section's photo that shows no garment worn has no planned colour.
const FACTORY_WORDS = /\b(factory|workshop|sewing|cutting|printing|print room|press|warehouse|inspection|inspector|production|packing|pattern|sample room|studio|mill|dye)\b/i;
const WORN_WORDS = /\b(wears?|wearing|worn|model|models)\b/i;
const intentText = (entry) => `${entry?.intent?.content ?? ''} ${entry?.intent?.setting ?? ''}`;
export const plannedInFactory = (entry, placeholderKinds = []) => placeholderKinds.includes(entry?.kind) || (Boolean(entry?.intent) && FACTORY_WORDS.test(intentText(entry)));
export const colourPlanned = (entry) => !entry?.intent || WORN_WORDS.test(intentText(entry));

// Look-alikes are sent back only where a visitor sees them together, on one page, and the same model never is (owner
// 2026-11-17: "同一个模特更没关系 如果不是在一个页面像也没事"). pagesOf(entry): the routes a photo shows on, from the
// built site (image-fit.json); without it every look-alike shares a page.
export function reviewRejections(review, entries, { placeholderKinds = [], pagesOf = null } = {}) {
  const byNumber = new Map(entries.map((entry, index) => [index + 1, entry]));
  const accepted = (number) => Boolean(byNumber.get(number)?.libraryReview?.passed);
  const rejected = new Map();
  const reject = (number, reason) => { const entry = byNumber.get(number); if (entry && !accepted(number) && !rejected.has(entry.id)) rejected.set(entry.id, reason); };
  const grouped = (photos = []) => { const keep = photos.find(accepted) ?? photos[0]; return { keep, others: photos.filter((number) => number !== keep) }; };
  const together = (a, b) => { if (!pagesOf) return true; const [x, y] = [pagesOf(byNumber.get(a)), pagesOf(byNumber.get(b))]; return [...x].some((route) => y.has(route)); };
  for (const group of review.lookAlike || []) { const { keep, others } = grouped(group.photos); for (const number of others) if (together(keep, number)) reject(number, `looks like photo ${keep} on the same page: ${group.reason ?? ''}`.trim()); }
  for (const item of review.wrongColour || []) if (colourPlanned(byNumber.get(item.photo))) reject(item.photo, `main colour is not ${byNumber.get(item.photo)?.colour}: ${item.seen ?? ''}`.trim());
  for (const number of review.factoryScene || []) if (!plannedInFactory(byNumber.get(number), placeholderKinds)) reject(number, 'staged in a factory, workshop or warehouse');
  for (const item of review.weakSubject || []) reject(item.photo, `does not show its subject: ${item.seen ?? ''}`.trim());
  return rejected;
}

export async function reviewLibrary({ root = process.cwd(), dryRun = false, sendBack = false, judge = runJudge } = {}) {
  const { default: sharp } = await import('sharp');
  const planPath = resolve(root, 'docs/research/image-plan.json');
  const plan = await readJson(planPath);
  const entries = plan.entries.filter((entry) => entry.status === 'generated' && entry.master);
  if (entries.length < 2) return { reviewed: entries.length, rejected: [] };
  // A photo accepted by an earlier review is never sent back (reviewRejections): with none new, nothing can be.
  if (entries.every((entry) => entry.libraryReview?.passed)) return { reviewed: 0, rejected: [], unchanged: entries.length };
  const layers = [];
  for (const [index, entry] of entries.entries()) {
    const left = (index % COLUMNS) * TILE;
    const top = Math.floor(index / COLUMNS) * TILE;
    layers.push({ input: await sharp(resolve(root, entry.master)).resize(TILE, TILE, { fit: 'cover' }).toBuffer(), left, top });
    layers.push({ input: Buffer.from(`<svg width="44" height="30"><rect width="44" height="30" fill="#000"/><text x="6" y="22" font-family="Arial" font-size="20" fill="#fff">${index + 1}</text></svg>`), left, top });
  }
  const sheet = resolve(root, 'docs/research/images/library-sheet.png');
  await mkdir(resolve(root, 'docs/research/images'), { recursive: true });
  await sharp({ create: { width: COLUMNS * TILE, height: Math.ceil(entries.length / COLUMNS) * TILE, channels: 3, background: '#fff' } }).composite(layers).png().toFile(sheet);
  const { prompts, photos, placeholderKinds = [] } = await imageBriefs(root);
  // A trade whose photos are scenes (briefs.photos) is held to what each photo is planned to show.
  const shows = (entry) => (photos === 'scenes' ? `, planned to show: ${entry.intent?.content ?? entry.subject}` : '');
  const planned = entries.map((entry, index) => `${index + 1}: ${entry.kind} of ${entry.category}, ${fillTemplate(prompts.reviewPlanned, { colour: entry.colour ?? 'any' })}${/colourways/.test(entry.subject) || entry.productOnly ? ' (other colourways beside it are planned)' : ''}${entry.casting ? `, model ${entry.casting}` : ''}${shows(entry)}`).join('\n');
  const prompt = [
    `The attached contact sheet shows the ${entries.length} photographs of one website's image library, each numbered in its top-left corner.`,
    'Review the set as a photo editor would. Do not generate or edit any image and do not change any file.',
    prompts.reviewCriteria,
    'Planned colour and model per photo:',
    planned,
    'Reply with only this JSON on one line: {"lookAlike":[{"photos":[n,n],"reason":"..."}],"samePerson":[{"photos":[n,n]}],"wrongColour":[{"photo":n,"seen":"..."}],"factoryScene":[n],"weakSubject":[{"photo":n,"seen":"..."}]}',
  ].join('\n');
  const lastMessage = resolve(root, 'docs/research/images/library-review.reply.txt');
  // A judgment: it runs in the judge homes (lib/codex-exec.mjs), never the owner's, whose use the photos need.
  const jsonLine = (reply) => reply.trim().split('\n').reverse().find((text) => text.trim().startsWith('{'));
  const run = await keptJudgment(root, { prompt, images: [sheet] }, async () => {
    const asked = await judge({ root, prompt, images: [sheet], lastMessage, sandbox: 'read-only', lean: true, judge: true, label: 'library review' });
    return { ...asked, reply: asked.code === 0 ? await readFile(lastMessage, 'utf8').catch(() => '') : '' };
  }, { accept: (reply) => Boolean(jsonLine(reply)) });
  if (run.code !== 0) throw new Error(`codex exit ${run.code}: ${String(run.stderr ?? '').trim().slice(-300)}`);
  const line = jsonLine(run.reply);
  if (!line) throw new Error('the review reply has no JSON line');
  const review = JSON.parse(line);
  // The pages each photo shows on, as the built site placed it (judge-image-fit.mjs's record).
  const fit = await readJson(resolve(root, 'docs/research/image-fit.json'), null);
  const pagesOf = fit?.pages ? (entry) => new Set(fit.pages.filter((page) => (page.images ?? []).some((image) => String(image.src).includes(`/${entry?.id}-`))).map((page) => page.route)) : null;
  const rejected = reviewRejections(review, entries, { placeholderKinds, pagesOf });
  if (!dryRun) {
    const at = new Date().toISOString();
    for (const entry of entries) {
      if (rejected.has(entry.id) && sendBack) Object.assign(entry, { status: 'rejected-review', reviewNote: rejected.get(entry.id) });
      else if (rejected.has(entry.id)) entry.libraryReview = { passed: false, flagged: rejected.get(entry.id), at };
      else if (!entry.libraryReview?.passed) entry.libraryReview = { passed: true, at };
    }
    await writeJson(planPath, plan);
  }
  const report = { schemaVersion: 'seo-site-library-review-v1', reviewedAt: new Date().toISOString(), photos: entries.map((entry, index) => ({ number: index + 1, id: entry.id })), review, sentBack: sendBack, rejected: [...rejected].map(([id, reason]) => ({ id, reason })) };
  await writeJson(resolve(root, 'docs/research/images/library-review.json'), report);
  return { reviewed: entries.length, rejected: report.rejected, sentBack: sendBack };
}

// The last review's verdict (library-review.json) applied again under the rules as they are now: a photo it sent back
// that the rules keep now (the rules changed after it: aloha 2026-11-17, the factory and colour checks, then the owner's
// "同一个模特更没关系 如果不是在一个页面像也没事") is the library's again, with its photo as made; each is recorded
// (library-review-reapplied.json) with the reason it was sent back. Returns { restored: [{ id, wasSentBackFor }] }.
export function reappliedReview(plan, record, { placeholderKinds = [], pagesOf = null, at = new Date().toISOString() } = {}) {
  const byId = new Map(plan.entries.map((entry) => [entry.id, entry]));
  const entries = record.photos.map((photo) => byId.get(photo.id) ?? { id: photo.id });
  // The verdict as made: none of its photos counts as accepted by itself.
  const kept = reviewRejections(record.review, entries.map((entry) => ({ ...entry, libraryReview: entry.libraryReview?.reviewedAt === record.reviewedAt ? undefined : entry.libraryReview })), { placeholderKinds, pagesOf });
  const restored = [];
  for (const { id, reason } of record.rejected ?? []) {
    const entry = byId.get(id);
    if (!entry || entry.status !== 'rejected-review' || kept.has(id)) continue;
    entry.status = 'generated';
    delete entry.reviewNote;
    entry.libraryReview = { passed: true, at, reapplied: record.reviewedAt, wasSentBackFor: reason };
    restored.push({ id, wasSentBackFor: reason });
  }
  return { restored };
}

runMain(import.meta.url, async () => {
  if (process.argv.includes('--reapply')) {
    const root = process.cwd();
    const planPath = resolve(root, 'docs/research/image-plan.json');
    const plan = await readJson(planPath);
    const record = await readJson(resolve(root, 'docs/research/images/library-review.json'));
    const { placeholderKinds = [] } = await imageBriefs(root);
    const fit = await readJson(resolve(root, 'docs/research/image-fit.json'), null);
    const pagesOf = fit?.pages ? (entry) => new Set(fit.pages.filter((page) => (page.images ?? []).some((image) => String(image.src).includes(`/${entry?.id}-`))).map((page) => page.route)) : null;
    const { restored } = reappliedReview(plan, record, { placeholderKinds, pagesOf });
    if (restored.length) {
      await writeJson(planPath, plan);
      const logPath = resolve(root, 'docs/research/images/library-review-reapplied.json');
      const log = await readJson(logPath, { schemaVersion: 'seo-site-library-review-reapplied-v1', runs: [] });
      log.runs.push({ at: new Date().toISOString(), review: record.reviewedAt, restored });
      await writeJson(logPath, log);
    }
    console.log(`the review of ${record.reviewedAt} under today's rules: ${restored.length} photo(s) it sent back are kept`);
    for (const item of restored) console.log(`- ${item.id} (was: ${item.wasSentBackFor})`);
    return;
  }
  const result = await reviewLibrary({ dryRun: process.argv.includes('--dry-run'), sendBack: process.argv.includes('--send-back') });
  console.log(result.unchanged ? `every one of ${result.unchanged} photos passed an earlier review: nothing to review` : result.sentBack ? `reviewed ${result.reviewed}, sent back ${result.rejected.length}` : `reviewed ${result.reviewed}, flagged ${result.rejected.length} (kept in use and reported; --send-back makes them again)`);
  for (const item of result.rejected) console.log(`- ${item.id}: ${item.reason}`);
});
