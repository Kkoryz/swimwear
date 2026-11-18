#!/usr/bin/env node
// Stage 12, 28 days after launch (four-site audit 2026-11-17, Fable's plan P-2 and A5; claude-seo seo-google, ported):
// what real visitors and Google saw in the site's first four weeks. Chrome UX Report field data (p75 LCP, INP, CLS of
// the origin, phone and desktop) and one PageSpeed Insights run of the home page (Lighthouse on Google's servers,
// Agentic Browsing as X/N, with the page's own field data), both free with an API key from the environment
// (PAGESPEED_API_KEY or GOOGLE_API_KEY; never written or printed). When GOOGLE_APPLICATION_CREDENTIALS names a service
// account key the owner added to the Search Console property (GSC_SITE_URL names the property, else it is found), the
// property's sitemaps, the coverage of a sample of the sitemap's URLs and its top queries and pages. With --lighthouse,
// or without a key, one local Lighthouse run from the site's node_modules (skipped with the reason without one).
// The 28 days count from the first post-launch check that passed (docs/research/post-launch.json launchedAt); --force
// runs it earlier. Writes docs/research/field-check.json and field-check.md. No paid call.
// Usage: node scripts/field-check.mjs [--origin https://example.com] [--force] [--lighthouse]

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { cliArgs, runMain } from './lib/cli.mjs';
import { apiKey, cruxRecord, pageSpeed, redact, searchConsoleProperty, searchConsoleReport, serviceAccountToken } from './lib/google-field.mjs';
import { readJson, writeJson } from './lib/json-io.mjs';
import { runLighthouse } from './lib/lighthouse.mjs';

export const FIELD_DAYS = 28;

// Each source in its own try: one that fails is reported (its error without the key) and the rest still run.
const attempt = async (key, work) => { try { return await work(); } catch (error) { return { failed: redact(error.message, key) }; } };

export async function fieldCheck({ root = process.cwd(), origin = null, force = false, lighthouse = false, env = process.env, today = new Date(), fetchImpl = fetch, lighthouseRun = runLighthouse }) {
  const identity = await readJson(resolve(root, 'src/data/site-identity.json'), null);
  const site = (origin ?? identity?.origin ?? '').replace(/\/$/, '');
  if (!site) throw new Error('no origin: pass --origin or import the site identity');
  const launchedAt = (await readJson(resolve(root, 'docs/research/post-launch.json'), null))?.launchedAt ?? null;
  const days = launchedAt ? Math.floor((today.getTime() - new Date(launchedAt).getTime()) / 86400000) : null;
  if (!force && (days === null || days < FIELD_DAYS)) return { due: false, reason: days === null ? 'no post-launch check has passed yet (node scripts/post-launch.mjs)' : `launched ${days} day(s) ago; field data needs ${FIELD_DAYS}` };
  const key = apiKey(env);
  const noKey = { skipped: 'no API key: set PAGESPEED_API_KEY (or GOOGLE_API_KEY) in the environment, a free key of a Google Cloud project with the PageSpeed Insights and Chrome UX Report APIs on' };
  const report = { checkedAt: today.toISOString(), origin: site, launchedAt, daysSinceLaunch: days };
  report.crux = key ? { phone: await attempt(key, () => cruxRecord({ origin: site, key, formFactor: 'PHONE', fetchImpl })), desktop: await attempt(key, () => cruxRecord({ origin: site, key, formFactor: 'DESKTOP', fetchImpl })) } : noKey;
  report.pageSpeed = key ? await attempt(key, () => pageSpeed({ url: `${site}/`, key, fetchImpl })) : noKey;
  const credentialsPath = env.GOOGLE_APPLICATION_CREDENTIALS;
  if (credentialsPath) {
    report.searchConsole = await attempt(key, async () => {
      const token = await serviceAccountToken({ credentialsPath, fetchImpl });
      const property = await searchConsoleProperty({ origin: site, token, siteUrl: env.GSC_SITE_URL || null, fetchImpl });
      if (!property) return { skipped: `the service account cannot read a Search Console property of ${site}: add its email as a user of the property, or set GSC_SITE_URL` };
      const sitemap = await readFile(resolve(root, 'dist/sitemap.xml'), 'utf8').catch(() => '');
      const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
      return searchConsoleReport({ property, token, urls, fetchImpl, now: today });
    });
  } else report.searchConsole = { skipped: 'no GOOGLE_APPLICATION_CREDENTIALS: a service account key file the owner added as a user of the Search Console property' };
  // One Lighthouse run: PageSpeed's is one; a local run when asked, or when PageSpeed could not run.
  if (lighthouse || !key || report.pageSpeed.failed) report.lighthouse = await lighthouseRun({ root, url: `${site}/`, outPath: resolve(root, 'docs/research/lighthouse/field-check.json') });
  return { due: true, report };
}

