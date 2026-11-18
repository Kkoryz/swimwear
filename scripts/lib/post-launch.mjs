// What the weekly post-launch check reports (scripts/post-launch.mjs; four-site audit 2026-11-17, Fable's plan P-1,
// P-3): the live pages against the release that was deployed (claude-seo seo-drift's comparison on what search
// engines read, lib/seo-snapshot.mjs), the content due for a refresh, and the summary for the owner.

import { pageSnapshot, snapshotDrift } from './seo-snapshot.mjs';
import { lastModified } from './page-dates.mjs';

// A page unchanged for six months is due for a refresh (Fable's plan P-3); blog posts follow the blog's own schedule.
export const REFRESH_AFTER_DAYS = 183;

// The live snapshot of the release's routes: { pages: { route: snapshot } }, and the routes that did not answer 200.
// fetchPage(url) -> { status, body }.
export async function liveSnapshot(origin, routes, fetchPage, concurrency = 4) {
  const pages = {};
  const failed = [];
  let next = 0;
  const worker = async () => {
    while (next < routes.length) {
      const route = routes[next];
      next += 1;
      const response = await fetchPage(`${origin}${route}`);
      if (response.status === 200) pages[route] = pageSnapshot(response.body);
      else failed.push(`${route} ${response.status}`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, routes.length) }, worker));
  return { pages, failed };
}

// What differs between the deployed release's snapshot and the live pages, by level. A route that did not answer is
// "page_removed" in the drift: it is reported once, as failed.
export function liveDrift(release, live) {
  const answered = { pages: Object.fromEntries(Object.entries(release.pages).filter(([route]) => live.pages[route])) };
  const changes = snapshotDrift(answered, live);
  return { critical: changes.filter((change) => change.level === 'critical'), warning: changes.filter((change) => change.level === 'warning'), failed: live.failed };
}

// Indexable content pages whose content has not changed for REFRESH_AFTER_DAYS (src/data/page-dates.json; an article
// by its own dateModified), oldest first, and those with no recorded date. Blog posts are left to the blog schedule.
export function refreshList(pages, dates, { today = new Date(), indexable = () => true, afterDays = REFRESH_AFTER_DAYS } = {}) {
  const due = [];
  const undated = [];
  for (const page of pages.filter((item) => indexable(item) && item.pageType !== 'blog_post' && item.status !== 'placeholder')) {
    const modified = lastModified(page, dates);
    if (!modified) { undated.push(page.route); continue; }
    const days = Math.floor((today.getTime() - new Date(`${modified}T00:00:00Z`).getTime()) / 86400000);
    if (days >= afterDays) due.push({ route: page.route, modified, days });
  }
  return { afterDays, due: due.sort((a, b) => b.days - a.days), undated };
}

// The owner's summary of one weekly check, in Chinese like the launch checklist.
export function postLaunchMarkdown(summary) {
  const lines = [`# 上线后检查：${summary.origin}`, '', `检查时间 ${summary.checkedAt}，上线于 ${summary.launchedAt ?? '（还没有通过的线上核查）'}。结论：${summary.passed ? '线上正常' : '线上有问题，见下'}。`, ''];
  lines.push('## 线上核查（verify-live）', '', ...(summary.live.problems.length ? summary.live.problems.map((problem) => `- [ ] ${problem.check}：${problem.detail}`) : ['- 无问题']), '');
  const drift = summary.liveDrift;
  lines.push('## 线上页面和本次发布是否一致（SEO 快照比对）', '');
  if (drift.skipped) lines.push(`- 未比对：${drift.skipped}`, '');
  else lines.push(...(drift.critical.length || drift.failed.length ? [...drift.failed.map((item) => `- [ ] 打不开：${item}`), ...drift.critical.map((change) => `- [ ] ${change.route} ${change.rule} ${change.detail}`.trim())] : [`- 一致（比对 ${drift.compared} 页）`]), ...drift.warning.map((change) => `- 提示：${change.route} ${change.rule}`), '');
  lines.push('## 相对已确认基线的变化', '', `- ${summary.baseline.drift}`, `- ${summary.baseline.accept}`, '');
  lines.push('## IndexNow', '', `- ${summary.indexNow.skipped ? `没有提交：${summary.indexNow.skipped}` : `${summary.indexNow.dryRun ? '试运行，会提交' : '已提交'} ${summary.indexNow.urls} 个网址`}`, '');
  const refresh = summary.refresh;
  lines.push(`## 待刷新的内容（超过 ${Math.round(refresh.afterDays / 30)} 个月没改）`, '', ...(refresh.due.length ? refresh.due.map((item) => `- [ ] ${item.route}（最后修改 ${item.modified}，${item.days} 天）`) : ['- 无']), ...(refresh.undated.length ? [`- 没有修改日期记录：${refresh.undated.join('、')}`] : []), '', '博客文章按博客的发布计划走，不在这里列。', '');
  if (summary.lighthouse) {
    const run = summary.lighthouse;
    lines.push('## Lighthouse', '', run.skipped ? `- 未运行：${run.skipped}` : run.failed ? `- 运行失败：${run.failed}` : `- Lighthouse ${run.version}（${run.formFactor ?? 'mobile'}）：${Object.entries(run.categories).map(([id, score]) => `${id} ${score}`).join('，')}；Agentic Browsing ${run.agentic.available ? run.agentic.display : (run.agenticNote ?? '无此类别')}`, '');
  }
  return lines.join('\n');
}
