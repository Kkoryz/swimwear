// Content contract shared by the Site Factory importer, the Astro renderer and the audits.
// A page owns meaning (route, SEO, copy, links, item counts) and may name a pattern variant for a block;
// it never carries CSS instructions.

import { MEDIA_KINDS } from './rules.mjs';
import { dataErrors } from './visual-data.mjs';

export const AUTHORING_SCHEMA_VERSION = 'seo-site-authoring-v1';

export const BLOCK_TYPES = Object.freeze([
  'intro', 'featureGrid', 'splitMedia', 'gallery', 'process', 'proof', 'faq', 'cta',
  'band', 'iconList', 'figure', 'stats', 'table', 'logos', 'testimonials', 'form', 'sources',
  // The owner's proof (scripts/lib/site-proof.mjs): certificates and client case studies.
  'certifications', 'caseStudies',
  // How an order starts (Site Factory order_routes, scripts/lib/site-trust.mjs): route cards and a list of the rest.
  'orderRoutes',
  // The company's ways to be reached, from its own details (lib/site-contact.mjs): no copy of its own.
  'contactChannels',
  // The owner's people (lib/site-people.mjs) and what the site collects, from its configuration (lib/data-practices.mjs:
  // no copy of its own, the privacy page's site-level module).
  'team', 'dataPractices',
  // The pages a page links to outside its copy, as cards before the FAQ (import-site-factory.mjs placeRelated).
  'relatedPages',
  // Site Factory's style cards of a line page (a photo, the name, a sentence, a quote link) and its borrowed client case.
  'styleGrid', 'orderCase',
  // The blog (scripts/lib/blog.mjs): an article section, and the hub's list of posts.
  'prose', 'postList',
  // Site Factory's price cards and colour swatches (owner 2026-11-10: structured blocks read better than text).
  'pricing', 'swatches',
]);

// Pattern variants a block may request; the renderer falls back to the template's variant when absent.
// Template-wide treatments in template-variants.json `components` (each value has styles in template.css/patterns.css).
export const TEMPLATE_VARIANTS = Object.freeze({
  hero: ['plain', 'media-banner', 'media-overlay', 'media-split', 'media-form'],
  intro: ['text', 'gallery'],
  featureGrid: ['outlined', 'plain'],
  splitMedia: ['alternate', 'media-end', 'media-start'],
  proof: ['band', 'panel', 'panel-media', 'dark'],
  faq: ['accordion', 'two-column', 'open-list'],
  cta: ['band', 'inline', 'image-band', 'dark', 'form', 'link-band'],
  // Where the breadcrumb trail sits: above the hero, or under it where the header lies over the hero's photo (as the
  // reference's interior pages, the photo starting at the top of the window).
  breadcrumbs: ['top', 'after-hero'],
});

// The blog's designs (template-variants.json components.blog, from the reference blog): the hub's header and cards,
// the post's layout. The validation and the renderer's types (src/lib/site-data.ts) both read these.
export const BLOG_VARIANTS = Object.freeze({
  hub: { header: /** @type {const} */ (['hero', 'plain', 'featured', 'banner']), card: /** @type {const} */ (['title', 'wide', 'bordered', 'meta']) },
  post: { layout: /** @type {const} */ (['sidebar-start', 'narrow', 'paper', 'sidebar-end']) },
});

export const BLOCK_VARIANTS = Object.freeze({
  intro: ['text', 'gallery'],
  splitMedia: ['single', 'dual', 'column', 'tinted', 'wide', 'stacked', 'numbered', 'framed', 'panel'],
  gallery: ['grid', 'mosaic', 'circles', 'label-tiles', 'caption-panel', 'product-cards', 'band'],
  featureGrid: ['cards', 'numbered', 'columns', 'boxed', 'media', 'outline-numbered', 'icon-cards', 'bullets', 'icons'],
  cta: ['band', 'inline', 'image-band', 'dark', 'form', 'link-band'],
  iconList: ['checks', 'icons'],
  band: ['left', 'center'],
  process: ['circles', 'ring', 'band', 'photo-cards', 'timeline', 'list'],
  relatedPages: ['links', 'tiles'],
  stats: ['row', 'trust-bar', 'tiles', 'lines', 'kv'],
  faq: ['accordion', 'two-column', 'open-list', 'bars', 'cards', 'dark-cards'],
  table: ['grid', 'checks', 'cards'],
  // grid: the cards side by side; carousel: one sliding row with controls (Track.astro).
  testimonials: ['grid', 'carousel'],
  // grid: tiles in rows; strip: one sliding row with controls; marquee: one row that moves by itself.
  logos: ['grid', 'strip', 'marquee'],
  // grid: the certificate cards in rows; strip: one sliding row with controls (the competitor's certificate row).
  certifications: ['grid', 'strip'],
  // cards: a card per channel with its icon; row: one line of icon links; list: a list, icon at the start.
  contactChannels: ['cards', 'row', 'list'],
  // plain: the intro's words beside the form; media: a photo under the intro.
  form: ['plain', 'media'],
});