const ms = (value) => (value === null || value === undefined ? 'n/a' : `${Math.round(value)} ms`);
export function fieldMarkdown(report) {
  const lines = [`# 上线 ${report.daysSinceLaunch ?? '?'} 天检查：${report.origin}`, '', `检查时间 ${report.checkedAt}。`, '', '## 真实用户数据（CrUX，p75）', ''];
  if (report.crux.skipped) lines.push(`- 未取：${report.crux.skipped}`);
  else for (const [form, record] of Object.entries(report.crux)) lines.push(record.failed ? `- ${form}：失败（${record.failed}）` : !record.available ? `- ${form}：${record.reason}` : `- ${form}：LCP ${ms(record.p75.lcp)}（${record.rating.lcp}），INP ${ms(record.p75.inp)}（${record.rating.inp}），CLS ${record.p75.cls ?? 'n/a'}（${record.rating.cls}）`);
  lines.push('', '## PageSpeed Insights（首页，手机）', '');
  const psi = report.pageSpeed;
  lines.push(psi.skipped ? `- 未取：${psi.skipped}` : psi.failed ? `- 失败：${psi.failed}` : `- Lighthouse ${psi.version}：${Object.entries(psi.categories).map(([id, score]) => `${id} ${score}`).join('，')}；Agentic Browsing ${psi.agentic.available ? psi.agentic.display : '无此类别'}（按 X/N 记，不换算成百分比）`);
  lines.push('', '## Search Console', '');
  const gsc = report.searchConsole;
  if (gsc.skipped || gsc.failed) lines.push(`- 未取：${gsc.skipped ?? gsc.failed}`);
  else {
    lines.push(`- 资源 ${gsc.property}，${gsc.range.start} 至 ${gsc.range.end}`);
    for (const map of gsc.sitemaps) lines.push(`- sitemap ${map.path}：${map.contents.map((item) => `${item.type} 提交 ${item.submitted}，已编入索引 ${item.indexed ?? 'n/a'}`).join('；')}${map.errors ? `，错误 ${map.errors}` : ''}`);
    lines.push(`- 抽查 ${gsc.inspected.length} 个网址的收录状态：${Object.entries(gsc.coverage).map(([state, count]) => `${state} ${count}`).join('，') || '无'}`);
    lines.push('', '查询词（按点击）：', '', ...gsc.queries.slice(0, 10).map((row) => `- ${row.query}：点击 ${row.clicks}，展示 ${row.impressions}，平均排名 ${row.position}`));
  }
  if (report.lighthouse) {
    const run = report.lighthouse;
    lines.push('', '## 本地 Lighthouse', '', run.skipped ? `- 未运行：${run.skipped}` : run.failed ? `- 失败：${run.failed}` : `- Lighthouse ${run.version}：${Object.entries(run.categories).map(([id, score]) => `${id} ${score}`).join('，')}；Agentic Browsing ${run.agentic.available ? run.agentic.display : run.agenticNote ?? '无此类别'}`);
  }
  return lines.join('\n');
}

runMain(import.meta.url, async () => {
  const { values } = cliArgs({ origin: { type: 'string' }, force: { type: 'boolean' }, lighthouse: { type: 'boolean' } });
  const result = await fieldCheck({ origin: values.origin ?? null, force: values.force === true, lighthouse: values.lighthouse === true });
  if (!result.due) { console.log(`field check not due: ${result.reason} (--force runs it now)`); return; }
  await writeJson(resolve('docs/research/field-check.json'), result.report);
  await writeFile(resolve('docs/research/field-check.md'), `${fieldMarkdown(result.report)}\n`);
  console.log('docs/research/field-check.json and field-check.md written');
});
