// A page assembled around Site Factory's copy (import-site-factory.mjs): the site plan's child-page cards, the enquiry
// form, the owner's proof, the sources, the style grid, the client case and the related pages, each placed by one rule
// (lib/block-position.mjs), then the whole page laid out in its blueprint's slot order. Every step records in the
// mapping what it placed, and every Site Factory section must be used exactly once.

import { indexBefore, openingEnd } from './block-position.mjs';
import { dataPracticesBlock, isPrivacyPolicy } from './data-practices.mjs';
import { leadFormBlock } from './lead-form.mjs';
import { BLUEPRINTS, REQUIRED_BLOCKS, requiredBlocks, VARIANT_BLOCKS } from './page-blueprints.mjs';
import { childCards, childPages, relatedPages } from './site-plan.mjs';
import { ownerSlotsOf, proofBlock } from './site-proof.mjs';
import { placeResourceForm } from './resource-promise.mjs';
import { slotBlockId, slotOfBlockId } from './slot-blocks.mjs';

// The blueprint's slot order is the page's block order, and each block renders with its slot's module (the competitor
// section it follows). A block no slot names (the sources list) stays right before the block it preceded.
export function orderBySlots(blocks, mapping, slots = []) {
  const index = new Map(slots.map((slot, order) => [slot.id, order]));
  const bySection = new Map(mapping.filter((entry) => entry.slotId).map((entry) => [entry.sectionId, entry.slotId]));
  const structuredSlot = (type) => slots.find((slot) => slot.fill === 'structured' && slot.block === type)?.id;
  const slotOf = (block) => {
    const named = slotOfBlockId(block.id);
    if (named) return named;
    if (block.sourceSectionIds?.length && bySection.has(block.sourceSectionIds[0])) return bySection.get(block.sourceSectionIds[0]);
    // A resource request form is no enquiry form: it keeps its place by the copy that lists the resources.
    if (block.type === 'cta' || (block.type === 'form' && block.request !== 'resource')) return slots.find((slot) => slot.block === block.type)?.id;
    if (['stats', 'table', 'process'].includes(block.type) && !block.sourceSectionIds?.length) return structuredSlot(block.type);
    return undefined;
  };
  const ids = blocks.map(slotOf);
  const keys = new Array(blocks.length);
  let next = slots.length;
  for (let position = blocks.length - 1; position >= 0; position -= 1) {
    keys[position] = index.has(ids[position]) ? index.get(ids[position]) : next - 0.001;
    next = keys[position];
  }
  const keyed = blocks.map((block, position) => {
    const id = ids[position];
    const key = keys[position];
    const slot = slots.find((item) => item.id === id);
    const variant = slot?.variant && !block.variant && VARIANT_BLOCKS.has(block.type) ? { variant: slot.variant } : {};
    return { block: { ...block, ...variant }, key, position };
  });
  return keyed.sort((left, right) => left.key - right.key || left.position - right.position).map((item) => item.block);
}

// Assembly ledger: every 07 section is used exactly once (placed in a block, or replaced by structured data that
// states the same facts). A section left out or placed twice fails the import instead of silently changing the page.
export function assertSectionsUsedOnce(page, mapping) {
  const counts = new Map(page.sections.map((item) => [item.section_id, 0]));
  for (const entry of mapping) if (counts.has(entry.sectionId)) counts.set(entry.sectionId, counts.get(entry.sectionId) + 1);
  const wrong = [...counts].filter(([, count]) => count !== 1);
  if (wrong.length) throw new Error(`${page.page_id}: sections not used exactly once: ${wrong.map(([id, count]) => `${id} (${count})`).join(', ')}`);
}

