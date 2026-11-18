// Prelaunch check 4, the owner's materials (owner 2026-11-18: a list that stands in, never a hold): every value the
// site still shows as a stand-in, gathered in one table, each row "待业主提供" (to be supplied by the owner) until
// the owner's sign-off confirms it. Sources: the release sign-off (docs/research/release-signoff.json: Site Factory's
// owner to-do, the stand-in proof, the company's stand-ins), the contact details' stand-ins (src/data/site-contact.json),
// the proof's certificates without a number and its stand-in figures (src/data/site-proof.json), the articles' stand-in
// claims (blog-posts.json placeholders), the photo slots and the generated photos (docs/research/image-slots.json,
// image-plan.json). Nothing is judged; each row says where its value is kept.

export const CATEGORIES = Object.freeze({ phone: '电话', email: '邮箱', address: '地址', hours: '营业时间', reviews: '评价', certificates: '证书编号', figures: '占位数字', evidence: '案例与记录', images: '占位图', company: '公司资料', facts: '业主事实', other: '其他' });
export const PENDING = '待业主提供';
export const CONFIRMED = '已确认';

// The category of a sign-off item, by its id and what it asks: an owner fact (Site Factory's facts.yaml stand-ins) and
// the hard-information sheet first, whatever words their text holds.
export function signoffCategory(item) {
  const text = `${item.id} ${item.description ?? ''}`.toLowerCase();
  if (/facts\.yaml|owner fact|业主事实/.test(text)) return 'facts';
  if (/hard_info|硬信息/.test(text)) return 'figures';
  if (/phone|whatsapp|电话/.test(text)) return 'phone';
  if (/contact\.email|\bemail\b|邮箱/.test(text)) return 'email';
  if (/address|地址/.test(text)) return 'address';
  if (/hours|营业时间/.test(text)) return 'hours';
  if (/testimonial|review|评价/.test(text)) return 'reviews';
  if (/certif|licen[cs]e|证书|资质/.test(text)) return 'certificates';
  if (/number|figure|price|fee|statistic|数字|价格/.test(text)) return 'figures';
  if (/photo|image|图/.test(text)) return 'images';
  if (/case/.test(text)) return 'evidence';
  if (/^company-|legal|founding|proof-|client|team/.test(text)) return 'company';
  return 'other';
}

const row = (category, item, where, { status = PENDING, value = '', id = null } = {}) => ({ category, label: CATEGORIES[category], item, value, where, status, ...(id ? { id } : {}) });

// data: { signoff, contact, proof, posts, imageSlots, imagePlan }.
export function ownerListRows({ signoff = null, contact = null, proof = null, posts = [], imageSlots = null, imagePlan = null } = {}) {
  const rows = [];
  for (const item of signoff?.items ?? []) rows.push(row(signoffCategory(item), item.description ?? item.id, 'docs/research/release-signoff.json', { status: item.status === 'confirmed' ? CONFIRMED : PENDING, id: item.id }));
  // The contact details Site Factory marked stand-ins (the sign-off asks for them as a whole).
  for (const field of contact?.placeholder ? contact.standIns ?? [] : []) {
    const category = { phone: 'phone', email: 'email', address: 'address', hours: 'hours', whatsapp: 'phone' }[field] ?? 'other';
    rows.push(row(category, `联系方式 ${field}`, 'src/data/site-contact.json', { value: String(contact[field] ?? '') }));
  }
  for (const item of proof?.certifications ?? []) if (!item.number) rows.push(row('certificates', `${item.name ?? '证书'}${item.issuer ? `（${item.issuer}）` : ''}：证书编号`, 'src/data/site-proof.json certifications'));
  for (const item of proof?.standIn ? proof.factory ?? [] : []) rows.push(row('figures', `${item.label}`, 'src/data/site-proof.json factory', { value: String(item.value ?? '') }));
  for (const item of proof?.standIn ? proof.testimonials ?? [] : []) rows.push(row('reviews', `评价：${item.author ?? item.name ?? ''}`, 'src/data/site-proof.json testimonials', { value: String(item.quote ?? '').slice(0, 80) }));
  for (const post of posts.filter((entry) => entry.status !== 'placeholder')) {
    for (const item of post.placeholders ?? []) rows.push(row(['number', 'figure', 'price', 'statistic'].includes(item.kind) ? 'figures' : ['review', 'testimonial'].includes(item.kind) ? 'reviews' : ['case', 'test_result'].includes(item.kind) ? 'evidence' : 'other', `博客 /blog/${post.slug}/ ${item.id}（${item.kind}）：${String(item.needed ?? item.text ?? '').slice(0, 100)}`, `src/data/blog-posts.json ${post.slug}`, { id: `${post.slug}#${item.id}` }));
  }
  for (const page of imageSlots?.pages ?? []) rows.push(row('images', `图片位（${page.slots?.length ?? page.count ?? ''}）`, `docs/research/image-slots.json ${page.route ?? ''}`));
  const generated = (imagePlan?.entries ?? []).filter((entry) => ['generated', 'approved'].includes(entry.status) || entry.origin === 'generated');
  if (generated.length) rows.push(row('images', `AI 生成的示意照片 ${generated.length} 张（${[...new Set(generated.map((entry) => entry.kind))].join('、')}）：可换成业主的真实照片`, 'docs/research/image-plan.json'));
  // By category, in CATEGORIES' order (the sort keeps each category's own order).
  const order = Object.keys(CATEGORIES);
  return rows.sort((left, right) => order.indexOf(left.category) - order.indexOf(right.category));
}
