#!/usr/bin/env node

// Records a person's review of generated images in the register (docs/research/image-plan.json): approved images may
// ship; rejected ones are generated again on the next run. Stage 11 blocks any AI image in use that is not approved.
// An image needs alt text to be approved. Rights: our own generated media (rights_status "owned").
// Usage: node scripts/approve-images.mjs --reviewer "<name>" (--ids id,id | --all-generated) [--reject "<reason>"]

import { resolve } from 'node:path';
import { cliArgs, listOption, runMain } from './lib/cli.mjs';
import { readJson, writeJson } from './lib/json-io.mjs';

export function reviewEntries(plan, { ids, reviewer, reject = null, at = new Date().toISOString() }) {
  if (!reviewer) throw new Error('--reviewer is required');
  const chosen = plan.entries.filter((entry) => entry.status === 'generated' && (ids === 'all' || ids.includes(entry.id)));
  if (ids !== 'all') {
    const missing = ids.filter((id) => !chosen.some((entry) => entry.id === id));
    if (missing.length) throw new Error(`not generated images: ${missing.join(', ')}`);
  }
  for (const entry of chosen) {
    if (reject) {
      Object.assign(entry, { status: 'planned', review: 'rejected', reviewNote: reject, reviewer, reviewedAt: at });
      delete entry.web;
      continue;
    }
    if (!entry.alt?.trim()) throw new Error(`${entry.id} has no alt text; write one before approving`);
    Object.assign(entry, { status: 'approved', review: 'approved', reviewer, reviewedAt: at, rights: { status: 'owned', owner: 'site owner', source: 'generated with Codex image_gen from our own prompt' } });
  }
  return chosen.map((entry) => entry.id);
}

runMain(import.meta.url, async () => {
  const { values } = cliArgs({ reviewer: { type: 'string' }, ids: { type: 'string' }, 'all-generated': { type: 'boolean' }, reject: { type: 'string' } });
  const planPath = resolve('docs/research/image-plan.json');
  const plan = await readJson(planPath);
  const ids = values['all-generated'] ? 'all' : listOption(values.ids);
  if (!ids) throw new Error('Usage: node scripts/approve-images.mjs --reviewer "<name>" (--ids id,id | --all-generated) [--reject "<reason>"]');
  const done = reviewEntries(plan, { ids, reviewer: values.reviewer, reject: values.reject ?? null });
  await writeJson(planPath, plan);
  console.log(`${values.reject ? 'rejected' : 'approved'} ${done.length}: ${done.join(', ')}`);
});
