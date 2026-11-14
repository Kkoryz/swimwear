#!/usr/bin/env node

// Style closeness of each generated photo of a model to the reference site's photos (CSD style embeddings,
// scripts/csd/csd_score.py): a photo below MIN_STYLE is sent back to generation like a review rejection. On site10 the
// competitor's photos scored 0.72 among themselves and 0.32 against another competitor's, our model photos 0.51 to
// 0.75 (owner 2026-10-28). Product-only photos are not scored: their plain backdrop and product type, not their
// photography, set their score. CSD runs locally on the CPU from SEO_CSD_HOME (venv/ with torch, torchvision and
// openai-clip; weights/pytorch_model.bin); without it the step says so and scores nothing. A photo is scored once per
// master (its sha256). Writes docs/research/images/style-score.json.
// Usage: node scripts/score-image-style.mjs

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { runMain } from './lib/cli.mjs';
import { SITE_STYLE } from './lib/image-style.mjs';
import { readJson, writeJson } from './lib/json-io.mjs';
import { PERSON_KINDS } from './lib/rules.mjs';

export const MIN_STYLE = 0.5;
const SCRIPT = fileURLToPath(new URL('./csd/csd_score.py', import.meta.url));

// The local CSD install, or why there is none.
export function csdInstall(home = process.env.SEO_CSD_HOME) {
  if (!home) return { missing: 'SEO_CSD_HOME is not set' };
  const python = [join(home, 'venv/Scripts/python.exe'), join(home, 'venv/bin/python')].find(existsSync);
  const weights = join(home, 'weights/pytorch_model.bin');
  if (!python) return { missing: `no venv python under ${home}` };
  if (!existsSync(weights)) return { missing: `no ${weights}` };
  return { python, weights };
}

// Runs csd_score.py on a request; returns its scores.
async function runCsd({ python, weights }, refs, images) {
  const dir = await mkdtemp(join(tmpdir(), 'csd-'));
  await writeFile(join(dir, 'request.json'), JSON.stringify({ weights, refs, images, k: 5 }));
  await promisify(execFile)(python, [SCRIPT, join(dir, 'request.json'), join(dir, 'reply.json')], { maxBuffer: 1 << 24 });
  return JSON.parse(await readFile(join(dir, 'reply.json'), 'utf8')).scores;
}

export async function scoreImageStyle({ root = process.cwd(), install = csdInstall(), score = runCsd } = {}) {
  if (install.missing) return { skipped: install.missing };
  const planPath = resolve(root, 'docs/research/image-plan.json');
  const plan = await readJson(planPath);
  const style = await readJson(resolve(root, 'docs/research/image-style.json'));
  const refs = style.kinds[SITE_STYLE].refs.map((path) => resolve(root, path));
  // A chart or board made as one of the reference's kinds is not a photograph: CSD put site10's design board at 0.28.
  const due = plan.entries.filter((entry) => entry.status === 'generated' && entry.master && !entry.productOnly && entry.imageShows !== 'chart' && PERSON_KINDS.includes(entry.kind) && entry.kind !== 'portrait' && entry.styleScore?.sha256 !== entry.sha256);
  const scores = due.length ? await score(install, refs, due.map((entry) => resolve(root, entry.master))) : [];
  const rejected = [];
  for (const [index, entry] of due.entries()) {
    const csd = Math.round(scores[index] * 1000) / 1000;
    entry.styleScore = { csd, sha256: entry.sha256 };
    // A photo an earlier library review accepted stays (the review is never undone by a later step).
    if (csd < MIN_STYLE && !entry.libraryReview?.passed) {
      Object.assign(entry, { status: 'rejected-review', reviewNote: `style ${csd} below ${MIN_STYLE}: unlike the reference site's photos (CSD)` });
      rejected.push({ id: entry.id, csd });
    }
  }
  await writeJson(planPath, plan);
  const all = plan.entries.filter((entry) => entry.styleScore).map((entry) => entry.styleScore.csd);
  const report = { schemaVersion: 'seo-site-style-score-v1', min: MIN_STYLE, scored: due.length, rejected, library: all.length ? { photos: all.length, lowest: Math.min(...all), mean: Math.round((all.reduce((sum, value) => sum + value, 0) / all.length) * 1000) / 1000 } : null };
  await writeJson(resolve(root, 'docs/research/images/style-score.json'), report);
  return report;
}

runMain(import.meta.url, async () => {
  const result = await scoreImageStyle();
  if (result.skipped) { console.log(`style score skipped: ${result.skipped}`); return; }
  console.log(`style scored ${result.scored}, sent back ${result.rejected.length}${result.library ? ` (library lowest ${result.library.lowest}, mean ${result.library.mean})` : ''}`);
  for (const item of result.rejected) console.log(`- ${item.id}: ${item.csd}`);
});
