#!/usr/bin/env node

// Stage 10 gate (scripts/lib/seo-audit.mjs) on the built site: writes docs/research/seo-audit.json and fails on any
// error. Usage: node scripts/audit-seo.mjs (after astro build)

import { runMain } from './lib/cli.mjs';
import { auditSeo } from './lib/seo-audit.mjs';

runMain(import.meta.url, async () => {
  const report = await auditSeo();
  console.log(JSON.stringify({ pages: report.pages, indexable: report.indexable, failures: report.failures.length, warnings: report.warnings.length }));
});