// The module names a competitor section can be given (docs/research/analysis/section-modules.json): a block with one of
// its variants, a text section, a whole-block module, an owner-data module, or skip.
export const SECTION_MODULES = Object.freeze([
  ...TEMPLATE_VARIANTS.hero.map((variant) => `hero:${variant}`),
  // A text section is intro/proof whatever its variant (the site's intro treatment decides).
  ...Object.entries(BLOCK_VARIANTS).filter(([block]) => block !== 'intro').flatMap(([block, list]) => list.map((variant) => `${block}:${variant}`)),
  'intro/proof', 'band', 'figure', 'form', 'owner:logos', 'owner:testimonials', 'skip',
]);

// Cardinality policy for repeatable blocks: [min, max] items.
export const CARDINALITY = Object.freeze({
  featureGrid: [2, 4],
  gallery: [1, 12],
  process: [2, 12],
  faq: [1, 20],
  // Related links wrap as an inline list; Site Factory links a page to its hub, siblings and related pages.
  links: [0, 24],
  iconList: [2, 12],
  stats: [2, 6],
  logos: [2, 16],
  testimonials: [1, 6],
  certifications: [1, 8],
  caseStudies: [1, 3],
  orderRoutes: [1, 8],
  styleGrid: [1, 16],
  orderCase: [1, 3],
  tableRows: [1, 20],
  tableColumns: [2, 6],
  formFields: [1, 10],
  sources: [1, 30],
  pricing: [2, 4],
  swatches: [3, 24],
  team: [1, 8],
});

