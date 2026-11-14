#!/usr/bin/env node

// Library review: numbers every generated photo on one contact sheet and has Codex look at the whole set, the way a
// person reviewing it would, for what pixel hashes cannot see: near-identical shots, the same person appearing
// again, a product colour other than the one planned, a factory scene. Flagged photos are sent back to generation
// (status "rejected-review" with the reason); the owner's approval (approve:images) stays the final review. A photo is
// reviewed once: one that passed (libraryReview) is shown for comparison but never sent back by a later review, so a
// run does not remake photos an earlier run accepted; of a look-alike group, the photos already accepted stay.
// Writes docs/research/images/library-review.json.
// Usage: node scripts/review-image-library.mjs [--dry-run]

import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runMain } from './lib/cli.mjs';
import { runJudge } from './lib/judge-exec.mjs';
import { fillTemplate } from './lib/image-prompt.mjs';
import { readJson, writeJson } from './lib/json-io.mjs';
import { imageBriefs } from './lib/trade.mjs';

// The trade's review wording (config/image-briefs*.json prompts, lib/trade.mjs).
const TILE = 256;
const COLUMNS = 6;

// Which photos to send back: in a look-alike or same-person group, every photo but one (a photo accepted earlier
// first, else the first); a photo accepted by an earlier review is never sent back.
export function reviewRejections(review, entries) {
  const byNumber = new Map(entries.map((entry, index) => [index + 1, entry]));
  const accepted = (number) => Boolean(byNumber.get(number)?.libraryReview?.passed);
  const rejected = new Map();
  const reject = (number, reason) => { const entry = byNumber.get(number); if (entry && !accepted(number) && !rejected.has(entry.id)) rejected.set(entry.id, reason); };
  const grouped = (photos = []) => { const keep = photos.find(accepted) ?? photos[0]; return { keep, others: photos.filter((number) => number !== keep) }; };
  for (const group of review.lookAlike || []) { const { keep, others } = grouped(group.photos); for (const number of others) reject(number, `looks like photo ${keep}: ${group.reason ?? ''}`.trim()); }
  for (const group of review.samePerson || []) { const { keep, others } = grouped(group.photos); for (const number of others) reject(number, `same person as photo ${keep}`); }
  for (const item of review.wrongColour || []) reject(item.photo, `main colour is not ${byNumber.get(item.photo)?.colour}: ${item.seen ?? ''}`.trim());
  for (const number of review.factoryScene || []) reject(number, 'staged in a factory, workshop or warehouse');
  for (const item of review.weakSubject || []) reject(item.photo, `does not show its subject: ${item.seen ?? ''}`.trim());
  return rejected;
}

export async function reviewLibrary({ root = process.cwd(), dryRun = false } = {}) {
  const { default: sharp } = await import('sharp');
  const planPath = resolve(root, 'docs/research/image-plan.json');
  const plan = await readJson(planPath);
  const entries = plan.entries.filter((entry) => entry.status === 'generated' && entry.master);
  if (entries.length < 2) return { reviewed: entries.length, rejected: [] };
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
  const { prompts, photos } = await imageBriefs(root);
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
  const run = await runJudge({ root, prompt, images: [sheet], lastMessage, sandbox: 'read-only', lean: true, judge: true, label: 'library review' });
  if (run.code !== 0) throw new Error(`codex exit ${run.code}: ${run.stderr.trim().slice(-300)}`);
  const line = (await readFile(lastMessage, 'utf8')).trim().split('\n').reverse().find((text) => text.trim().startsWith('{'));
  if (!line) throw new Error('the review reply has no JSON line');
  const review = JSON.parse(line);
  const rejected = reviewRejections(review, entries);
  if (!dryRun) {
    const at = new Date().toISOString();
    for (const entry of entries) {
      if (rejected.has(entry.id)) Object.assign(entry, { status: 'rejected-review', reviewNote: rejected.get(entry.id) });
      else if (!entry.libraryReview?.passed) entry.libraryReview = { passed: true, at };
    }
    await writeJson(planPath, plan);
  }
  const report = { schemaVersion: 'seo-site-library-review-v1', reviewedAt: new Date().toISOString(), photos: entries.map((entry, index) => ({ number: index + 1, id: entry.id })), review, rejected: [...rejected].map(([id, reason]) => ({ id, reason })) };
  await writeJson(resolve(root, 'docs/research/images/library-review.json'), report);
  return { reviewed: entries.length, rejected: report.rejected };
}

runMain(import.meta.url, async () => {
  const result = await reviewLibrary({ dryRun: process.argv.includes('--dry-run') });
  console.log(`reviewed ${result.reviewed}, sent back ${result.rejected.length}`);
  for (const item of result.rejected) console.log(`- ${item.id}: ${item.reason}`);
});
