// The launch checklist (docs/research/launch-checklist.md): the preflight's holds grouped by who clears them — the
// owner, Site Factory, or this template's pipeline — in the owner's language, with the content issues Site Factory
// has to fix and the SEO audit's findings by their owner (lib/issue-owners.mjs), then its notices (what lowers the site
// without holding its release). One page to read before launch instead of a JSON report.
import { checklistGroupOf } from './issue-owners.mjs';

export const WHO = {
  owner: '站长（你来提供或确认）',
  'site-factory': 'Site Factory（内容和规划）',
  template: '模板流程（我来处理）',
};

// Each hold code: who clears it and what it asks, in a line. A code not listed is the template pipeline's to clear.
export const HOLDS = {
  placeholder_testimonial: ['owner', '把借用并匿名化的客户评价换成真实评价，或确认带着它们上线（pnpm signoff --confirm placeholder-testimonials）'],
  placeholder_case: ['owner', '把从其他厂商借来并匿名化的客户案例（A recent order）换成自己的真实订单，或确认带着它们上线（pnpm signoff --confirm placeholder-cases）'],
  placeholder_card: ['owner', '把从竞品借来的卡片内容（定制、面料、产品范围等）换成自己的，或确认带着它们上线（pnpm signoff --confirm placeholder-cards）'],
  placeholder_selling_point: ['owner', '把从竞品借来的卖点（为什么选我们）换成自己的，或确认带着它们上线（pnpm signoff --confirm placeholder-selling-points）'],
  placeholder_step: ['owner', '把从竞品借来的下单步骤换成自己的做法，或确认带着它们上线（pnpm signoff --confirm placeholder-steps）'],
  placeholder_order_route: ['owner', '把从竞品借来的下单路线（现货款、定制款、样品包等）换成自己的做法并写进 facts.yaml，或确认带着它们上线（pnpm signoff --confirm placeholder-order-routes）'],
  owner_signoff_pending: ['owner', '把示范数据换成真实数据后逐项确认（pnpm signoff --confirm <id>）'],
  release_signoff_missing: ['owner', '上线签核清单还没建立'],
  reference_photo_in_use: ['owner', '页面还在用竞品照片占位：提供真实产品照片，或决定改用生成图（site.json images: "generate"）'],
  verified_build_missing: ['template', '这一版还没跑完审计和整页评审（site-run 跑到 design-gate 通过才会记下已核验的版本）'],
  verified_build_mismatch: ['template', '核验之后源码又改过：改动的页面要重新审计和评审'],
  layout_audit_not_passed: ['template', '版式或导航审计没有通过，或还没跑'],
  design_review_not_current: ['template', '整页评审没通过，或评审的是旧截图'],
  handoff_missing: ['template', '上线前出交接单（pnpm handoff），列出业主要提供的内容和要换实拍的图'],
  image_not_approved: ['owner', '审批生成的图片（pnpm approve:images）'],
  image_alt_rules: ['template', '图片 alt 不合规（长度、image of、公司声明、同页重复、主词重复）：由产出或选定图片的一方改写 alt'],
  form_delivery_unconfigured: ['owner', '提供询盘表单的接收地址'],
  chat_undecided: ['owner', '决定是否开启在线客服'],
  site_not_registered: ['owner', '在站点注册表登记这个站（域名、部署位置）'],
  analytics_not_configured: ['owner', '配置访问统计（Umami）'],
  contact_details_stand_in: ['owner', '页面上还有示例形态的联系方式（555-01xx 号码、example 域名、to be confirmed）：换成真实信息'],
  contact_details_placeholder: ['owner', '提供真实的邮箱、电话、地址、营业时间和社交账号'],
  company_stand_in: ['owner', '结构化数据里的公司信息还是替身值（法定名称、法律形式、地址、成立年份、服务地域、社交主页、联系方式）：提供真实信息，写进 src/data/site-company.json 并从 standIns 去掉'],
  identity_not_release_ready: ['owner', '确定正式的站点名称和品牌'],
  canonical_host_not_release_ready: ['owner', '确定正式域名'],
  privacy_page_missing: ['owner', '提供隐私政策正文'],
  site_retired: ['owner', '站点已下线'],
  paused_site_without_notice: ['owner', '暂停的站点需要一条对外说明'],
  upstream_uncommitted: ['site-factory', '内容包是在代码有未提交改动时生成的，需要用已提交的代码重新生成'],
  slot_manifest_mismatch: ['site-factory', '内容按旧的页面蓝图写的，需要按当前蓝图重新规划'],
  inherited: ['site-factory', 'Site Factory 自己的拦截项'],
  collection_mismatch: ['site-factory', '隐私页“本站收集什么”表（包里的 data_practices）和本站实际收集的不一致：按本站的服务开关（project.yaml site_services，或 src/data/site-runtime.json）改正后重新出包'],
  placeholder_page_present: ['site-factory', '还有页面是占位文案，需要 SF 写正文'],
  placeholder_structured_data: ['owner', '产品页结构化数据里还有占位的价格、评价或评分：提供真实的价格和真实买家评价（填进业主信息表，由 Site Factory 读回），不能签字放行'],
  review_markup_unconfirmed: ['owner', '结构化数据里有评价或评分：确认都来自真实买家（谷歌评价规则）后签字（pnpm signoff --confirm review-source）'],
  // The owner's pack (lib/preflight/owner-pack-checks.mjs; four-site audit 2026-11-17).
  owner_pack_missing: ['owner', '业主资料包缺项：公司法定主体（法定名称，隐私政策里的数据控制者），或网站有表单收集个人信息时的隐私事实（询盘保存多久、个人数据问谁）。写进 src/data/site-company.json 或 src/data/site-proof.json 的 privacy'],
  scope_unconfirmed: ['owner', '页面写了公司提供、但你还没确认的服务项：逐项标明 做 / 不做 / 通过合作方，答完后签字（pnpm signoff --confirm <id>）'],
  needs_owner_number: ['owner', '页面上需要你本人数字才能答的问题（价格或起价、最短合同期、退出条款、交期、起订量、付款方式）：给出数字，或说明不公开时怎么定价、怎么拿报价，答完后签字（pnpm signoff --confirm <id>）'],
  nginx_csp_stale: ['template', '重新生成 Nginx 配置（pnpm build:nginx-config）并把安全头片段装到服务器：这一版的内联脚本不在内容安全策略（CSP）里，上线后会被浏览器拦下'],
  claude_seo_audit_missing: ['template', '发布构建还没跑 claude-seo 全盘审计（site-run 的 claude-seo-audit 步骤），或审计的不是这一版发布构建和服务器配置'],
  claude_seo_audit_blocking: ['template', 'claude-seo 审计里代码核对和模型复核都成立的 Critical / High 问题：逐条处理（问题清单 findings.json、报告和行动计划在 docs/research/seo-audit-N/）'],
  prelaunch_blocked: ['template', '上线前验收里设成"卡发布"的项目有问题：按 docs/research/prelaunch/summary.md 逐项处理，或在 site.json 的 prelaunch 里把它改回 "report"'],
  contact_path_missing: ['owner', '联系页上还没有邮箱、电话或 WhatsApp，也没有接好的询盘表单：提供联系方式或接好表单'],
};

