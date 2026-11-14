// The launch checklist (docs/research/launch-checklist.md): the preflight's holds grouped by who clears them — the
// owner, Site Factory, or this template's pipeline — in the owner's language, with the content issues Site Factory
// has to fix. One page to read before launch instead of a JSON report.

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
  identity_not_release_ready: ['owner', '确定正式的站点名称和品牌'],
  canonical_host_not_release_ready: ['owner', '确定正式域名'],
  privacy_page_missing: ['owner', '提供隐私政策正文'],
  site_retired: ['owner', '站点已下线'],
  paused_site_without_notice: ['owner', '暂停的站点需要一条对外说明'],
  upstream_uncommitted: ['site-factory', '内容包是在代码有未提交改动时生成的，需要用已提交的代码重新生成'],
  slot_manifest_mismatch: ['site-factory', '内容按旧的页面蓝图写的，需要按当前蓝图重新规划'],
  inherited: ['site-factory', 'Site Factory 自己的拦截项'],
  placeholder_page_present: ['site-factory', '还有页面是占位文案，需要 SF 写正文'],
  placeholder_structured_data: ['owner', '产品页结构化数据里还有占位的价格、评价或评分：提供真实的价格和真实买家评价（填进业主信息表，由 Site Factory 读回），不能签字放行'],
  review_markup_unconfirmed: ['owner', '结构化数据里有评价或评分：确认都来自真实买家（谷歌评价规则）后签字（pnpm signoff --confirm review-source）'],
  contact_path_missing: ['owner', '联系页上还没有邮箱、电话或 WhatsApp，也没有接好的询盘表单：提供联系方式或接好表单'],
};

export function checklistMarkdown(gate, { contentIssues = [], site = '' } = {}) {
  const groups = { owner: [], 'site-factory': [], template: [] };
  for (const hold of gate.holds) {
    // A code may carry a detail after a colon (inherited:<Site Factory's reason>).
    const [who, ask] = HOLDS[hold.code.split(':')[0]] ?? ['template', null];
    const pages = hold.items?.length ? `（涉及 ${hold.items.length} 个页面：${hold.items.slice(0, 3).join('、')}${hold.items.length > 3 ? ' 等' : ''}）` : '';
    groups[who].push(`- [ ] ${ask ?? hold.code}${pages}\n  - ${hold.detail}`);
  }
  if (contentIssues.length) {
    const kinds = {};
    for (const issue of contentIssues) kinds[issue.kind] = (kinds[issue.kind] ?? 0) + 1;
    groups['site-factory'].push(`- [ ] 修改文案问题 ${contentIssues.length} 处（清单见 docs/research/content-issues.md：${Object.entries(kinds).map(([kind, count]) => `${kind} ${count}`).join('，')}）`);
  }
  const lines = [`# 上线清单${site ? `：${site}` : ''}`, '', `状态：${gate.status === 'ready_for_deployment' ? '可以上线' : `不能上线，还有 ${gate.holds.length} 项拦截`}（检查时间 ${gate.checkedAt}）`, ''];
  for (const [who, title] of Object.entries(WHO)) {
    lines.push(`## ${title}（${groups[who].length}）`, '');
    lines.push(...(groups[who].length ? groups[who] : ['- 无']), '');
  }
  return lines.join('\n');
}
