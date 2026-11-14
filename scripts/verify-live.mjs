#!/usr/bin/env node

// Checks the live site after a deploy (and on a schedule): canonical host redirects, a real 404, robots.txt and the
// sitemap, security headers, HTML caching and the home page's canonical, against this workspace's build.
// Writes docs/research/live-check.json; exits 1 on any problem.
// Usage: node scripts/verify-live.mjs [--origin https://example.com]

import { resolve } from 'node:path';
import { cliArgs, runMain } from './lib/cli.mjs';
import { readJson, readText, writeJson } from './lib/json-io.mjs';
import { liveProblems, liveRequests } from './lib/live-checks.mjs';

async function fetchOnce({ url, follow }) {
  try {
    const response = await fetch(url, { redirect: follow ? 'follow' : 'manual', signal: AbortSignal.timeout(20000), headers: { 'user-agent': 'seo-site-verify-live/1' } });
    const body = response.status < 300 ? await response.text() : '';
    return { status: response.status, headers: Object.fromEntries([...response.headers].map(([key, value]) => [key.toLowerCase(), value])), body };
  } catch (error) {
    return { status: 0, headers: {}, body: '', error: error.message };
  }
}

export async function verifyLive({ root = process.cwd(), origin = null } = {}) {
  const identity = await readJson(resolve(root, 'src/data/site-identity.json'), null);
  const site = origin ?? identity?.origin;
  if (!site) throw new Error('no origin: pass --origin or import the site identity');
  const responses = {};
  for (const request of liveRequests(site)) responses[request.id] = await fetchOnce(request);
  const built = await readText(resolve(root, 'dist/sitemap.xml'), null);
  const expected = built ? [...built.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]) : null;
  const policy = await readJson(resolve(root, 'config/crawler-policy.json'), { allow: [] });
  const problems = liveProblems(site, responses, expected, policy.allow.map((crawler) => crawler.token));
  const report = { schemaVersion: 'seo-site-live-check-v1', origin: site, checkedAt: new Date().toISOString(), problems, statuses: Object.fromEntries(Object.entries(responses).map(([id, response]) => [id, response.status])) };
  await writeJson(resolve(root, 'docs/research/live-check.json'), report);
  return report;
}

runMain(import.meta.url, async () => {
  const report = await verifyLive({ origin: cliArgs({ origin: { type: 'string' } }).values.origin ?? null });
  console.log(`${report.origin}: ${report.problems.length} problem(s)`);
  for (const problem of report.problems) console.log(`- ${problem.check}: ${problem.detail}`);
  if (report.problems.length) process.exitCode = 1;
});