// The SEO audit's findings (docs/research/seo-audit.json) in the owner's language: what each asks. A code not listed
// shows its code. Failures are checklist items of their owner's group; warnings are notices, named by their owner.
export const SEO_FINDINGS = {
  cta_target_without_form: '询价按钮指向的页面（或询价、联系页本身）没有表单：在这页放上询盘表单，或把按钮改指到有表单的页',
  nav_links_noindex: '页眉或页脚菜单链到了不被收录（noindex）的页面：把页面写完，或从菜单里拿掉',
  image_weight: '图片太重（首屏立即加载的图超过 200 KB 会拦截；首图超过 300 KB、内容图超过 200 KB 是提示）',
  lcp_fetchpriority_missing: '页面首屏第一张图没有 fetchpriority="high"',
  image_eager_offscreen: '首屏以外的图片被设成立即加载（loading="eager"），应改为懒加载',
  nap_mismatch: '页面上的电话、邮箱、地址或服务地区和结构化数据里的不一致：确认真实的电话、邮箱、地址和服务地区（src/data/site-company.json serviceArea）',
  channel_without_handle: '文案提到了 WhatsApp、Skype、Viber、WeChat、Telegram、Zoom 等联系渠道，但联系方式里没有这个渠道的号码或链接：提供号码或链接，或请 Site Factory 从文案里去掉这个渠道',
  process_reused: '同一张工厂或流程图出现在 3 个以上页面：重新做图片计划（pnpm plan:images）给其余页面配自己的图',
  description_templated: '多页 meta description 用的是同一个句式模板：请 Site Factory 按页改写',
  trust_value_malformed: '信任条的数字读不通（数字后面跟虚词，或标签重复了数值的单位）：请 Site Factory 改',
  page_figure_malformed: '页面自己的数字带读不通（标签重复了数值的单位，或数字被截断）：模板的 page-figures 步骤要重选',
  promise_without_asset: '文案承诺可下载的指南、模板或 PDF，但页面上没有文件，也没有资料索取表单：提供文件，或让 Site Factory 改写',
  control_without_name: '链接、按钮或表单控件没有可访问名称（读屏软件和 AI 代理读不出它是什么）',
  inbound_links_low: '可收录页面从其他页面正文进来的链接少于 3 条：请 Site Factory 补内链',
  lastmod_uniform: 'sitemap 里所有页面的 lastmod 都是同一天',
  thin_vs_siblings: '页面词数不到同类页面中位数的 60%：请 Site Factory 补内容',
  stand_in_lexicon: '文案提到已停用的产品名（如 Skype）：请 Site Factory 改',
  unreferenced_assets: '发布构建里有没有任何页面引用的文件',
};
const seoLine = (code, list) => {
  const routes = [...new Set(list.map((entry) => entry.route))];
  return `${SEO_FINDINGS[code] ?? code}（SEO 审计 ${code}，${list.length} 处：${routes.slice(0, 3).join('、')}${routes.length > 3 ? ' 等' : ''}）\n  - ${list[0].detail ?? ''}`;
};
// Findings by code, in the order first seen.
const byCode = (entries) => [...entries.reduce((codes, entry) => codes.set(entry.issue, [...(codes.get(entry.issue) ?? []), entry]), new Map())];

