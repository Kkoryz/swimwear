#!/usr/bin/env node

// Image library diversity gate: embeds every generated photo with DINOv2 (small, quantised, on the CPU; the model is
// cached in ~/.cache/seo-site-template/models), sends look-alikes back to generation (they get the next colour,
// model, pose and camera) and compares the library's Vendi Score per photo with the reference site's own photo library
// (docs/research/image-style.json). A library less diverse than 0.9 x the reference is reported (with its most
// redundant photos) for the owner to judge from the contact sheet; only look-alikes are sent back. Writes
// docs/research/images/diversity.json.
// Usage: node scripts/check-image-diversity.mjs [--dry-run]

import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { runMain } from './lib/cli.mjs';
import { LOOK_ALIKE_COSINE, REFERENCE_DIVERSITY_SHARE, lookAlikes, mostRedundant, normalise, vendiScore } from './lib/image-diversity.mjs';
import { readJson, writeJson } from './lib/json-io.mjs';

export async function checkImageDiversity({ root = process.cwd(), dryRun = false } = {}) {
  const { env, pipeline } = await import('@huggingface/transformers');
  env.cacheDir = join(homedir(), '.cache', 'seo-site-template', 'models');
  const extractor = await pipeline('image-feature-extraction', 'Xenova/dinov2-small', { dtype: 'q8' });
  const planPath = resolve(root, 'docs/research/image-plan.json');
  const plan = await readJson(planPath);
  const entries = plan.entries.filter((entry) => ['generated', 'approved'].includes(entry.status) && entry.master);
  // The class token (first of the sequence) is the whole-image embedding.
  const embed = async (path) => { const output = await extractor(path); return normalise(Array.from(output.data.slice(0, output.dims.at(-1)))); };
  const photos = [];
  for (const entry of entries) photos.push({ id: entry.id, vector: await embed(resolve(root, entry.master)) });
  const style = await readJson(resolve(root, 'docs/research/image-style.json'), null);
  const references = [];
  for (const path of style?.kinds?.site?.refs ?? []) references.push(await embed(path).catch(() => null));
  const referenceShare = references.filter(Boolean).length ? vendiScore(references.filter(Boolean)) / references.filter(Boolean).length : null;
  const minVendi = referenceShare === null ? 0 : REFERENCE_DIVERSITY_SHARE * referenceShare * photos.length;
  const pairs = lookAlikes(photos);
  const vendi = vendiScore(photos.map((photo) => photo.vector));
  // Less diverse than the reference: the most redundant photos are named for the owner, not sent back.
  const redundant = vendi < minVendi ? mostRedundant(photos).slice(0, Math.ceil(minVendi - vendi)).map((photo) => ({ id: photo.id, redundancy: Number(photo.redundancy.toFixed(3)) })) : [];
  if (!dryRun && pairs.length) {
    for (const pair of pairs) {
      const entry = plan.entries.find((item) => item.id === pair.reject);
      // An approved photo stays: the owner chose it.
      if (entry.status === 'generated') Object.assign(entry, { status: 'rejected-duplicate', ...(pair.keep ? { duplicateOf: pair.keep } : {}), reviewNote: pair.reason ?? `looks like ${pair.keep} (DINOv2 cosine ${pair.cosine})` });
    }
    await writeJson(planPath, plan);
  }
  const report = { schemaVersion: 'seo-site-image-diversity-v1', checkedAt: new Date().toISOString(), model: 'Xenova/dinov2-small (q8)', threshold: LOOK_ALIKE_COSINE, photos: photos.length, vendi: Number(vendi.toFixed(2)), referenceShare: referenceShare === null ? null : Number(referenceShare.toFixed(2)), minVendi: Number(minVendi.toFixed(2)), lookAlikes: pairs, mostRedundant: redundant };
  await writeJson(resolve(root, 'docs/research/images/diversity.json'), report);
  return report;
}

runMain(import.meta.url, async () => {
  const report = await checkImageDiversity({ dryRun: process.argv.includes('--dry-run') });
  console.log(`photos ${report.photos}, Vendi ${report.vendi} (minimum ${report.minVendi}), look-alikes sent back ${report.lookAlikes.length}`);
  for (const pair of report.lookAlikes) console.log(`- ${pair.reject}: ${pair.reason ?? `looks like ${pair.keep}`} (${pair.cosine})`);
  if (report.vendi < report.minVendi) console.log(`note: less diverse than the reference; most redundant: ${report.mostRedundant.map((item) => item.id).join(', ')} (review the contact sheet)`);
});
