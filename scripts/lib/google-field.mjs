// Google's free data on a live site (four-site audit 2026-11-17, Fable's plan P-2; claude-seo seo-google, ported, not
// installed): Chrome UX Report field data (p75 LCP, INP, CLS of real Chrome users), PageSpeed Insights (a Lighthouse
// run on Google's servers, Agentic Browsing included, and the page's field data), and, when a service account the
// owner added to the Search Console property is given, the property's indexing (sitemaps, a sample of URL
// inspections) and its top queries and pages. The API key comes from the environment and is never written or
// printed: every error text has it taken out. Free quotas only; nothing here is a paid call.

import { createSign } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { lighthouseSummary } from './lighthouse.mjs';

export const CRUX_ENDPOINT = 'https://chromeuxreport.googleapis.com/v1/records:queryRecord';
export const PSI_ENDPOINT = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';
export const GSC_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const GSC = 'https://www.googleapis.com/webmasters/v3';
const INSPECT = 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect';
// Core Web Vitals thresholds at p75 (good / poor), as claude-seo seo-technical states them.
export const CWV = Object.freeze({ lcp: [2500, 4000], inp: [200, 500], cls: [0.1, 0.25] });

// The API key of the environment (PAGESPEED_API_KEY, else GOOGLE_API_KEY), or null.
export const apiKey = (env = process.env) => env.PAGESPEED_API_KEY || env.GOOGLE_API_KEY || null;
// A text with the key taken out.
export const redact = (text, key) => (key ? String(text).split(key).join('<key>') : String(text));
const rating = (metric, value) => (value === null ? null : value <= CWV[metric][0] ? 'good' : value <= CWV[metric][1] ? 'needs improvement' : 'poor');

// CrUX p75 field data for an origin (or a url); { available: false, reason } when Chrome has too few visits on record.
export async function cruxRecord({ origin = null, url = null, key, formFactor = 'PHONE', fetchImpl = fetch }) {
  const response = await fetchImpl(`${CRUX_ENDPOINT}?key=${encodeURIComponent(key)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...(url ? { url } : { origin }), formFactor }) });
  if (response.status === 404) return { available: false, reason: 'not enough Chrome visits on record yet (CrUX needs a steady 28 days of traffic)' };
  if (!response.ok) throw new Error(`CrUX answered HTTP ${response.status}: ${redact((await response.text()).slice(0, 300), key)}`);
  const metrics = (await response.json()).record?.metrics ?? {};
  const p75 = (name) => { const value = metrics[name]?.percentiles?.p75; return value === undefined ? null : Number(value); };
  const values = { lcp: p75('largest_contentful_paint'), inp: p75('interaction_to_next_paint'), cls: p75('cumulative_layout_shift') };
  return { available: true, formFactor, p75: values, rating: Object.fromEntries(Object.entries(values).map(([metric, value]) => [metric, rating(metric, value)])) };
}

// One PageSpeed Insights run (mobile): the Lighthouse summary, Agentic Browsing as X/N, and the field data it shows.
export async function pageSpeed({ url, key, strategy = 'mobile', fetchImpl = fetch }) {
  const params = new URLSearchParams({ url, strategy: strategy.toUpperCase() });
  for (const category of ['PERFORMANCE', 'ACCESSIBILITY', 'BEST_PRACTICES', 'SEO', 'AGENTIC_BROWSING']) params.append('category', category);
  params.append('key', key);
  const response = await fetchImpl(`${PSI_ENDPOINT}?${params}`);
  if (!response.ok) throw new Error(`PageSpeed Insights answered HTTP ${response.status}: ${redact((await response.text()).slice(0, 300), key)}`);
  const data = await response.json();
  const field = data.loadingExperience?.metrics ?? null;
  return { ...lighthouseSummary(data.lighthouseResult), field: field ? { overall: data.loadingExperience.overall_category ?? null, lcpMs: field.LARGEST_CONTENTFUL_PAINT_MS?.percentile ?? null, inpMs: field.INTERACTION_TO_NEXT_PAINT?.percentile ?? null, cls: field.CUMULATIVE_LAYOUT_SHIFT_SCORE ? field.CUMULATIVE_LAYOUT_SHIFT_SCORE.percentile / 100 : null } : null };
}

// An access token for Search Console from a service account key file (GOOGLE_APPLICATION_CREDENTIALS).
export async function serviceAccountToken({ credentialsPath, fetchImpl = fetch, now = Date.now() }) {
  const account = JSON.parse(await readFile(credentialsPath, 'utf8'));
  if (!account.client_email || !account.private_key) throw new Error('the Google credentials file is not a service account key (client_email, private_key)');
  const tokenUri = account.token_uri ?? 'https://oauth2.googleapis.com/token';
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const seconds = Math.floor(now / 1000);
  const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ iss: account.client_email, scope: GSC_SCOPE, aud: tokenUri, iat: seconds, exp: seconds + 3600 })}`;
  const signature = createSign('RSA-SHA256').update(unsigned).sign(account.private_key).toString('base64url');
  const response = await fetchImpl(tokenUri, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }) });
  if (!response.ok) throw new Error(`Google sign-in answered HTTP ${response.status} (is the service account added to the Search Console property?)`);
  return (await response.json()).access_token;
}