// Site-plan slots (stage 09 assembly): child-page cards built from pages.json labels and links, no new copy.
// The first goes after the key figures (or the intro), later ones before the FAQ.
export function placePlanSlots(blocks, mapping, { planned, pagesPlan, blueprints = BLUEPRINTS }) {
  const planSlots = (blueprints[planned.page_type] || []).filter((slot) => slot.fill === 'plan');
  planSlots.forEach((slot, order) => {
    const parentId = slot.source === 'children:self' ? planned.page_id : slot.source.split(':')[1];
    const children = childPages(pagesPlan, parentId).filter((child) => child.page_id !== planned.page_id);
    if (!children.length) { mapping.push({ sectionId: `plan.${slot.id}`, blockType: null, rule: `slot ${slot.id}: no child pages in the site plan` }); return; }
    // The page's own copy already leads to every child page (Site Factory's entry cards, each linking its service): no
    // second list of the same pages (the hotel hub, rewritten as thirteen entry cards, showed them twice).
    const linked = new Set(JSON.stringify(blocks).match(/\]\((\/[^)\s]*)\)/g)?.map((link) => link.slice(2, -1)) ?? []);
    if (children.every((child) => linked.has(child.url))) { mapping.push({ sectionId: `plan.${slot.id}`, blockType: null, rule: `slot ${slot.id}: the page's own copy links every child page` }); return; }
    const block = { id: slotBlockId('plan', slot.id), type: 'gallery', sourceSectionIds: [], ...childCards(slot, children) };
    const after = (type) => blocks.findIndex((item) => item.type === type) + 1;
    blocks.splice(order === 0 ? after('stats') || after('intro') : indexBefore(blocks, ['faq', 'cta']), 0, block);
    mapping.push({ sectionId: `plan.${slot.id}`, blockType: 'gallery', rule: `slot ${slot.id}: ${children.length} child pages from the site plan` });
  });
}

// What a page cannot do without (lib/page-blueprints.mjs REQUIRED_BLOCKS), before the closing call.
export { REQUIRED_BLOCKS };
export const CHANNELS_HEADING = 'Contact details';
// practices: the privacy page's table as the package gives it (AuthoredPage.data_practices), or null.
export function placeRequiredBlocks(blocks, mapping, { planned, hero = null, practices = null }) {
  for (const type of requiredBlocks(planned.page_type, planned.page_id)) {
    // The enquiry form is required; a resource request form on the page is not one.
    if (blocks.some((block) => block.type === type && block.request !== 'resource')) continue;
    const block = type === 'form' ? leadFormBlock(freeBlockId(blocks, 'form')) : { id: freeBlockId(blocks, 'channels'), type: 'contactChannels', heading: CHANNELS_HEADING };
    blocks.splice(indexBefore(blocks, ['cta']), 0, block);
    mapping.push({ sectionId: `required.${type}`, blockType: type, rule: `a ${planned.page_type} page needs its ${type}` });
  }
  // A page offering guides, templates or downloads with no file to take carries the resource request form
  // (lib/resource-promise.mjs; owner 2026-11-17), the enquiry form's endpoint with request_type=resource.
  const resource = placeResourceForm(blocks, { id: planned.page_id, pageType: planned.page_type, hero });
  if (resource) mapping.push({ sectionId: 'required.resourceForm', blockType: 'form', rule: `a page that offers resources carries the resource request form (${resource.fields.find((field) => field.name === 'resource').kind === 'select' ? `${resource.fields.find((field) => field.name === 'resource').options.length - 1} resources named` : 'the visitor names the resource'})` });
  // The privacy policy says what the site collects (lib/data-practices.mjs), after Site Factory's text (four-site audit
  // 2026-11-17); the terms, a privacy-type page too, do not. The package's table (Site Factory's data_practices, on its
  // privacy page only) is the one shown when it gives one. A page holding a table already gets no second one (Site
  // Factory integ deb67119, 2026-11-17: the privacy page has one table).
  if (planned.page_type === 'privacy' && (practices || isPrivacyPolicy({ route: planned.url, label: planned.label })) && !blocks.some((block) => block.type === 'dataPractices')) {
    if (blocks.some((block) => block.type === 'table')) {
      mapping.push({ sectionId: 'required.dataPractices', blockType: null, rule: `the privacy policy holds a table already: no second one${practices ? ' (the package\'s data_practices is not shown)' : ''}` });
    } else {
      blocks.splice(indexBefore(blocks, ['cta']), 0, dataPracticesBlock(freeBlockId(blocks, 'data-practices'), practices));
      mapping.push({ sectionId: 'required.dataPractices', blockType: 'dataPractices', rule: practices ? 'the privacy policy says what this site collects (the package\'s data_practices)' : 'the privacy policy says what this site collects (its configuration)' });
    }
  }
}

