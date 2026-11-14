#!/usr/bin/env node

// Stage 11: compare this site's pages with the owner's other sites (scripts/lib/cross-site.mjs). Writes this build's
// fingerprint (docs/research/content-fingerprint.json; build:release also writes it) and the comparison
// (docs/research/cross-site.json): pages whose main text is a near-duplicate of a page on another site hold release.
// Other sites: --against <fingerprint.json | workspace dir> (repeatable) and every *.json in SITE_FINGERPRINTS_DIR
// (a shared folder where each released site leaves its fingerprint).
// --hold: near-duplicates wait for the owner (exit 2: site-run's release step, whose preflight holds on them) instead
// of failing (exit 1).
// Usage: node scripts/check-cross-site.mjs [--against <path> ...] [--hold]

import { cliArgs, runMain } from './lib/cli.mjs';
import { checkCrossSite } from './lib/cross-site.mjs';

// The exit code for a report: 0 with no near-duplicate; else 1, or 2 (waits for the owner) with hold.
export const crossSiteExit = (report, { hold = false } = {}) => (report.duplicates.length ? (hold ? 2 : 1) : 0);

runMain(import.meta.url, async () => {
  const { values } = cliArgs({ against: { type: 'string', multiple: true }, hold: { type: 'boolean' } });
  const report = await checkCrossSite({ against: values.against ?? [] });
  console.log(`${report.host}: compared with ${report.comparedWith.length} site(s), ${report.duplicates.length} near-duplicate page(s)`);
  for (const item of report.duplicates) console.log(`- ${item.route} ~ ${item.host}${item.otherRoute} (${item.similarity})`);
  process.exitCode = crossSiteExit(report, { hold: values.hold === true });
});
