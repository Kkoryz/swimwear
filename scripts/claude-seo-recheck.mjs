#!/usr/bin/env node
// The item-by-item recheck of the site's claude-seo audit on the release build in dist/ (claude-seo-audit.mjs
// claudeSeoRecheck; owner 2026-11-18: one audit a site, its fixes rechecked, never audited again): site-run's
// seo-recheck step. Writes docs/research/seo-audit-N/findings-recheck.json; the preflight then holds on what still
// stands. Exits 2 when the verification cannot be asked now (a usage limit, a sign-in).
// Usage: node scripts/claude-seo-recheck.mjs   (after pnpm build:release)

import { claudeSeoRecheck, UNAVAILABLE } from './claude-seo-audit.mjs';
import { runMain } from './lib/cli.mjs';

runMain(import.meta.url, async () => {
  const result = await claudeSeoRecheck();
  if (result.skipped) { console.log(`claude-seo recheck skipped: ${result.skipped}`); return; }
  if (result.unchanged) { console.log(`claude-seo recheck not needed: ${result.unchanged} audited this build`); return; }
  if (result.reused) { console.log(`claude-seo recheck unchanged: ${result.reused}/findings-recheck.json is of this build`); return; }
  if (result.failed) { console.error(`claude-seo recheck ${result.failed === 'unavailable' ? 'waits' : `failed (${result.failed})`}: ${result.detail}`); process.exitCode = result.failed === 'unavailable' ? UNAVAILABLE : 1; return; }
  const { record } = result;
  const gone = record.items.filter((item) => !item.located).length;
  console.log(`${result.dir}: ${record.items.length} item(s) that held rechecked: ${record.holds.length} still hold, ${record.items.length - record.holds.length} no longer confirmed (${gone} no longer found where the audit quoted them)`);
  for (const id of record.holds) console.log(`- ${id} still holds`);
});
