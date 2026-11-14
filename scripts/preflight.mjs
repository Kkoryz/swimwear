#!/usr/bin/env node

// Stage 11 launch preflight: the release gate on a release build (pnpm build:release). It never deploys and never
// says "launched"; it answers ready_for_deployment or blocked. Holds are appended in order: Site Factory's holds come
// first unchanged, then this gate's own. Writes docs/research/launch-preflight.json; exits 2 when blocked (waits for
// people), 1 on an error.
// Checks: inherited holds, placeholder pages, competitor files and placeholder photos, image slots, unreviewed or
// unlabelled AI images, the enquiry form and privacy page, analytics, site identity, the stage 10 SEO audit, broken
// internal links and the LCP image budget. After deployment (not checked here): HTTPS/headers/redirects on the live
// host, a real form POST, Search Console and Bing verification with the sitemap, field Core Web Vitals, indexing.
// Usage: node scripts/preflight.mjs

import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runMain } from './lib/cli.mjs';
import { readJson, writeJson } from './lib/json-io.mjs';
import { checklistMarkdown } from './lib/launch-checklist.mjs';
import { BUILD_CHECKS } from './lib/preflight/build-checks.mjs';
import { CONTENT_CHECKS } from './lib/preflight/content-checks.mjs';
import { loadContext } from './lib/preflight/context.mjs';
import { RELEASE_CHECKS } from './lib/preflight/release-checks.mjs';
import { SITE_CHECKS } from './lib/preflight/site-checks.mjs';
import { VERIFICATION_CHECKS } from './lib/preflight/verification-checks.mjs';

export const PREFLIGHT_SCHEMA = 'seo-site-launch-preflight-v1';
const POST_DEPLOY = ['https_headers_and_redirects_on_live_host', 'form_post_end_to_end', 'search_console_and_bing_verified_with_sitemap', 'field_core_web_vitals', 'indexing_sample_url_inspection'];

// The gate, in hold order. run(ctx) returns nothing (pass), a finding { detail, items? } or a list of findings; a
// finding may carry its own code. Notices are for the owner's review and never block release. The checks live by
// domain in lib/preflight/.
export const CHECKS = [...CONTENT_CHECKS, ...VERIFICATION_CHECKS, ...BUILD_CHECKS, ...SITE_CHECKS, ...RELEASE_CHECKS];

export function runChecks(ctx, checks = CHECKS) {
  const results = { hold: [], notice: [] };
  for (const check of checks) {
    for (const { code = check.code, detail, items = [] } of [check.run(ctx) || []].flat().filter(Boolean)) results[check.level].push({ code, detail, ...(items.length ? { items } : {}) });
  }
  return { holds: results.hold, notices: results.notice };
}

export async function preflight({ root = process.cwd() } = {}) {
  const ctx = await loadContext(root);
  const { holds, notices } = runChecks(ctx);
  const gate = { schemaVersion: PREFLIGHT_SCHEMA, status: holds.length ? 'blocked' : 'ready_for_deployment', launched: false, checkedAt: new Date().toISOString(), holds, notices, drift: ctx.baseline ? { baselineAcceptedAt: ctx.baseline.acceptedAt, changes: ctx.drift.filter((change) => change.level !== 'critical') } : 'no baseline yet (first release)', postDeployRequired: POST_DEPLOY };
  await writeJson(resolve(root, 'docs/research/launch-preflight.json'), gate);
  // The same holds for people: grouped by who clears them, with Site Factory's open content issues.
  const contentIssues = (await readJson(resolve(root, 'docs/research/content-issues.json'), { issues: [] })).issues ?? [];
  await writeFile(resolve(root, 'docs/research/launch-checklist.md'), `${checklistMarkdown(gate, { contentIssues, site: ctx.identity?.siteName ?? '' })}\n`);
  return gate;
}

runMain(import.meta.url, async () => {
  const gate = await preflight();
  console.log(`${gate.status}: ${gate.holds.length} hold(s)`);
  for (const item of gate.holds) console.log(`- ${item.code}: ${item.detail}${item.items?.length ? ` [${item.items.slice(0, 4).join(', ')}${item.items.length > 4 ? `, +${item.items.length - 4}` : ''}]` : ''}`);
  for (const item of gate.notices) console.log(`  note ${item.code}: ${item.detail}`);
  // Blocked is waiting for people (site-run WAITS), not a failure.
  if (gate.status !== 'ready_for_deployment') process.exitCode = 2;
}, { stack: true });
