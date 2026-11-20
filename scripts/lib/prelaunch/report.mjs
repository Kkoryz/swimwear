// The prelaunch reports in the owner's language (docs/research/prelaunch/*.md): one page per check, and the summary.

// A Markdown table of a header and rows of cells.
const markdownTable = (head, rows) => [head, head.map(() => '---'), ...rows].map((row) => `| ${row.join(' | ')} |`).join('\n');

export const TITLES = { links: '链接验收', cannibal: '抢词验收', near: '相近内容验收', owner_list: '业主资料清单（占位，不卡发布）', tech: '技术验收', html: 'HTML 规范验收（html-validate）', conflicts: '全站冲突验收（SF 站点事实库，本机跑）' };
export const MODES = { off: '关闭', report: '只报告', block: '卡发布' };
export const STATUSES = { off: '已关闭', passed: '通过', reported: '有问题（只报告）', blocked: '有问题（卡发布）', needs_local: '需要本机跑（不算通过）' };
const LEVELS = { issue: '问题', info: '提示' };
const ROWS_SHOWN = 300;

const cell = (value) => String(value ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
const list = (values = []) => [values].flat().filter(Boolean).slice(0, 5).join(' ') + ([values].flat().length > 5 ? ` 等 ${[values].flat().length} 处` : '');

// The table of one check's findings, its columns by check.
const TABLES = {
  links: (rows) => [['级别', '类型', '目标', '来自', '说明'], ...rows.map((row) => [LEVELS[row.level], row.problem ? `${row.kind}:${row.problem}` : row.kind, row.target, list(row.from), row.detail])],
  cannibal: (rows) => [['级别', '类型', '页面', '主词', '撞上的页面', '撞上的词（角色）'], ...rows.map((row) => [LEVELS[row.level], row.kind, row.route, row.query, row.other.route, `${row.other.query}（${row.other.role}）`])],
  near: (rows) => [['级别', '类型', '页面', '另一页', '相似度', '重复段落数', '最像的段落'], ...rows.map((row) => [LEVELS[row.level], row.pageType, row.route, row.other, row.similarity, row.paragraphCount, row.paragraphs[0] ? `${row.paragraphs[0].similarity}：${row.paragraphs[0].text.slice(0, 120)}` : ''])],
  owner_list: (rows) => [['类别', '要提供的内容', '当前值', '存放位置', '状态'], ...rows.map((row) => [row.label, row.item, row.value, row.where, row.status])],
  tech: (rows) => [['级别', '项目', '问题', '页面', '说明'], ...rows.map((row) => [LEVELS[row.level], row.kind, row.problem, row.route ?? '', row.detail])],
  html: (rows) => [['级别', '规则', '页面', '说明'], ...rows.map((row) => [LEVELS[row.level], row.problem, row.route ?? '', row.detail])],
  conflicts: (rows) => [['级别', '类型', '页面', '说明'], ...rows.map((row) => [LEVELS[row.level], row.kind, row.route ?? '', row.detail])],
};

export function checkMarkdown(report) {
  const lines = [`# ${TITLES[report.check]}`, '', `开关：${MODES[report.mode]}；结果：${STATUSES[report.status]}；问题 ${report.issues} 条，提示 ${report.info} 条（检查时间 ${report.checkedAt}${report.launch ? '，上线构建' : ''}）`, ''];
  for (const note of report.notes ?? []) lines.push(`- ${note}`);
  if (report.notes?.length) lines.push('');
  if (report.findings.length) {
    const [head, ...rows] = TABLES[report.check](report.findings.slice(0, ROWS_SHOWN));
    lines.push(markdownTable(head, rows.map((row) => row.map(cell))));
    if (report.findings.length > ROWS_SHOWN) lines.push('', `另有 ${report.findings.length - ROWS_SHOWN} 条见 ${report.check}.json`);
  } else if (report.status !== 'off') lines.push('无');
  // The near-duplicate pairs' paragraphs, each pair's in full.
  if (report.check === 'near') for (const row of report.findings.filter((finding) => finding.level === 'issue')) {
    lines.push('', `## ${row.route} 与 ${row.other}（${row.similarity}）`, '');
    for (const paragraph of row.paragraphs) lines.push(`- ${paragraph.similarity}：${cell(paragraph.text)}`, `  - ${row.other}：${cell(paragraph.other)}`);
  }
  return lines.join('\n');
}

export function summaryMarkdown(summary, { site = '' } = {}) {
  const overall = { passed: '全部通过', reported: '有问题，只报告，不卡发布', blocked: '有设成"卡发布"的验收没过：不能上线' }[summary.status];
  return [
    `# 上线前验收${site ? `：${site}` : ''}`, '',
    `结果：${overall}（检查时间 ${summary.checkedAt}${summary.launch ? '，上线构建' : '，非上线构建：noindex、robots.txt、sitemap 未查'}）`, '',
    markdownTable(['验收', '开关', '结果', '问题', '提示', '报告'], summary.checks.map((check) => [TITLES[check.check], MODES[check.mode], STATUSES[check.status], String(check.issues), String(check.info), check.report]).map((row) => row.map(cell))),
    '', '开关在 site.json 的 prelaunch：每项 false（关闭）、true 或 "report"（只报告，默认）、"block"（卡发布）；业主资料清单永远只报告。',
  ].join('\n');
}
