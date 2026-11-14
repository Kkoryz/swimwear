#!/usr/bin/env node

// Content checks on the authored pages (lib/content-lint.mjs): writes docs/research/content-issues.json and
// docs/research/content-issues.md, the list that goes back to Site Factory 07. It reports and never fails the build:
// copy is Site Factory's to fix; the launch preflight names the open issues.
// Usage: node scripts/audit-content.mjs

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runMain } from './lib/cli.mjs';
import { contentIssuesMarkdown, lintContent, termsSentences } from './lib/content-lint.mjs';
import { companyFacts } from './lib/facts.mjs';
import { readJson, writeJson } from './lib/json-io.mjs';

export async function auditContent({ root = process.cwd() } = {}) {
  const pages = await readJson(resolve(root, 'src/data/authoring-pages.json'), []);
  const identity = await readJson(resolve(root, 'src/data/site-identity.json'), null);
  // The owner's order terms, written out on every product and service page, are not boilerplate (Site Factory's package
  // marks them by fact_ids; lib/content-lint.mjs termsSentences).
  const site = await readJson(resolve(root, 'site.json'), null);
  const pkg = site?.siteFactory ? await readJson(resolve(root, site.siteFactory, 'authoring_package.json'), null) : null;
  const issues = lintContent(pages, { exempt: termsSentences(pkg, await companyFacts(root)) });
  await mkdir(resolve(root, 'docs/research'), { recursive: true });
  await writeJson(resolve(root, 'docs/research/content-issues.json'), { schemaVersion: 'seo-site-content-issues-v1', checkedAt: new Date().toISOString(), issues });
  await writeFile(resolve(root, 'docs/research/content-issues.md'), `${contentIssuesMarkdown(issues, { site: identity?.siteName ?? '' })}\n`);
  return issues;
}

runMain(import.meta.url, async () => {
  const issues = await auditContent();
  const counts = {};
  for (const issue of issues) counts[issue.kind] = (counts[issue.kind] ?? 0) + 1;
  console.log(JSON.stringify({ issues: issues.length, ...counts }));
});
