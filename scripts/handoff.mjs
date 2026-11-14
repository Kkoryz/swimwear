#!/usr/bin/env node

// The pre-launch handoff (交接单, docs/research/handoff.json): what only the owner can give that the site still shows a
// stand-in for, in the columns agreed with Site Factory (2026-10-24), which merges it into the one sheet for the owner
// and reads the filled sheet back into its project (this pipeline never reads the sheet). It is the only place that
// says which photos were made by the image model (owner, 2026-10-24): the site itself carries no such mark. Made before
// launch, not during development; the launch preflight reads its list of the owner's real photos.
// Rows: the open release sign-off items (founding year, certificates, factory figures, clients, testimonials, cases,
// history, capabilities, real reviews), the contact details, placeholder prices and reviews in structured data, and
// one row per image position of the built site with what real photo should replace it. Operations this pipeline
// clears itself (analytics, registry, form delivery, alt text) are not rows.
// Usage: node scripts/handoff.mjs [--real <json list of Site Factory media file names the owner supplied as real>]

import { resolve } from 'node:path';
import { readBuiltPage } from './lib/built-site.mjs';
import { cliArgs, runMain } from './lib/cli.mjs';
import { readJson, writeJson } from './lib/json-io.mjs';
import { HANDOFF_SCHEMA, photoSources, realPhotoSrcs, standInForReal } from './lib/photo-sources.mjs';
import { placeholderProperties } from './lib/review-markup.mjs';
import { loadSitePages } from './lib/site-pages.mjs';
import { imageBriefs, siteTrade, tradeConfigPath } from './lib/trade.mjs';

export const COLUMNS = Object.freeze(['field_id', 'category', 'purpose', 'pages', 'current_placeholder', 'required', 'instructions', 'owner_value', 'source', 'status']);

// The sheet asks only for what is missing (owner, 2026-10-24): a value the project already has (a fact in facts.yaml,
// Site Factory's capabilities) is a row marked "已有，可改" and optional, with the value shown; what is invented for
// demonstration or empty is required.
export const STATUS = Object.freeze({ missing: '待填', have: '已有，可改', realOnly: '必须实拍替换', pagePending: '页面未定稿' });
// What each sign-off item asks of the owner, by id: [pattern, field_id, category, purpose, instructions, the project
// already has it]. Field ids are shared with Site Factory's rows (it merges by field_id).
const SIGNOFF_ROWS = [
  [/^founded$/, 'company:founded', '公司证明', '建厂年份', '核对；不对就改', true],
  [/^certifications$|^proof-certifications$/, 'company:certificates', '公司证明', '持有的证书（名称）', '核对；没有的删掉', true],
  [/^capabilities$/, 'company:capabilities', '公司证明', '生产能力清单', '逐条核对，删除做不到的，补上没列的', true],
  [/^proof-factory$/, 'proof:factory-figures', '公司证明', '工厂数据（月产能、产线数、员工数）', '填写真实数字；当前是示范值', false],
  [/^proof-clients$/, 'proof:clients', '评价与案例', '合作客户名称', '填写允许公开的真实客户名称；没有授权的不要填', false],
  [/^proof-testimonials$|^placeholder-testimonials$/, 'proof:testimonials', '评价与案例', '客户评价', '提供真实买家的评价原文、署名（职位和公司）和公开授权', false],
  [/^proof-caseStudies$|^placeholder-cases$/, 'proof:cases', '评价与案例', '客户案例', '提供真实订单案例：客户（经授权）、产品、数量、周期', false],
  [/^proof-history$/, 'proof:history', '公司证明', '发展历程', '填写真实的年份和事件；当前是示范值', false],
  [/^site-photos$/, 'photos:factory-team', '图片', '工厂、车间和团队实拍', '提供实拍照片（见图片行）', false],
  [/^review-source$/, 'review:source', '评价与案例', '结构化数据里的评价', '确认这些评价和评分都来自真实买家', false],
  [/^placeholder-/, null, '公司证明', '借用的内容', '换成自己的做法，或确认可以使用', false],
];
// Always asked when the site has certificates: their numbers and scans are never in the project.
const CERTIFICATE_NUMBERS = { field_id: 'company:certificate-numbers', category: '公司证明', purpose: '证书编号和扫描件', instructions: '每张证书的编号、有效期和扫描件' };
// Contact details: a value the project has is shown and optional; an empty one is required. A street address needs its
// street and number (a city alone is not one).
const CONTACT_FIELDS = [['email', '询盘邮箱'], ['phone', '电话（含国家区号）'], ['address', '公司完整地址（含街道门牌）'], ['hours', '营业时间（含时区）'], ['same_as', '社交媒体主页链接（LinkedIn、Instagram、Facebook 等）']];
const contactHas = (key, value) => (key === 'address' ? /\d/.test(value) : Boolean(value));

