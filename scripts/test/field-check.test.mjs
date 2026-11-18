import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { fieldCheck, fieldMarkdown } from '../field-check.mjs';
import { apiKey, cruxRecord, redact, searchConsoleProperty } from '../lib/google-field.mjs';
import { agenticFraction, lighthouseSummary, runLighthouse } from '../lib/lighthouse.mjs';

const KEY = 'AIza-secret-test-key';
const json = (status, body) => ({ status, ok: status < 300, json: async () => body, text: async () => JSON.stringify(body) });
// An LHR as Lighthouse 13 writes it: agentic-browsing counted as claude-seo counts it.
const lhr = {
  lighthouseVersion: '13.5.0', finalDisplayedUrl: 'https://x.test/', configSettings: { formFactor: 'mobile' },
  categories: { performance: { score: 0.91 }, seo: { score: 1 }, 'agentic-browsing': { score: 0.5, auditRefs: [{ id: 'agent-accessibility-tree' }, { id: 'cumulative-layout-shift' }, { id: 'llms-txt' }, { id: 'webmcp-registered-tools' }, { id: 'hidden-one', group: 'hidden' }] } },
  audits: { 'agent-accessibility-tree': { scoreDisplayMode: 'binary', score: 1 }, 'cumulative-layout-shift': { scoreDisplayMode: 'numeric', score: 0.7, numericValue: 0.12 }, 'llms-txt': { scoreDisplayMode: 'notApplicable', score: null }, 'webmcp-registered-tools': { scoreDisplayMode: 'informative', score: null }, 'hidden-one': { scoreDisplayMode: 'binary', score: 0 }, 'largest-contentful-paint': { numericValue: 2100 } },
};

test('Agentic Browsing is X/N as Lighthouse counts it, never a percentage', () => {
  assert.deepEqual(agenticFraction(lhr), { available: true, passed: 1, counted: 2, informative: 1, display: '1/2' });
  assert.deepEqual(agenticFraction({ categories: {} }), { available: false });
  const summary = lighthouseSummary(lhr);
  assert.deepEqual(summary.categories, { performance: 91, seo: 100 });
  assert.equal(summary.lab.lcpMs, 2100);
});

test('a site without Lighthouse in its node_modules is skipped with the reason', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lh-'));
  assert.match((await runLighthouse({ root, url: 'https://x.test/', outPath: join(root, 'out.json') })).skipped, /node_modules/);
});

test('the API key comes from the environment and never shows in an error', async () => {
  assert.equal(apiKey({ GOOGLE_API_KEY: 'a' }), 'a');
  assert.equal(apiKey({ PAGESPEED_API_KEY: 'p', GOOGLE_API_KEY: 'a' }), 'p');
  assert.equal(redact(`bad key=${KEY}`, KEY), 'bad key=<key>');
  const urls = [];
  const fetchImpl = async (url) => { urls.push(url); return url.includes('chromeux') ? json(400, { error: `API key ${KEY} invalid` }) : json(200, {}); };
  await assert.rejects(cruxRecord({ origin: 'https://x.test', key: KEY, fetchImpl }), (error) => !error.message.includes(KEY) && /HTTP 400/.test(error.message));
  assert.deepEqual(await cruxRecord({ origin: 'https://x.test', key: KEY, fetchImpl: async () => json(404, {}) }), { available: false, reason: 'not enough Chrome visits on record yet (CrUX needs a steady 28 days of traffic)' });
});

