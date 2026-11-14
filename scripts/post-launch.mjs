#!/usr/bin/env node
// Stage 12, after a deploy (Fable's 11-14 plan, item 10: each of these was run by hand, in no set order): the live site
// checked against this build (verify-live.mjs), then, only when it passes, IndexNow told of the URLs added, changed or
// removed since the accepted SEO baseline (indexnow.mjs; --dry-run lists them and sends nothing). Accepting this
// release as the next baseline stays the owner's (node scripts/seo-snapshot.mjs --accept --by "<name>").
// Writes docs/research/post-launch.json; exit 1 when the live site has problems.
// Usage: node scripts/post-launch.mjs [--origin https://example.com] [--dry-run]

import { resolve } from 'node:path';
import { cliArgs, runMain } from './lib/cli.mjs';
import { writeJson } from './lib/json-io.mjs';
import { submitIndexNow } from './indexnow.mjs';
import { verifyLive } from './verify-live.mjs';

// verify(root, origin) and submit({ root, dryRun }) are the two scripts' own functions (a test passes its own).
export async function postLaunch({ root = process.cwd(), origin = null, dryRun = false, verify = (at, from) => verifyLive({ root: at, origin: from }), submit = submitIndexNow } = {}) {
  const live = await verify(root, origin);
  const passed = live.problems.length === 0;
  const told = passed ? await submit({ root, dryRun }) : null;
  const summary = {
    checkedAt: new Date().toISOString(),
    origin: live.origin,
    passed,
    live: { problems: live.problems.length, report: 'docs/research/live-check.json' },
    indexNow: told ? { dryRun, submitted: told.submitted, urls: told.urlList.length } : { skipped: 'the live site has problems: fixed and checked again before search engines are told' },
    baseline: 'the owner accepts this release as the SEO baseline once its drift is reviewed: node scripts/seo-snapshot.mjs --accept --by "<name>"',
  };
  await writeJson(resolve(root, 'docs/research/post-launch.json'), summary);
  return summary;
}

runMain(import.meta.url, async () => {
  const { values } = cliArgs({ origin: { type: 'string' }, 'dry-run': { type: 'boolean' } });
  const summary = await postLaunch({ origin: values.origin ?? null, dryRun: values['dry-run'] === true });
  console.log(`${summary.origin}: live ${summary.passed ? 'passed' : `${summary.live.problems} problem(s)`}; IndexNow ${summary.indexNow.skipped ? 'not told' : `${summary.indexNow.dryRun ? 'would be told of' : 'told of'} ${summary.indexNow.urls} URL(s)`}`);
  if (!summary.passed) process.exitCode = 1;
});