const isText = (value) => typeof value === 'string' && value.trim().length > 0;
const isRoute = (value) => typeof value === 'string' && value.startsWith('/') && value.endsWith('/') && !value.includes('//');
const isHref = (value) => isRoute(value) || (typeof value === 'string' && /^https?:\/\//.test(value));

function checkParagraphs(errors, where, value, { optional = false } = {}) {
  if (optional && value == null) return;
  if (!Array.isArray(value) || value.length === 0 || !value.every(isText)) errors.push(`${where}.paragraphs must be a non-empty array of text`);
}

function checkCount(errors, where, list, [min, max]) {
  if (!Array.isArray(list)) errors.push(`${where} must be an array`);
  else if (list.length < min || list.length > max) errors.push(`${where} has ${list.length} item(s); supported range is ${min}-${max}`);
}

function checkLink(errors, where, link) {
  if (!link || !isText(link.label) || !isHref(link.href)) errors.push(`${where} needs label and a route or absolute href`);
}

function checkMedia(errors, where, media) {
  if (media != null && (!isText(media.src) || typeof media.alt !== 'string')) errors.push(`${where}.media needs src and alt`);
}

const optionalText = (errors, where, value, name) => { if (value != null && !isText(value)) errors.push(`${where}.${name} must be text when present`); };

// What a section asks to show (Site Factory's visuals: a photo's subject and setting, or data; lib/visual-data.mjs).
// Site Factory's photo candidates (photoCandidates, lib/sf-sections.mjs splitVisuals) are its photo visuals.
function checkVisuals(errors, where, visuals, field = 'visuals') {
  if (visuals == null) return;
  if (!Array.isArray(visuals)) { errors.push(`${where}.${field} must be an array`); return; }
  for (const [index, visual] of visuals.entries()) {
    const at = `${where}.${field}[${index}]`;
    if (field === 'photoCandidates' && visual?.type !== 'photo') { errors.push(`${at}.type must be photo`); continue; }
    if (!isText(visual?.id)) errors.push(`${at}.id is required`);
    if (visual?.type === 'photo') { if (!isText(visual.content)) errors.push(`${at}.content (what the photo shows) is required`); }
    else if (visual?.type === 'data') errors.push(...dataErrors(visual.data, `${at}.data`));
    else errors.push(`${at}.type must be photo or data`);
  }
}

function checkBlock(errors, where, block) {
  if (!block || typeof block !== 'object') { errors.push(`${where} must be an object`); return; }
  if (!BLOCK_TYPES.includes(block.type)) { errors.push(`${where} has unknown block type: ${block.type}`); return; }
  if (!isText(block.id)) errors.push(`${where}.id is required`);
  if (block.mediaKind !== undefined && block.mediaKind !== null && !MEDIA_KINDS.includes(block.mediaKind)) errors.push(`${where}.mediaKind must be a photography class (${MEDIA_KINDS.join(', ')}) or null`);
  if (block.variant != null && !(BLOCK_VARIANTS[block.type] || []).includes(block.variant)) errors.push(`${where}.variant ${block.variant} is not a ${block.type} variant`);
  optionalText(errors, where, block.eyebrow, 'eyebrow');
  checkVisuals(errors, where, block.visuals);
  checkVisuals(errors, where, block.photoCandidates, 'photoCandidates');
  switch (block.type) {
    case 'intro':
    case 'splitMedia':
    case 'proof':
      // A block that goes on from another (continues: its id) has no heading of its own.
      if (block.continues != null) {
        if (!isText(block.continues)) errors.push(`${where}.continues must be a block id`);
        optionalText(errors, where, block.heading, 'heading');
      } else if (!isText(block.heading)) errors.push(`${where}.heading is required`);
      checkParagraphs(errors, where, block.paragraphs);
      checkMedia(errors, where, block.media);
      break;
    case 'band':
      if (!isText(block.heading)) errors.push(`${where}.heading is required`);
      checkParagraphs(errors, where, block.paragraphs, { optional: true });
      if (block.cta != null) checkLink(errors, `${where}.cta`, block.cta);
      checkMedia(errors, where, block.media);
      break;
    case 'figure':
      optionalText(errors, where, block.heading, 'heading');
      checkParagraphs(errors, where, block.paragraphs, { optional: true });
      checkMedia(errors, where, block.media);
      break;
    case 'featureGrid':
      optionalText(errors, where, block.heading, 'heading');
      checkCount(errors, `${where}.items`, block.items, CARDINALITY.featureGrid);
      checkParagraphs(errors, where, block.paragraphs, { optional: true });
      for (const [index, item] of (block.items || []).entries()) {
        if (!isText(item?.heading)) errors.push(`${where}.items[${index}].heading is required`);
        checkParagraphs(errors, `${where}.items[${index}]`, item?.paragraphs);
        if (item?.placeholder != null && typeof item.placeholder !== 'boolean') errors.push(`${where}.items[${index}].placeholder must be true or false`);
      }
      if (block.span != null && !(Number.isInteger(block.span) && block.span > 0)) errors.push(`${where}.span must be a positive integer`);
      break;
    case 'iconList':
      optionalText(errors, where, block.heading, 'heading');
      checkParagraphs(errors, where, block.paragraphs, { optional: true });
      checkCount(errors, `${where}.items`, block.items, CARDINALITY.iconList);
      for (const [index, item] of (block.items || []).entries()) {
        if (!isText(item?.text)) errors.push(`${where}.items[${index}].text is required`);
        optionalText(errors, `${where}.items[${index}]`, item?.heading, 'heading');
        if (item?.placeholder != null && typeof item.placeholder !== 'boolean') errors.push(`${where}.items[${index}].placeholder must be true or false`);
      }
      break;
    case 'stats':
      optionalText(errors, where, block.heading, 'heading');
      checkParagraphs(errors, where, block.paragraphs, { optional: true });
      checkCount(errors, `${where}.items`, block.items, CARDINALITY.stats);
      for (const [index, item] of (block.items || []).entries()) {
        if (!isText(item?.value) || !isText(item?.label)) errors.push(`${where}.items[${index}] needs value and label`);
        optionalText(errors, `${where}.items[${index}]`, item?.unit, 'unit');
        optionalText(errors, `${where}.items[${index}]`, item?.note, 'note');
      }
      break;
    case 'pricing':
      optionalText(errors, where, block.heading, 'heading');
      checkParagraphs(errors, where, block.paragraphs, { optional: true });
      checkCount(errors, `${where}.items`, block.items, CARDINALITY.pricing);
      for (const [index, item] of (block.items || []).entries()) {
        if (!isText(item?.heading) || !isText(item?.text) || !isText(item?.price?.amount)) errors.push(`${where}.items[${index}] needs heading, price.amount and text`);
        for (const field of ['unit', 'note']) optionalText(errors, `${where}.items[${index}].price`, item?.price?.[field], field);
      }
      break;
    case 'swatches':
      optionalText(errors, where, block.heading, 'heading');
      checkParagraphs(errors, where, block.paragraphs, { optional: true });
      checkCount(errors, `${where}.items`, block.items, CARDINALITY.swatches);
      for (const [index, item] of (block.items || []).entries()) {
        if (!isText(item?.name)) errors.push(`${where}.items[${index}].name is required`);
        if (item?.colour != null && !/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(item.colour)) errors.push(`${where}.items[${index}].colour must be a hex colour (#rrggbb)`);
        optionalText(errors, `${where}.items[${index}]`, item?.composition, 'composition');
      }
      break;
    case 'table':
      optionalText(errors, where, block.heading, 'heading');
      checkCount(errors, `${where}.columns`, block.columns, CARDINALITY.tableColumns);
      checkCount(errors, `${where}.rows`, block.rows, CARDINALITY.tableRows);
      // A cell may be empty (the source has no value there: nothing is filled in); a row says something.
      for (const [index, row] of (block.rows || []).entries()) {
        if (!Array.isArray(row) || row.length !== (block.columns || []).length || !row.every((cell) => typeof cell === 'string') || !row.some(isText)) errors.push(`${where}.rows[${index}] must have one cell per column, not all empty`);
      }
      for (const key of ['paragraphs', 'notes']) if (block[key] !== undefined && !(Array.isArray(block[key]) && block[key].every(isText))) errors.push(`${where}.${key} must be a list of paragraphs`);
      break;
    case 'logos':
      optionalText(errors, where, block.heading, 'heading');
      checkCount(errors, `${where}.items`, block.items, CARDINALITY.logos);
      for (const [index, item] of (block.items || []).entries()) {
        if (!isText(item?.name)) errors.push(`${where}.items[${index}].name is required`);
        checkMedia(errors, `${where}.items[${index}]`, item?.media);
      }
      if (block.links != null) {
        if (!Array.isArray(block.links)) errors.push(`${where}.links must be an array`);
        else for (const [index, link] of block.links.entries()) checkLink(errors, `${where}.links[${index}]`, link);
      }
      break;
    case 'testimonials':
      optionalText(errors, where, block.heading, 'heading');
      checkCount(errors, `${where}.items`, block.items, CARDINALITY.testimonials);
      for (const [index, item] of (block.items || []).entries()) {
        if (!isText(item?.quote) || !isText(item?.author)) errors.push(`${where}.items[${index}] needs quote and author`);
        for (const field of ['headline', 'role', 'company', 'country']) optionalText(errors, `${where}.items[${index}]`, item?.[field], field);
        if (item?.placeholder != null && typeof item.placeholder !== 'boolean') errors.push(`${where}.items[${index}].placeholder must be true or false`);
      }
      break;
    case 'certifications':
      optionalText(errors, where, block.heading, 'heading');
      checkCount(errors, `${where}.items`, block.items, CARDINALITY.certifications);
      for (const [index, item] of (block.items || []).entries()) {
        if (!isText(item?.name)) errors.push(`${where}.items[${index}].name is required`);
        for (const field of ['issuer', 'scope', 'validUntil']) optionalText(errors, `${where}.items[${index}]`, item?.[field], field);
        // a certificate's number and a look-up link are never on a page (owner 2026-11-19: "不显示不要编号")
        for (const field of ['number', 'lookupUrl']) if (item?.[field] != null) errors.push(`${where}.items[${index}].${field} is never shown on a page (owner 2026-11-19)`);
        checkMedia(errors, `${where}.items[${index}]`, item?.logo);
        if (item?.url != null && !isHref(item.url)) errors.push(`${where}.items[${index}].url must be a route or an http(s) url`);
      }
      break;
    case 'orderRoutes':
      optionalText(errors, where, block.heading, 'heading');
      checkCount(errors, `${where}.items`, block.items, CARDINALITY.orderRoutes);
      for (const [index, item] of (block.items || []).entries()) {
        if (!isText(item?.heading) || !isText(item?.text)) errors.push(`${where}.items[${index}] needs heading and text`);
        if (item?.placeholder != null && typeof item.placeholder !== 'boolean') errors.push(`${where}.items[${index}].placeholder must be true or false`);
      }
      break;
    case 'caseStudies':
      optionalText(errors, where, block.heading, 'heading');
      checkCount(errors, `${where}.items`, block.items, CARDINALITY.caseStudies);
      for (const [index, item] of (block.items || []).entries()) {
        if (!isText(item?.client) || !isText(item?.title) || !isText(item?.summary)) errors.push(`${where}.items[${index}] needs client, title and summary`);
        if (!Array.isArray(item?.results) || !item.results.length || !item.results.every((result) => isText(result?.value) && isText(result?.label))) errors.push(`${where}.items[${index}].results needs value and label items`);
        if (item?.href != null && !isRoute(item.href)) errors.push(`${where}.items[${index}].href must be a route`);
      }
      break;
    case 'contactChannels':
      optionalText(errors, where, block.heading, 'heading');
      break;
    case 'dataPractices':
      optionalText(errors, where, block.heading, 'heading');
      // Site Factory's table (lib/data-practices.mjs dataPracticesBlock): every row an id and its three columns.
      if (block.practices !== undefined) {
        if (!Array.isArray(block.practices?.rows) || !block.practices.rows.length) errors.push(`${where}.practices needs its rows`);
        for (const [index, row] of (block.practices?.rows ?? []).entries()) if (!['id', 'what', 'recorded', 'why'].every((key) => isText(row?.[key]))) errors.push(`${where}.practices.rows[${index}] needs id, what, recorded and why`);
      }
      break;
    case 'team':
      optionalText(errors, where, block.heading, 'heading');
      checkCount(errors, `${where}.items`, block.items, CARDINALITY.team);
      for (const [index, item] of (block.items || []).entries()) {
        if (!isText(item?.name) || !isText(item?.role) || !/^[a-z0-9-]+$/.test(item?.anchor ?? '')) errors.push(`${where}.items[${index}] needs name, role and anchor`);
        optionalText(errors, `${where}.items[${index}]`, item?.bio, 'bio');
        if (item?.years != null && !(Number.isInteger(item.years) && item.years > 0)) errors.push(`${where}.items[${index}].years must be a positive whole number`);
      }
      break;
    case 'form':
      optionalText(errors, where, block.heading, 'heading');
      checkParagraphs(errors, where, block.paragraphs, { optional: true });
      checkCount(errors, `${where}.fields`, block.fields, CARDINALITY.formFields);
      for (const [index, field] of (block.fields || []).entries()) {
        if (!isText(field?.label) || !['text', 'email', 'tel', 'textarea', 'url', 'select', 'date', 'number'].includes(field?.kind)) errors.push(`${where}.fields[${index}] needs a label and a kind (text, email, tel, textarea, url, select, date, number)`);
        if (field?.kind === 'select' && !(Array.isArray(field.options) && field.options.length >= 2 && field.options.every(isText))) errors.push(`${where}.fields[${index}] is a select: it needs two or more options`);
        optionalText(errors, `${where}.fields[${index}]`, field?.purpose, 'purpose');
      }
      if (block.request !== undefined && !(block.request === 'resource' && isText(block.requestType))) errors.push(`${where}.request must be "resource" with a requestType`);
      if (!isText(block.submitLabel)) errors.push(`${where}.submitLabel is required`);
      if (['ready', 'connected'].includes(block.status) && !(isText(block.endpoint) && block.endpoint.startsWith('/api/'))) errors.push(`${where}: a live form needs a same-origin /api/ endpoint`);
      if (block.consent && !(isText(block.consent.label) && isText(block.consent.privacyRoute))) errors.push(`${where}.consent needs a label and a privacyRoute`);
      break;
    case 'sources':
      checkCount(errors, `${where}.items`, block.items, CARDINALITY.sources);
      for (const [index, item] of (block.items || []).entries()) {
        if (!isText(item?.title) || !/^https?:\/\//.test(item?.url ?? '')) errors.push(`${where}.items[${index}] needs a title and an absolute http(s) url`);
        optionalText(errors, `${where}.items[${index}]`, item?.publisher, 'publisher');
        if (item?.retrieved !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(item.retrieved)) errors.push(`${where}.items[${index}].retrieved must be a YYYY-MM-DD date`);
      }
      break;
    case 'gallery':
      optionalText(errors, where, block.heading, 'heading');
      checkCount(errors, `${where}.items`, block.items, CARDINALITY.gallery);
      for (const [index, item] of (block.items || []).entries()) {
        optionalText(errors, `${where}.items[${index}]`, item?.caption, 'caption');
        if (item?.href != null && !(isText(item.caption) && isHref(item.href))) errors.push(`${where}.items[${index}] with href needs a caption and a route or absolute href`);
        checkMedia(errors, `${where}.items[${index}]`, item?.media);
      }
      if (block.links != null) {
        if (!Array.isArray(block.links)) errors.push(`${where}.links must be an array`);
        else for (const [index, link] of block.links.entries()) checkLink(errors, `${where}.links[${index}]`, link);
      }
      break;
    case 'process':
      optionalText(errors, where, block.heading, 'heading');
      checkParagraphs(errors, where, block.paragraphs, { optional: true });
      checkCount(errors, `${where}.steps`, block.steps, CARDINALITY.process);
      // provides: what the client gives at this step; duration: how long it takes, as written ("10–15 days").
      if (Array.isArray(block.steps) && !block.steps.every((step) => isText(step) || (isText(step?.text) && ['heading', 'provides', 'duration'].every((field) => step[field] == null || isText(step[field])) && (step.placeholder == null || typeof step.placeholder === 'boolean')))) errors.push(`${where}.steps must be text or {heading?, text, provides?, duration?, placeholder?}`);
      break;
    case 'prose':
      if (!isText(block.heading) || !isText(block.anchor)) errors.push(`${where} needs heading and anchor`);
      // A section written as an ordered body (lib/blog.mjs validates its parts) has its paragraphs there.
      if (!(Array.isArray(block.body) && block.body.length)) checkParagraphs(errors, where, block.paragraphs);
      break;
    case 'postList':
      if (!Array.isArray(block.items) || !block.items.length) errors.push(`${where}.items must list posts`);
      for (const [index, item] of (block.items || []).entries()) if (!isText(item?.title) || !isRoute(item?.href)) errors.push(`${where}.items[${index}] needs title and route`);
      if (!(Number.isInteger(block.pagination?.page) && Number.isInteger(block.pagination?.pages) && isRoute(block.pagination?.base))) errors.push(`${where}.pagination needs page, pages and base`);
      break;
    case 'faq':
      // (No heading: the block goes on from the FAQ before it.)
      optionalText(errors, where, block.heading, 'heading');
      checkCount(errors, `${where}.items`, block.items, CARDINALITY.faq);
      for (const [index, item] of (block.items || []).entries()) {
        if (!isText(item?.question) || !isText(item?.answer)) errors.push(`${where}.items[${index}] needs question and answer`);
      }
      break;
    case 'styleGrid':
      optionalText(errors, where, block.heading, 'heading');
      checkCount(errors, `${where}.items`, block.items, CARDINALITY.styleGrid);
      for (const [index, item] of (block.items || []).entries()) if (!isText(item?.name) || !isText(item?.intro)) errors.push(`${where}.items[${index}] needs name and intro`);
      checkLink(errors, `${where}.cta`, block.cta);
      break;
    case 'orderCase':
      optionalText(errors, where, block.heading, 'heading');
      checkCount(errors, `${where}.items`, block.items, CARDINALITY.orderCase);
      for (const [index, item] of (block.items || []).entries()) {
        if (!isText(item?.product) || !isText(item?.text)) errors.push(`${where}.items[${index}] needs product and text`);
        if (item?.placeholder != null && typeof item.placeholder !== 'boolean') errors.push(`${where}.items[${index}].placeholder must be true or false`);
      }
      break;
    case 'relatedPages':
      optionalText(errors, where, block.heading, 'heading');
      checkCount(errors, `${where}.links`, block.links, [1, CARDINALITY.links[1]]);
      for (const [index, link] of (block.links || []).entries()) checkLink(errors, `${where}.links[${index}]`, link);
      break;
    case 'cta':
      optionalText(errors, where, block.heading, 'heading');
      if (block.paragraphs != null) checkParagraphs(errors, where, block.paragraphs);
      checkLink(errors, `${where}.cta`, block.cta);
      if (block.secondaryCta != null) checkLink(errors, `${where}.secondaryCta`, block.secondaryCta);
      checkCount(errors, `${where}.links`, block.links, CARDINALITY.links);
      for (const [index, link] of (block.links || []).entries()) checkLink(errors, `${where}.links[${index}]`, link);
      break;
  }
}

export function validateAuthoringPage(page, where = 'page') {
  const errors = [];
  if (!page || typeof page !== 'object') return [`${where} must be an object`];
  if (!isText(page.id)) errors.push(`${where}.id is required`);
  if (!isRoute(page.route)) errors.push(`${where}.route must start and end with /`);
  if (!isText(page.pageType)) errors.push(`${where}.pageType is required`);
  if (!['authored', 'placeholder', 'hold'].includes(page.status)) errors.push(`${where}.status must be authored, placeholder or hold`);
  if (!isText(page.seo?.title) || !isText(page.seo?.description) || !isRoute(page.seo?.canonical)) errors.push(`${where}.seo needs title, description and a route canonical`);
  if (!Array.isArray(page.jsonLd) || !page.jsonLd.every((item) => item && typeof item === 'object' && item['@type'])) errors.push(`${where}.jsonLd must be an array of typed objects`);
  if (page.structuredDataPlaceholders != null && !(Array.isArray(page.structuredDataPlaceholders) && page.structuredDataPlaceholders.every((item) => isText(item?.['@type']) && Array.isArray(item.properties) && item.properties.every(isText)))) errors.push(`${where}.structuredDataPlaceholders must list { "@type", properties: [names] }`);
  if (!isText(page.hero?.heading)) errors.push(`${where}.hero.heading is required`);
  optionalText(errors, `${where}.hero`, page.hero?.eyebrow, 'eyebrow');
  if (page.hero?.cta != null) checkLink(errors, `${where}.hero.cta`, page.hero.cta);
  if (page.hero?.secondaryCta != null) checkLink(errors, `${where}.hero.secondaryCta`, page.hero.secondaryCta);
  if (!Array.isArray(page.blocks) || page.blocks.length === 0) errors.push(`${where}.blocks must be a non-empty array`);
  const ids = new Set();
  for (const [index, block] of (page.blocks || []).entries()) {
    checkBlock(errors, `${where}.blocks[${index}]`, block);
    if (block?.id && ids.has(block.id)) errors.push(`${where}.blocks[${index}] duplicates block id ${block.id}`);
    ids.add(block?.id);
  }
  return errors;
}

export function validateAuthoringPages(pages) {
  if (!Array.isArray(pages)) return ['authoring pages must be an array'];
  const errors = [];
  const routes = new Set();
  for (const [index, page] of pages.entries()) {
    errors.push(...validateAuthoringPage(page, `pages[${index}]${page?.id ? `(${page.id})` : ''}`));
    if (routes.has(page?.route)) errors.push(`pages[${index}] duplicates route ${page.route}`);
    routes.add(page?.route);
  }
  return errors;
}

export function assertAuthoringPages(pages) {
  const errors = validateAuthoringPages(pages);
  if (errors.length) throw new Error(`Invalid authoring pages:\n${errors.join('\n')}`);
  return pages;
}