// Notices: the owner's to read, never a hold. Each code's line; a code not listed shows its code.
export const NOTICES = {
  claude_seo_audit_not_current: 'claude-seo 审计不是这一版发布构建的，也没有这一版的逐条复查；site.json 的 launchFlow 关掉了审计或把复查设成只报告，所以只提示',
  claude_seo_audit_open: 'claude-seo 审计里不拦截上线的问题（Medium、Low，以及核对未成立的 Critical / High）：按行动计划处理',
  entity_profiles_missing: '实体建设：上线后建 LinkedIn 公司页、Bing Places 等档案（清单见交接单的“实体建设”组），建好后把网址补进 sameAs（pnpm handoff -- --same-as <网址>）',
  people_missing: '网站上没有具名人员（关于页的团队、博文作者）：可以不公开，但会拉低 E-E-A-T 和 GEO（看不出谁在做、谁写的）。愿意公开时，把姓名、职位、从业年限和一句简介写进 src/data/site-proof.json 的 team',
};

// seo: the SEO audit's report (docs/research/seo-audit.json), its findings routed by their owner.
export function checklistMarkdown(gate, { contentIssues = [], site = '', seo = null } = {}) {
  const groups = { owner: [], 'site-factory': [], template: [] };
  for (const hold of gate.holds) {
    // A code may carry a detail after a colon (inherited:<Site Factory's reason>).
    const [base, extra] = hold.code.split(':');
    // A claude-seo audit finding that holds names who clears it (claude_seo_audit_blocking:<owner|site-factory|template>).
    const [who, ask] = base === 'claude_seo_audit_blocking' && WHO[extra] ? [extra, HOLDS[base][1]] : HOLDS[base] ?? ['template', null];
    const pages = hold.items?.length ? `（涉及 ${hold.items.length} 个页面：${hold.items.slice(0, 3).join('、')}${hold.items.length > 3 ? ' 等' : ''}）` : '';
    groups[who].push(`- [ ] ${ask ?? hold.code}${pages}\n  - ${hold.detail}`);
  }
  if (contentIssues.length) {
    const kinds = {};
    for (const issue of contentIssues) kinds[issue.kind] = (kinds[issue.kind] ?? 0) + 1;
    groups['site-factory'].push(`- [ ] 修改文案问题 ${contentIssues.length} 处（清单见 docs/research/content-issues.md：${Object.entries(kinds).map(([kind, count]) => `${kind} ${count}`).join('，')}）`);
  }
  for (const [code, list] of byCode(seo?.failures ?? [])) groups[checklistGroupOf(code)].push(`- [ ] ${seoLine(code, list)}`);
  const lines = [`# 上线清单${site ? `：${site}` : ''}`, '', `状态：${gate.status === 'ready_for_deployment' ? '可以上线' : `不能上线，还有 ${gate.holds.length} 项拦截`}（检查时间 ${gate.checkedAt}）`, ''];
  for (const [who, title] of Object.entries(WHO)) {
    lines.push(`## ${title}（${groups[who].length}）`, '');
    lines.push(...(groups[who].length ? groups[who] : ['- 无']), '');
  }
  const notices = [...(gate.notices ?? []).map((notice) => `- ${NOTICES[notice.code] ?? notice.code}\n  - ${notice.detail}`), ...byCode(seo?.warnings ?? []).map(([code, list]) => `- ${WHO[checklistGroupOf(code)]}：${seoLine(code, list)}`)];
  if (notices.length) lines.push(`## 提示（不拦截上线）（${notices.length}）`, '', ...notices, '');
  return lines.join('\n');
}