// Site slots (stage 09 assembly from site-level inputs): the enquiry form from the form contract, before the closing CTA.
export function placeSiteSlots(blocks, mapping, { planned, blueprints = BLUEPRINTS }) {
  for (const slot of (blueprints[planned.page_type] || []).filter((item) => item.fill === 'site' && item.block === 'form')) {
    blocks.splice(indexBefore(blocks, ['cta']), 0, leadFormBlock(slot.id));
    mapping.push({ sectionId: `site.${slot.id}`, blockType: 'form', rule: `slot ${slot.id}: enquiry form from config/lead-form.json` });
  }
}

// Owner slots: the site's proof (src/data/site-proof.json, the owner's data, never Site Factory's), before the FAQ or
// the closing call to action (the order routes: after the page's opening); the blueprint's order places them when every
// section names its slot. A page's own client case (07 cases, placeCases) takes the place of the stand-in case studies.
export function placeOwnerSlots(blocks, mapping, { planned, proof, blueprints = BLUEPRINTS, trust = null, testimonials = null, cases = null }) {
  // The slots the page's tree name adds (site-proof.mjs PAGE_PROOF_SLOTS: the case studies page's case cards) fill a page
  // Site Factory gives no case of its own; one it gives cases shows those alone (site13 blind audit 2026-11-17 H-2: the
  // stand-in cards and the page's own cases told different projects).
  for (const slot of ownerSlotsOf(blueprints[planned.page_type] || [], planned.page_type, planned.page_id)) {
    if (slot.id === 'caseStudies' && cases?.length) { mapping.push({ sectionId: `owner.${slot.id}`, blockType: null, rule: `slot ${slot.id}: the page's own client case takes its place` }); continue; }
    // A package that gives the page its cases and gives none (cases: []) means none here: no stand-in case studies take
    // the slot (Site Factory 1113d took the hotel home's cases off; the stand-ins would have come back in their place).
    if (slot.id === 'caseStudies' && Array.isArray(cases) && !slot.page) { mapping.push({ sectionId: `owner.${slot.id}`, blockType: null, rule: `slot ${slot.id}: the package gives this page no client case` }); continue; }
    const block = proofBlock(slot.id, proof, { route: planned.url, trust, testimonials });
    if (!block) { mapping.push({ sectionId: `owner.${slot.id}`, blockType: null, rule: `slot ${slot.id}: no owner data in src/data/site-proof.json` }); continue; }
    blocks.splice(block.type === 'orderRoutes' ? openingEnd(blocks) : afterKinds(blocks, mapping, AFTER_KINDS[slot.id]) ?? indexBefore(blocks, ['faq', 'cta']), 0, block);
    mapping.push({ sectionId: `owner.${slot.id}`, blockType: block.type, rule: block.type === 'orderRoutes' ? `slot ${slot.id}: the package's order_routes` : `slot ${slot.id}: the owner's proof (src/data/site-proof.json)` });
  }
}

// On a page written by kind, some proof follows the section it belongs with: the terms table after the written terms,
// the certificates after quality control or the factory.
const AFTER_KINDS = { orderTerms: ['terms'], certifications: ['quality_control', 'factory'] };
// The position after the last block of a section of one of these kinds, or null.
function afterKinds(blocks, mapping, kinds = []) {
  const sections = new Set(mapping.filter((entry) => kinds.includes(entry.kind)).map((entry) => entry.sectionId));
  const last = blocks.findLastIndex((block) => (block.sourceSectionIds ?? []).some((id) => sections.has(id)));
  return last < 0 ? null : last + 1;
}

// Sources (07 AuthoredPage.knowledge: the industry knowledge cards whose facts the sections were given): one list of
// the cards' sources, each url once, before the closing CTA. A source without an http(s) url fails the import.
// The id of a block 08 adds (sources, styles, cases, related pages): its own name, or with a number after it when a
// Site Factory section already has that id (a section may be called "related"), so block ids stay unique.
export function freeBlockId(blocks, id) {
  const taken = new Set(blocks.map((block) => block.id));
  let free = id;
  for (let n = 2; taken.has(free); n += 1) free = `${id}-${n}`;
  return free;
}

