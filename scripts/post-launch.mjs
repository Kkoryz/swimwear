#!/usr/bin/env node
// Stage 12, after a deploy and then weekly (Fable's 11-14 plan, item 10, and the four-site audit 2026-11-17 plan P-1,
// P-3, A5): one run of what was done by hand in no set order.
// 1. The live site checked against this build (verify-live.mjs: redirects, 404, robots, sitemap, security headers).
// 2. The live pages compared with the release that was deployed (docs/research/seo-snapshot.json, written by
//    build:release): title, description, canonical, robots, headings, structured data as search engines read them.
// 3. Only when 1 and 2 pass, IndexNow told of the URLs added, changed or removed since the accepted SEO baseline
//    (indexnow.mjs; --dry-run lists them and sends nothing). Accepting this release as the next baseline stays the
//    owner's (node scripts/seo-snapshot.mjs --accept --by "<name>").
// 4. The content due for a refresh: indexable pages unchanged for six months (src/data/page-dates.json).
// 5. With --lighthouse, one Lighthouse run of the home page from the site's own node_modules, Agentic Browsing as X/N
//    (skipped with the reason when the site has no Lighthouse).
// Writes docs/research/post-launch.json and post-launch.md; exit 1 when the live site has problems. The weekly schedule
// is in deploy/OPERATIONS.zh-CN.md (section 8). The 28-day field check is scripts/field-check.mjs.
// Usage: node scripts/post-launch.mjs [--origin https://example.com] [--dry-run] [--lighthouse]

import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { cliArgs, runMain } from './lib/cli.mjs';
import { readJson, writeJson } from './lib/json-io.mjs';
import { runLighthouse } from './lib/lighthouse.mjs';
import { liveDrift, liveSnapshot, postLaunchMarkdown, refreshList } from './lib/post-launch.mjs';
import { isIndexable } from './lib/seo-head.mjs';
import { snapshotDrift } from './lib/seo-snapshot.mjs';
import { loadSitePages } from './lib/site-pages.mjs';
import { submitIndexNow } from './indexnow.mjs';
import { verifyLive } from './verify-live.mjs';

async function fetchPage(url) {
  try {
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(20000), headers: { 'user-agent': 'seo-site-post-launch/1' } });
    return { status: response.status, body: response.status === 200 ? await response.text() : '' };
  } catch (error) {
    return { status: 0, body: '', error: error.message };
  }
}

// verify(root, origin), submit({ root, dryRun }), fetchPage(url) and lighthouse({ root, url, outPath }) are the
// scripts' own functions (a test passes its own).
export async function postLaunch({ root = process.cwd(), origin = null, dryRun = false, lighthouse = false, today = new Date(), verify = (at, from) => verifyLive({ root: at, origin: from }), submit = submitIndexNow, fetchPageImpl = fetchPage, lighthouseRun = runLighthouse } = {}) {
  const previous = await readJson(resolve(root, 'docs/research/post-launch.json'), null);
  const live = await verify(root, origin);
  const site = live.origin.replace(/\/$/, '');
  const release = await readJson(resolve(root, 'docs/research/seo-snapshot.json'), null);
  const baseline = await readJson(resolve(root, 'docs/research/seo-baseline.json'), null);
  let drift = { skipped: 'no docs/research/seo-snapshot.json of the deployed release (run pnpm build:release)', critical: [], warning: [], failed: [] };
  if (release) {
    const routes = Object.entries(release.pages).filter(([, page]) => !page.robots?.includes('noindex')).map(([route]) => route);
    drift = { ...liveDrift(release, await liveSnapshot(site, routes, fetchPageImpl)), compared: routes.length };
  }
  const passed = live.problems.length === 0 && !drift.skipped && drift.critical.length === 0 && drift.failed.length === 0;
  const told = passed ? await submit({ root, dryRun }) : null;
  const pages = await loadSitePages(root, { release: true });
  const dates = await readJson(resolve(root, 'src/data/page-dates.json'), {});
  const changes = baseline && release ? snapshotDrift(baseline, release) : null;
  const summary = {
    checkedAt: today.toISOString(),
    origin: live.origin,
    // The first check that passed: the day the 28-day field check counts from (field-check.mjs).
    launchedAt: previous?.launchedAt ?? (passed ? today.toISOString() : null),
    passed,
    live: { problems: live.problems, report: 'docs/research/live-check.json' },
    liveDrift: drift,
    indexNow: told ? { dryRun, submitted: told.submitted, urls: told.urlList.length } : { skipped: 'the live site has problems or differs from the release: fixed and checked again before search engines are told' },
    baseline: {
      drift: changes ? `this release against the baseline of ${baseline.acceptedAt}: ${['critical', 'warning', 'info'].map((level) => `${level} ${changes.filter((change) => change.level === level).length}`).join(', ')}` : 'no accepted baseline yet (first release)',
      accept: 'the owner accepts this release as the SEO baseline once its drift is reviewed: node scripts/seo-snapshot.mjs --accept --by "<name>"',
    },
    refresh: refreshList(pages, dates, { today, indexable: isIndexable }),
    ...(lighthouse ? { lighthouse: await lighthouseRun({ root, url: `${site}/`, outPath: resolve(root, 'docs/research/lighthouse/post-launch.json') }) } : {}),
  };
  await writeJson(resolve(root, 'docs/research/post-launch.json'), summary);
  await writeFile(resolve(root, 'docs/research/post-launch.md'), `${postLaunchMarkdown(summary)}\n`);
  return summary;
}

runMain(import.meta.url, async () => {
  const { values } = cliArgs({ origin: { type: 'string' }, 'dry-run': { type: 'boolean' }, lighthouse: { type: 'boolean' } });
  const summary = await postLaunch({ origin: values.origin ?? null, dryRun: values['dry-run'] === true, lighthouse: values.lighthouse === true });
  console.log(`${summary.origin}: live ${summary.live.problems.length ? `${summary.live.problems.length} problem(s)` : 'passed'}; release vs live ${summary.liveDrift.skipped ? 'not compared' : `${summary.liveDrift.critical.length} critical, ${summary.liveDrift.failed.length} not answering`}; IndexNow ${summary.indexNow.skipped ? 'not told' : `${summary.indexNow.dryRun ? 'would be told of' : 'told of'} ${summary.indexNow.urls} URL(s)`}; ${summary.refresh.due.length} page(s) due for a refresh`);
  if (summary.lighthouse) console.log(`Lighthouse: ${summary.lighthouse.skipped ?? summary.lighthouse.failed ?? `Agentic Browsing ${summary.lighthouse.agentic.available ? summary.lighthouse.agentic.display : 'n/a'}`}`);
  console.log('docs/research/post-launch.md');
  if (!summary.passed) process.exitCode = 1;
});
