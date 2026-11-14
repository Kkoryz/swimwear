#!/usr/bin/env node
// Records the verified build when the audits pass and the design review of the current shots has passed (site-run's
// design gate), or says whether the sources now are the verified ones (lib/verified-build.mjs).
// Usage: node scripts/verified-build.mjs record | status

import { runMain, usage } from './lib/cli.mjs';
import { loadSitePages } from './lib/site-pages.mjs';
import { recordVerifiedBuild, verifiedNow } from './lib/verified-build.mjs';

runMain(import.meta.url, async () => {
  const [command] = process.argv.slice(2);
  const root = process.cwd();
  if (command === 'record') {
    const record = await recordVerifiedBuild(root, (await loadSitePages(root)).map((page) => page.route));
    console.log(`verified build ${record.source}: ${record.reviewed.length} page(s) reviewed, ${record.auditedOnly.length} audited only`);
    return;
  }
  if (command !== 'status') return usage('Usage: node scripts/verified-build.mjs record | status');
  const { current, problems, record } = await verifiedNow(root);
  console.log(current ? `verified (${record.at})` : `not verified:\n${problems.map((problem) => `- ${problem.code}: ${problem.detail}`).join('\n')}`);
  if (!current) process.exitCode = 2;
});