// A cited source (the package's CitedSource) as the list shows it. Since Site Factory integ deb67119 (2026-11-17) a
// researched row's source has no title (none is read) and its publisher is the page's host, with when it was read and
// the words it rests on (retrieved, quote: not shown): an empty title shows the publisher, else the url's host; a
// publisher that is the title already is not repeated.
export function sourceItem(source) {
  const host = new URL(source.url).hostname.replace(/^www\./, '');
  const publisher = String(source.publisher ?? '').trim();
  const title = String(source.title ?? '').trim() || publisher || host;
  // When the source was read (retrieved, a date): the list states it (Site Factory 2026-11-17: a regulation's figure on a
  // city page is the figure on the day it was read).
  const retrieved = String(source.retrieved ?? '').trim().match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  return { title, url: source.url, ...(publisher && publisher !== title ? { publisher } : {}), ...(retrieved ? { retrieved } : {}) };
}

export function placeSources(blocks, mapping, page) {
  const cards = page.knowledge || [];
  const items = new Map();
  for (const card of cards) {
    for (const [index, source] of (card.sources || []).entries()) {
      if (!/^https?:\/\//.test(source?.url ?? '')) throw new Error(`${page.page_id}: knowledge card ${card.card_id} source ${index + 1} needs an http(s) url`);
      if (!items.has(source.url)) items.set(source.url, sourceItem(source));
    }
  }
  // The page's own researched sources its footnotes cite (07 AuthoredPage.footnotes, refs: 1-based into
  // AuthoredPage.sources; Site Factory integ deb67119 2026-11-17: only public or authority research rows, never a
  // competitor's page, owner 2026-10-01): the same list, each url once. A source no footnote cites is not shown.
  const own = page.sources || [];
  const cited = [...new Set((page.footnotes || []).flatMap((note) => note.refs || []))].sort((a, b) => a - b);
  for (const ref of cited) {
    const source = own[ref - 1];
    if (!source) throw new Error(`${page.page_id}: a footnote cites source ${ref}, the page lists ${own.length}`);
    if (!/^https?:\/\//.test(source.url ?? '')) throw new Error(`${page.page_id}: source ${ref} needs an http(s) url`);
    if (!items.has(source.url)) items.set(source.url, sourceItem(source));
  }
  if (!items.size) return;
  blocks.splice(indexBefore(blocks, ['cta']), 0, { id: freeBlockId(blocks, 'sources'), type: 'sources', sourceSectionIds: [], items: [...items.values()], cardIds: cards.map((card) => card.card_id) });
  mapping.push({ sectionId: 'knowledge.sources', blockType: 'sources', rule: `sources of ${cards.length} knowledge cards and ${cited.length} footnoted page sources (${items.size} urls)` });
}

// A line page's style grid (07 style_cards: name and one sentence each): after the section that names the styles
// (slot options or range; kind product_range or customization), else before the FAQ, each card linking to the page's enquiry. The heading and the link label
// are the template's.
export const STYLE_HEADINGS = Object.freeze({ product_manufacturer: 'Styles we make', product_wholesale: 'Styles to order wholesale' });
export const QUOTE_LABEL = 'Request a quote';
export function placeStyleGrid(blocks, mapping, { source, planned }) {
  const cards = (source.style_cards || []).map(({ name, intro }) => ({ name: name?.trim(), intro: intro?.trim() }));
  if (!cards.length) return;
  if (!source.cta) throw new Error(`${source.page_id}: style cards need the page's cta to quote against`);
  const slotOf = new Map((source.sections || []).map((item) => [item.section_id, item.slot]));
  const kindOf = new Map((source.sections || []).map((item) => [item.section_id, item.kind]));
  const names = (id) => ['options', 'range'].includes(slotOf.get(id)) || ['product_range', 'customization'].includes(kindOf.get(id));
  const naming = blocks.map((block, index) => ((block.sourceSectionIds || []).some(names) ? index : -1)).filter((index) => index >= 0);
  const at = naming.length ? naming.at(-1) + 1 : indexBefore(blocks, ['faq', 'cta']);
  blocks.splice(at, 0, { id: freeBlockId(blocks, 'styles'), type: 'styleGrid', heading: STYLE_HEADINGS[planned.page_type] ?? STYLE_HEADINGS.product_manufacturer, items: cards, cta: { label: QUOTE_LABEL, href: source.cta.target_url } });
  mapping.push({ sectionId: 'style_cards', blockType: 'styleGrid', rule: `style cards (${cards.length})` });
}

// A page's client case (07 cases, borrowed and anonymised until the owner replaces it): "A recent order" right before
// the testimonials (else the FAQ), in place of the stand-in case studies (placeOwnerSlots).
export const CASE_HEADING = 'A recent order';
// Its heading is the trade's, from the site's proof (headings.caseStudies: a service business's client results), else
// the line's "A recent order".
export function placeCases(blocks, mapping, { source, proof = null, heading = null }) {
  const cases = source.cases || [];
  if (!cases.length) return;
  blocks.splice(indexBefore(blocks, ['testimonials', 'faq', 'cta']), 0, { id: freeBlockId(blocks, 'cases'), type: 'orderCase', heading: heading ?? proof?.headings?.caseStudies ?? CASE_HEADING, items: cases.map(({ product, text, placeholder }) => ({ product, text, ...(placeholder !== false ? { placeholder: true } : {}) })) });
  mapping.push({ sectionId: 'cases', blockType: 'orderCase', rule: `the page's client case (${cases.length})` });
}

// The related pages block, before the FAQ (else the closing call to action): the page's links (Site Factory's
// page.links, anchor_text a 2-5 word noun phrase used as the card title) that its copy does not already carry, then
// the pages the site plan relates it to (the plan's labels, no new copy), up to MAX_RELATED shown. SEO-strong
// manufacturer sites keep one or two links in their sentences and the rest in cards and lists (Site Factory's count,
// 2026-09-27: body median 0-1, cards and lists median 5-16); they link every product page to its wholesale
// counterpart, its hub and its sibling products.
export const MAX_RELATED = 12;
export const RELATED_HEADING = 'Related products and services';
// A block whose links are not all offers (a product, a service or their hubs) is named for what it holds: the home's
// "Related products and services" listed Contact Us and Privacy Policy, RateHarbor's "Related services" Careers and
// Resources (claude-seo audits 2026-11-17/18: aloha L-8, Strandmill M-13, RateHarbor L-2). The legal pages are in every
// page's footer and are not listed here.
export const RELATED_PAGES_HEADING = 'Related pages';
const OFFER_TYPES = new Set(['product_manufacturer', 'product_wholesale', 'products_hub', 'solution', 'solutions_hub']);
// The routes a page's copy links inline ([label](/route/)).
export const linkedInCopy = (blocks) => new Set([...JSON.stringify(blocks).matchAll(/\]\((\/[^)\s"]*)\)/g)].map((match) => match[1]));
export function placeRelated(blocks, { planned, pagesPlan, built, links = [], variant = null, heading = RELATED_HEADING, pagesHeading = RELATED_PAGES_HEADING }) {
  const typeOf = new Map(pagesPlan.pages.map((page) => [page.url, page.page_type]));
  const cta = blocks.find((block) => block.type === 'cta');
  const inCopy = linkedInCopy(blocks);
  const have = new Set([planned.url, ...(cta ? [cta.cta.href] : []), ...inCopy]);
  const list = [];
  // A link to a page not built yet stays in the data but is not shown (RelatedPagesBlock): only shown ones count.
  let shown = 0;
  const add = (label, href) => {
    if (have.has(href) || shown >= MAX_RELATED || typeOf.get(href) === 'privacy') return false;
    have.add(href);
    list.push({ label, href });
    if (!href.startsWith('/') || built.has(href)) shown += 1;
    return true;
  };
  const fromPage = links.filter((link) => add(link.anchor_text, link.url)).length;
  let added = 0;
  for (const page of relatedPages(planned, pagesPlan)) if (built.has(page.url) && add(page.label, page.url)) added += 1;
  // Only pages that exist are shown: with none built yet there is no block.
  if (shown > 0) {
    const offers = list.filter((link) => !link.href.startsWith('/') || built.has(link.href)).every((link) => OFFER_TYPES.has(typeOf.get(link.href)));
    blocks.splice(indexBefore(blocks, ['faq', 'cta']), 0, { id: freeBlockId(blocks, 'related'), type: 'relatedPages', heading: offers ? heading ?? RELATED_HEADING : pagesHeading ?? RELATED_PAGES_HEADING, links: list, ...(variant ? { variant } : {}) });
  }
  return { fromPage, added, inCopy: links.filter((link) => inCopy.has(link.url)).length };
}