// The real photo to shoot for an image position: by its photography class, sharpened by what its section is about.
const PHOTO_OF_CLASS = {
  hero: '本页产品的成品大图（模特上身或场景，横幅构图，主体清晰）',
  product: '本页品类的成品实拍（平铺或模特上身，看得清版型和细节）',
  material: '面料特写（纹理、厚薄、印花或弹力）',
  lifestyle: '成品穿着或使用场景',
  process: '工厂车间实拍（裁剪、缝制、质检、打样或仓库）',
  portrait: '评价客户本人的照片（需本人书面同意）',
};
// A section's subject sharpens the photo only within the classes it fits (a product photo under "Factory-Direct
// Manufacturing" stays a product photo).
const PHOTO_OF_TOPIC = [
  [/packag|label|hang ?tag|branding/i, ['product', 'process', 'material'], '包装、吊牌和标签的实拍'],
  [/fabric|material|print|colour|color/i, ['material'], '本段所讲面料或印花的特写实拍'],
  [/quality|inspect|qc\b|testing/i, ['process'], '质检现场实拍'],
  [/factory|production|sewing|cutting|warehouse|sampl|develop/i, ['process'], '车间生产实拍（与本段内容对应的工序）'],
];
// shoot: a trade's own list by class (config/image-briefs.<trade>.json photoToShoot), over the manufacturer's classes
// and topics.
export function photoToShoot(kind, heading = '', blockType = '', shoot = null) {
  if (shoot) return shoot[kind] ?? '与本段内容对应的实拍照片';
  if (blockType === 'caseStudies') return '该案例订单的成品实拍（需客户同意公开）';
  const topic = PHOTO_OF_TOPIC.find(([pattern, kinds]) => kinds.includes(kind) && pattern.test(heading));
  return topic ? topic[2] : PHOTO_OF_CLASS[kind] ?? '与本段内容对应的实拍照片';
}
const decodeEntities = (text) => text.replace(/&(amp|lt|gt|quot|#39|apos);/g, (_, name) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'" })[name]);

// Every image position of one built page's main content, in order: { block, blockType, heading, src, alt } for a
// photo, { ..., slot } for an empty image slot. The block is the section (data-authoring-block) it sits in.
export function imagePositions(html) {
  const main = html.slice(html.indexOf('<main'), html.lastIndexOf('</main>') + 7);
  const positions = [];
  let block = { id: 'page', type: 'page', heading: '' };
  for (const match of main.matchAll(/<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1>|<img\b[^>]*>|<[a-z]+\b[^>]*\bdata-(?:authoring-block|media-slot)=[^>]*>/g)) {
    const tag = match[0];
    if (match[1]) { if (!block.heading) block.heading = decodeEntities(match[2].replace(/<[^>]+>/g, '').trim()); continue; }
    const attr = (name) => tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] ?? null;
    if (attr('data-authoring-block')) block = { id: attr('data-block-id') ?? attr('data-authoring-block'), type: attr('data-authoring-block'), heading: '' };
    const at = { block: block.id, blockType: block.type, heading: block.heading };
    if (tag.startsWith('<img')) { if (attr('src')) positions.push({ ...at, src: attr('src'), alt: decodeEntities(attr('alt') ?? '') }); continue; }
    if (attr('data-media-slot')) positions.push({ ...at, slot: attr('data-media-slot'), src: null, alt: '' });
  }
  return positions;
}

// How the handoff names a photo's origin (the one place it is said).
const SOURCE_NOW = { library: 'AI 生成图', site: 'Site Factory 提供的图（未确认为实拍）', real: '业主实拍', competitor: '竞品照片（开发期占位，正式版移除）', slot: '空图位' };

// The handoff rows. sourceOf(src) -> { source, kind } (lib/photo-sources.mjs); realSrcs: the owner's real photos;
// wording: a trade's own words for the sign-off rows (config/demo-proof.<trade>.json signoff: field id -> [purpose,
// instructions]) and the photos to shoot (photoToShoot).
export function handoffRows({ pages, signoff, contact, built, sourceOf, realSrcs = new Set(), identity = null, wording = {} }) {
  const rows = [];
  const row = (values) => rows.push(Object.fromEntries(COLUMNS.map((column) => [column, values[column] ?? (column === 'owner_value' ? '' : column === 'source' ? '08' : null)])));
  const asked = (have) => (have ? { required: '选填', status: STATUS.have } : { required: '必填', status: STATUS.missing });
  for (const item of (signoff?.items ?? []).filter((entry) => entry.status !== 'confirmed')) {
    const [, fieldId, category, ownPurpose, ownInstructions, have] = SIGNOFF_ROWS.find(([pattern]) => pattern.test(item.id)) ?? [null, null, '公司证明', item.id, '确认或替换', false];
    const field_id = fieldId ?? `signoff:${item.id}`;
    const [purpose, instructions] = wording.signoff?.[field_id] ?? [ownPurpose, ownInstructions];
    if (rows.some((existing) => existing.field_id === field_id)) continue;
    row({ field_id, category, purpose, pages: '', current_placeholder: item.description, instructions, ...asked(have) });
    if (field_id === 'company:certificates') row({ ...CERTIFICATE_NUMBERS, pages: '', current_placeholder: '', ...asked(false) });
  }
  // A logo the site made for itself (a drawn or typeset wordmark, site-brand.mjs) is the owner's to replace.
  if (identity && identity.source !== 'stage-00') row({ field_id: 'brand:logo', category: '品牌', purpose: '网站 logo 与图标（页头、浏览器标签、收藏图标）', pages: '全站', current_placeholder: identity.source === 'make-wordmark' ? 'AI 生成的纯文字标' : '按网站字体排的纯文字标', instructions: '有正式 logo 时提供（SVG 或大尺寸 PNG），没有就保留', ...asked(true) });
  if (contact?.placeholder) for (const [key, purpose] of CONTACT_FIELDS) {
    const value = [contact[key]].flat().filter(Boolean).join(', ');
    row({ field_id: `contact:${key}`, category: '联系方式', purpose, pages: '全站（页头、页脚、联系页）', current_placeholder: value, instructions: contactHas(key, value) ? '核对；不对就改' : '填写真实信息', ...asked(contactHas(key, value)) });
  }
  for (const page of pages) for (const property of placeholderProperties(page)) row({ field_id: `schema:${page.route}:${property}`, category: property.endsWith('offers') ? '价格' : '评价与案例', purpose: `${property}（产品页结构化数据）`, pages: page.route, current_placeholder: '占位', instructions: property.endsWith('offers') ? '填写真实的价格或起订价（含币种）' : '提供真实买家的评价或评分', ...asked(false) });
  for (const page of pages) {
    const html = built.get(page.route);
    if (!html) continue;
    imagePositions(html).forEach((position, index) => {
      const photo = position.src ? sourceOf(position.src) : { source: 'slot', kind: position.slot };
      if (position.src && !photo.source) return;
      const real = position.src && realSrcs.has(position.src);
      if (real) return;
      const kind = photo.kind ?? 'product';
      const mustBeReal = standInForReal({ kind }, position.src ?? '', realSrcs);
      row({
        field_id: `image:${page.route}:${position.block}:${index + 1}`, category: '图片', purpose: `${position.block}${position.heading ? `「${position.heading}」` : ''}的${kind === 'hero' ? '头图' : '配图'}`,
        pages: page.route, current_placeholder: `${SOURCE_NOW[photo.source] ?? photo.source}${position.src ? ` ${position.src}` : ''}${position.alt ? ` (${position.alt})` : ''}`,
        required: '必填', instructions: `${mustBeReal ? '必须实拍替换（AI 图会被当成真实的工厂、团队或客户）' : '建议实拍'}：${photoToShoot(kind, position.heading, position.blockType, wording.photoToShoot)}`,
        status: mustBeReal ? STATUS.realOnly : page.status === 'placeholder' ? STATUS.pagePending : STATUS.missing,
      });
    });
  }
  return rows;
}

export async function writeHandoff({ root = process.cwd(), realFiles = [] } = {}) {
  const pages = await loadSitePages(root);
  const built = new Map();
  for (const page of pages) built.set(page.route, await readBuiltPage(root, page.route));
  const siteMedia = await readJson(resolve(root, 'src/data/site-media.json'), null);
  const realSrcs = realPhotoSrcs(siteMedia, realFiles);
  const rows = handoffRows({
    pages,
    signoff: await readJson(resolve(root, 'docs/research/release-signoff.json'), null),
    contact: await readJson(resolve(root, 'src/data/site-contact.json'), null),
    built,
    sourceOf: photoSources({ plan: await readJson(resolve(root, 'docs/research/image-plan.json'), null), siteMedia }),
    realSrcs: new Set(realSrcs),
    identity: await readJson(resolve(root, 'src/data/site-identity.json'), null),
    wording: { signoff: (await readJson(tradeConfigPath('demo-proof', (await siteTrade(root)).trade))).signoff, photoToShoot: (await imageBriefs(root)).photoToShoot },
  });
  const data = { schemaVersion: HANDOFF_SCHEMA, madeAt: new Date().toISOString(), columns: COLUMNS, rows, realPhotos: realSrcs };
  await writeJson(resolve(root, 'docs/research/handoff.json'), data);
  return data;
}

runMain(import.meta.url, async () => {
  const { values } = cliArgs({ real: { type: 'string' } });
  const realFiles = values.real ? await readJson(resolve(values.real)) : [];
  const { rows, realPhotos } = await writeHandoff({ realFiles });
  const by = rows.reduce((counts, row) => ({ ...counts, [row.category]: (counts[row.category] ?? 0) + 1 }), {});
  console.log(`handoff: ${rows.length} rows (${Object.entries(by).map(([category, count]) => `${category} ${count}`).join(', ')}), ${rows.filter((row) => row.status === STATUS.realOnly).length} must be real photos, ${realPhotos.length} real photo files`);
});