const day = (date) => date.toISOString().slice(0, 10);

// The Search Console property of the site: GSC_SITE_URL when set, else the domain property or the URL-prefix one the
// account can read.
export async function searchConsoleProperty({ origin, token, siteUrl = null, fetchImpl = fetch }) {
  if (siteUrl) return siteUrl;
  const response = await fetchImpl(`${GSC}/sites`, { headers: { authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`Search Console sites answered HTTP ${response.status}`);
  const entries = ((await response.json()).siteEntry ?? []).filter((entry) => entry.permissionLevel !== 'siteUnverifiedUser');
  const host = new URL(origin).host.replace(/^www\./, '');
  return [`sc-domain:${host}`, `${origin.replace(/\/$/, '')}/`].find((candidate) => entries.some((entry) => entry.siteUrl === candidate)) ?? null;
}

// Indexing and search data of the property over the 28 days before the data lag (3 days): the sitemaps' submitted
// and indexed counts, the coverage state of a sample of the sitemap's URLs (URL Inspection, 2,000 a day free), and the
// top queries and pages by clicks.
export async function searchConsoleReport({ property, token, urls = [], sample = 20, fetchImpl = fetch, now = new Date() }) {
  const auth = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  const site = encodeURIComponent(property);
  const end = new Date(now.getTime() - 3 * 86400000);
  const start = new Date(end.getTime() - 27 * 86400000);
  const query = async (dimension) => {
    const response = await fetchImpl(`${GSC}/sites/${site}/searchAnalytics/query`, { method: 'POST', headers: auth, body: JSON.stringify({ startDate: day(start), endDate: day(end), dimensions: [dimension], rowLimit: 25 }) });
    if (!response.ok) throw new Error(`Search Console search analytics answered HTTP ${response.status}`);
    return ((await response.json()).rows ?? []).map((row) => ({ [dimension]: row.keys[0], clicks: row.clicks, impressions: row.impressions, ctr: Math.round(row.ctr * 1000) / 10, position: Math.round(row.position * 10) / 10 }));
  };
  const sitemapsResponse = await fetchImpl(`${GSC}/sites/${site}/sitemaps`, { headers: auth });
  const sitemaps = sitemapsResponse.ok ? ((await sitemapsResponse.json()).sitemap ?? []).map((entry) => ({ path: entry.path, errors: Number(entry.errors ?? 0), warnings: Number(entry.warnings ?? 0), lastDownloaded: entry.lastDownloaded ?? null, contents: (entry.contents ?? []).map((item) => ({ type: item.type, submitted: Number(item.submitted ?? 0), indexed: item.indexed === undefined ? null : Number(item.indexed) })) })) : [];
  const coverage = {};
  const inspected = [];
  for (const url of urls.slice(0, sample)) {
    const response = await fetchImpl(INSPECT, { method: 'POST', headers: auth, body: JSON.stringify({ inspectionUrl: url, siteUrl: property }) });
    if (!response.ok) { inspected.push({ url, error: `HTTP ${response.status}` }); continue; }
    const status = (await response.json()).inspectionResult?.indexStatusResult ?? {};
    const state = status.coverageState ?? 'unknown';
    coverage[state] = (coverage[state] ?? 0) + 1;
    inspected.push({ url, verdict: status.verdict ?? null, coverageState: state, lastCrawlTime: status.lastCrawlTime ?? null });
  }
  return { property, range: { start: day(start), end: day(end) }, sitemaps, coverage, inspected, queries: await query('query'), pages: await query('page') };
}
