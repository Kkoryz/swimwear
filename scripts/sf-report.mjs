#!/usr/bin/env node
// 08's report back to Site Factory (its contract sf/handoff-report/v1, config/sf-contracts/handoff-report.schema.json):
// each page as built, the owner's to-do items and their status, and what 08 found that is Site Factory's to fix
// (issues: the content audit, design findings of the copy, the import's sections longer than their module holds,
// audit failures of the copy, and the layout plan's: section headings over three lines and titles too long, found
// before the build by scripts/plan-layout.mjs; a page whose pictures cannot reach the density band is the owner's and
// 08's, never a rewrite for Site Factory, owner 2026-11-14). Written as docs/research/sf-report.json and, for people, sf-report.md in Chinese.
// Only written: whether it goes to Site Factory is the owner's decision (Fable's 08-onward review, plan 5).
// Usage: node scripts/sf-report.mjs

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runMain } from './lib/cli.mjs';
import { ownerOf } from './lib/issue-owners.mjs';
import { readJson, writeJson } from './lib/json-io.mjs';
import { loadSitePages } from './lib/site-pages.mjs';

export const SF_REPORT_SCHEMA = 'sf/handoff-report/v1';
const sha256 = async (path) => (existsSync(path) ? createHash('sha256').update(await readFile(path)).digest('hex') : null);
const routeFile = (route) => (route === '/' ? 'index.html' : `${route.replace(/^\/|\/$/g, '')}/index.html`);

// The issues Site Factory fixes, from 08's reports: [{ source, route, section?, kind, detail }].
export function siteFactoryIssues({ content = null, review = null, imported = null, layout = null, plan = null } = {}) {
  return [
    ...(content?.issues ?? []).map((issue) => ({ source: 'content-audit', route: issue.route, kind: issue.kind, detail: [issue.field, issue.why].filter(Boolean).join(': ') })),
    ...(review?.findings ?? []).filter((finding) => finding.scope === 'content' && ['P0', 'P1'].includes(finding.severity) && !finding.resolution).map((finding) => ({ source: 'design-review', route: finding.route, section: finding.block, kind: 'design_finding', detail: finding.issue })),
    ...(imported?.overLength ?? []).map((item) => ({ source: 'import', route: item.route, section: item.sectionId, kind: 'over_length', detail: `${item.kind} in ${item.component}: ${item.words} words, the module holds ${item.maximum}` })),
    ...(imported?.jsonLdMarkdown ?? []).map((item) => ({ source: 'import', route: item.route ?? null, kind: 'json_ld_markdown', detail: JSON.stringify(item).slice(0, 200) })),
    ...(layout?.failures ?? []).filter((failure) => ownerOf(failure.issue) === 'site-factory').map((failure) => ({ source: 'layout-audit', route: failure.route, kind: failure.issue, detail: failure.detail ?? failure.message ?? '' })),
    ...(plan?.gate?.items ?? []).filter((item) => item.owner === 'site-factory').map((item) => ({ source: 'layout-plan', route: item.route, ...(item.block && item.block !== 'page' ? { section: item.block } : {}), kind: item.assertion, detail: [item.viewport, item.detail].filter(Boolean).join(': ') })),
  ];
}

export async function sfReport({ root = process.cwd(), at = new Date().toISOString() } = {}) {
  const data = (path) => readJson(resolve(root, path), null);
  const site = await data('site.json');
  const snap = site?.siteFactory ?? null;
  const core = await data('template-core.json');
  const pages = await loadSitePages(root);
  const todo = snap ? await readJson(resolve(snap, 'owner-todo.json'), null) : null;
  const signoff = await data('docs/research/release-signoff.json');
  // The layout plan once made, else the feasibility report (both scripts/plan-layout.mjs).
  const plan = (await data('docs/research/layout-plan.json')) ?? (await data('docs/research/feasibility.json'));
  const issues = siteFactoryIssues({ content: await data('docs/research/content-issues.json'), review: await data('docs/research/design-review.json'), imported: await data('docs/research/site-factory-import.json'), layout: await data('docs/research/authoring-layout-audit.json'), plan });
  const handoff = snap ? (await sha256(resolve(snap, 'handoff.json'))) ?? (await sha256(resolve(snap, 'authoring_package.json'))) : null;
  const report = {
    schema_version: SF_REPORT_SCHEMA,
    handoff_sha256: handoff ?? '0'.repeat(64),
    made_at: at,
    template: { commit: core?.commit ?? 'unknown', block_kinds_sha256: (await sha256(resolve(root, 'config/block-kinds.json'))) ?? '0'.repeat(64) },
    pages: pages.filter((page) => page.pageType !== 'blog_post').map((page) => ({ page_id: page.id, route: page.route, rendered: existsSync(resolve(root, 'dist', routeFile(page.route))), status: page.status ?? 'authored', components: [...new Set((page.blocks ?? []).map((block) => block.type))], missing_components: [] })),
    owner_items: (todo?.items ?? []).map((item) => ({ id: item.id, status: signoff?.items?.find((entry) => entry.id === `sf-${item.id}`)?.status ?? (item.blocking ? 'pending' : 'not_held') })),
    issues,
    notes_zh: issues.length ? `08 发现 ${issues.length} 处要由 Site Factory 改的问题（见 issues）；08 不改稿。` : '08 没有发现要由 Site Factory 改的问题。',
  };
  await writeJson(resolve(root, 'docs/research/sf-report.json'), report);
  const lines = [`# 08 给 Site Factory 的回报（${at.slice(0, 10)}）`, '', `交接包：${snap ?? '未知'}；模板 ${report.template.commit}；页面 ${report.pages.length} 个，已构建 ${report.pages.filter((page) => page.rendered).length} 个。`, '', '## 要 SF 改的问题', ''];
  if (!issues.length) lines.push('- 无');
  for (const issue of issues) lines.push(`- ${issue.route ?? ''}${issue.section ? ` ${issue.section}` : ''}：${issue.kind}（${issue.source}）${issue.detail ? `：${issue.detail}` : ''}`);
  lines.push('', '## 业主待办（交接包 owner/todo.json）', '');
  if (!report.owner_items.length) lines.push('- 无');
  for (const item of report.owner_items) lines.push(`- ${item.id}：${item.status}`);
  lines.push('', '只生成文件，是否转给 SF 由业主决定。');
  await writeFile(resolve(root, 'docs/research/sf-report.md'), `${lines.join('\n')}\n`);
  return report;
}

runMain(import.meta.url, async () => {
  const report = await sfReport();
  console.log(`sf-report: ${report.issues.length} issue(s) for Site Factory, ${report.owner_items.length} owner item(s) (docs/research/sf-report.md)`);
});
