#!/usr/bin/env node

// The site's data checked right after the import, before any photo or model call (Fable's plan V-5, four-site audit
// 2026-11-17: of that day's nine kinds of problem, seven could have been stopped in the first steps instead of at the
// audits forty minutes later). Runs lib/site-data-checks.mjs on the imported pages, the trust bar (not the pages' own
// figures: the page-figures step, later in the run, makes them and keeps only those that
// read; the stage 10 SEO audit checks them on the build): the enquiry form on the inquiry and contact pages, posts on an indexable blog hub, trust figures that read,
// no promised file without a file or a request form (errors), and descriptions written from one skeleton (a warning).
// Writes docs/research/data-checks.json; an error stops the run, each named with who clears it (lib/issue-owners.mjs).
// Usage: node scripts/check-site-data.mjs [siteRoot]

import { resolve } from 'node:path';
import { byOwner, OWNER_NAMES, ownerOf } from './lib/issue-owners.mjs';
import { cliArgs, runMain } from './lib/cli.mjs';
import { readJson, writeJson } from './lib/json-io.mjs';
import { siteDataProblems } from './lib/site-data-checks.mjs';
import { companyFacts } from './lib/facts.mjs';
import { readProof } from './lib/proof-consistency.mjs';
import { loadSitePages, mainKeywords } from './lib/site-pages.mjs';

export const DATA_CHECKS_SCHEMA = 'seo-site-data-checks-v1';

export async function checkSiteData({ root = process.cwd() } = {}) {
  const data = (path) => readJson(resolve(root, path), null);
  const pages = await loadSitePages(root, { photoBriefs: false });
  const identity = await data('src/data/site-identity.json');
  const problems = siteDataProblems({ pages, trust: await data('src/data/site-trust.json'), keywords: await mainKeywords(root), siteName: identity?.siteName ?? '', ...await readProof(root), facts: await companyFacts(root).catch(() => new Map()) }).map((problem) => ({ ...problem, owner: ownerOf(problem.issue) }));
  const report = { schemaVersion: DATA_CHECKS_SCHEMA, pages: pages.length, errors: problems.filter((problem) => problem.level === 'error'), warnings: problems.filter((problem) => problem.level === 'warning') };
  await writeJson(resolve(root, 'docs/research/data-checks.json'), report);
  return report;
}

runMain(import.meta.url, async () => {
  const { positionals } = cliArgs();
  const report = await checkSiteData({ root: resolve(positionals[0] ?? '.') });
  for (const [label, list] of [['error', report.errors], ['warning', report.warnings]]) for (const item of list) console.log(`${label} ${item.issue} (${OWNER_NAMES[item.owner]}) ${item.route}: ${item.detail}`);
  console.log(`data checks: ${report.pages} pages, ${report.errors.length} error(s), ${report.warnings.length} warning(s) (docs/research/data-checks.json)`);
  if (report.errors.length) throw new Error(`the site's data does not pass: ${byOwner(report.errors.map((item) => item.issue)).join('; ')}`);
});