test('the 28-day check waits for 28 days after the first passing post-launch check, then reads CrUX, PageSpeed and Search Console', async () => {
  const root = await mkdtemp(join(tmpdir(), 'field-'));
  await mkdir(join(root, 'docs/research'), { recursive: true });
  await mkdir(join(root, 'dist'), { recursive: true });
  await writeFile(join(root, 'docs/research/post-launch.json'), JSON.stringify({ launchedAt: '2026-11-01T00:00:00.000Z' }));
  await writeFile(join(root, 'dist/sitemap.xml'), '<urlset><url><loc>https://x.test/</loc></url><url><loc>https://x.test/a/</loc></url></urlset>');
  const early = await fieldCheck({ root, origin: 'https://x.test', env: {}, today: new Date('2026-11-17T00:00:00Z') });
  assert.equal(early.due, false);
  assert.match(early.reason, /16 day\(s\) ago/);
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const credentialsPath = join(root, 'sa.json');
  await writeFile(credentialsPath, JSON.stringify({ client_email: 'audit@project.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }), token_uri: 'https://oauth2.test/token' }));
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push(String(url));
    if (url.startsWith('https://chromeuxreport')) return json(200, { record: { metrics: { largest_contentful_paint: { percentiles: { p75: 2300 } }, interaction_to_next_paint: { percentiles: { p75: 250 } }, cumulative_layout_shift: { percentiles: { p75: '0.05' } } } } });
    if (url.startsWith('https://www.googleapis.com/pagespeedonline')) return json(200, { lighthouseResult: lhr, loadingExperience: { overall_category: 'FAST', metrics: { LARGEST_CONTENTFUL_PAINT_MS: { percentile: 2200 } } } });
    if (url === 'https://oauth2.test/token') { assert.match(String(init.body), /grant_type=urn%3Aietf/); return json(200, { access_token: 'tok' }); }
    if (url.endsWith('/webmasters/v3/sites')) return json(200, { siteEntry: [{ siteUrl: 'sc-domain:x.test', permissionLevel: 'siteOwner' }] });
    if (url.endsWith('/sitemaps')) return json(200, { sitemap: [{ path: 'https://x.test/sitemap.xml', contents: [{ type: 'web', submitted: '2', indexed: '1' }] }] });
    if (url.includes('urlInspection')) return json(200, { inspectionResult: { indexStatusResult: { verdict: 'PASS', coverageState: JSON.parse(init.body).inspectionUrl.endsWith('/a/') ? 'Crawled - currently not indexed' : 'Submitted and indexed' } } });
    if (url.endsWith('/searchAnalytics/query')) return json(200, { rows: [{ keys: [JSON.parse(init.body).dimensions[0] === 'query' ? 'motel management' : 'https://x.test/'], clicks: 3, impressions: 120, ctr: 0.025, position: 18.44 }] });
    throw new Error(`unexpected ${url}`);
  };
  const lighthouseRun = async () => ({ skipped: 'none' });
  const { due, report } = await fieldCheck({ root, origin: 'https://x.test', env: { PAGESPEED_API_KEY: KEY, GOOGLE_APPLICATION_CREDENTIALS: credentialsPath }, today: new Date('2026-11-30T00:00:00Z'), fetchImpl, lighthouseRun });
  assert.equal(due, true);
  assert.deepEqual(report.crux.phone.rating, { lcp: 'good', inp: 'needs improvement', cls: 'good' });
  assert.equal(report.pageSpeed.agentic.display, '1/2');
  assert.equal(report.pageSpeed.field.lcpMs, 2200);
  assert.deepEqual(report.searchConsole.coverage, { 'Submitted and indexed': 1, 'Crawled - currently not indexed': 1 });
  assert.equal(report.searchConsole.queries[0].query, 'motel management');
  assert.deepEqual(report.searchConsole.range, { start: '2026-10-31', end: '2026-11-27' }, '28 days before the 3-day data lag');
  assert.equal(report.lighthouse, undefined, 'PageSpeed was the Lighthouse run');
  const text = JSON.stringify(report) + fieldMarkdown(report);
  assert.ok(!text.includes(KEY), 'the key is never written');
  assert.match(fieldMarkdown(report), /Agentic Browsing 1\/2（按 X\/N 记/);
  // Without a key: CrUX and PageSpeed say why, and one local Lighthouse run is tried.
  const bare = await fieldCheck({ root, origin: 'https://x.test', env: {}, force: true, fetchImpl, lighthouseRun });
  assert.match(bare.report.crux.skipped, /PAGESPEED_API_KEY/);
  assert.deepEqual(bare.report.lighthouse, { skipped: 'none' });
  assert.match(bare.report.searchConsole.skipped, /GOOGLE_APPLICATION_CREDENTIALS/);
});

test('the Search Console property is the one the account can read', async () => {
  const fetchImpl = async () => json(200, { siteEntry: [{ siteUrl: 'https://x.test/', permissionLevel: 'siteFullUser' }, { siteUrl: 'sc-domain:x.test', permissionLevel: 'siteUnverifiedUser' }] });
  assert.equal(await searchConsoleProperty({ origin: 'https://x.test', token: 't', fetchImpl }), 'https://x.test/');
  assert.equal(await searchConsoleProperty({ origin: 'https://x.test', token: 't', siteUrl: 'sc-domain:x.test', fetchImpl }), 'sc-domain:x.test');
});
