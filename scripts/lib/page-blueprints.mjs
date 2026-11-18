// Page blueprints: the slots of each page type. Stage 08 derives each site's from its competitor's pages
// (competitorBlueprints: the competitor's section order and modules, our content purposes from
// config/page-blueprints.default.json) and sends it to Site Factory 06 (docs/research/slot-manifest.json), which plans
// each page slot by slot; stage 08 and 09 read 06's manifest back with --blueprints <file>.
//
// Each slot says what content it needs, who fills it and how much:
//   fill "copy"        Site Factory 07 writes it (section.slot = slot id)
//   fill "plan"        stage 09 builds it from the site plan (labels and links of real pages), no new copy
//   fill "structured"  07 `structured` data (key figures, process steps, comparison)
//   fill "site"        stage 09 builds it from site-level inputs (the contact form contract, site identity)
// Sizes are ranges: words per field, item counts. `repeat` lets one slot take several consecutive sections.

import DEFAULT_MANIFEST from '../../config/page-blueprints.default.json' with { type: 'json' };
import { indexBefore } from './block-position.mjs';
import { dataPracticesBlock, isPrivacyPolicy } from './data-practices.mjs';
import { leadFormBlock } from './lead-form.mjs';
import { placeResourceForm } from './resource-promise.mjs';
import { childCards, childPages } from './site-plan.mjs';
import { ownerSlotsOf, proofBlock, withProofSlots } from './site-proof.mjs';
import { cardGridVariant } from './slot-visuals.mjs';

export const SLOT_MANIFEST_SCHEMA = 'seo-site-slot-manifest-v1';
export const PLACEHOLDER = '[Placeholder]';

// Page types the template owns (Site Factory plans them with blueprint_required false and writes no copy): they always
// use this template's blueprint, also when Site Factory's slot manifest is passed.
export const TEMPLATE_PAGE_TYPES = Object.freeze(['privacy']);

// What a page cannot do without, whatever its copy holds (a page written by kind has no form section): the contact
// page's enquiry form and its ways to reach the company (the hotel site's contact page said "the form below" over
// neither), and the site tree's inquiry page (site:inquiry, a general page) its enquiry form: every "Request a quote"
// button lands on it (Strandmill audit 2026-11-17: three of four sites' quote page had no form, the fourth one only
// because its closing band brings the competitor's form). Keyed by page type, or by the tree's name of a general page.
export const REQUIRED_BLOCKS = Object.freeze({ contact: ['form', 'contactChannels'], inquiry: ['form'] });
export const requiredBlocks = (pageType, pageId = null) => REQUIRED_BLOCKS[pageType] ?? (pageType === 'general' && pageId?.startsWith('site:') ? REQUIRED_BLOCKS[pageId.slice(5)] : null) ?? [];

// The fallback blueprint, stored in the same format as Site Factory's slot manifest.
export const BLUEPRINTS = blueprintsFrom(DEFAULT_MANIFEST);

// The blueprints with their slots' purposes in a trade's own words (wording: default purpose -> the trade's; a purpose
// it does not name keeps its words).
export function withPurposeWording(blueprints, wording) {
  if (!wording) return blueprints;
  return Object.fromEntries(Object.entries(blueprints).map(([pageType, slots]) => [pageType, slots.map((slot) => (wording[slot.purpose] ? { ...slot, purpose: wording[slot.purpose] } : slot))]));
}

// Blueprints from a slot manifest file (Site Factory's copy, or a template's docs/research/slot-manifest.json).
export function blueprintsFrom(manifest) {
  if (manifest?.schemaVersion !== SLOT_MANIFEST_SCHEMA) throw new Error(`unsupported slot manifest schema: ${manifest?.schemaVersion}`);
  const own = Object.fromEntries(TEMPLATE_PAGE_TYPES.filter((type) => DEFAULT_MANIFEST.pageTypes[type]).map((type) => [type, DEFAULT_MANIFEST.pageTypes[type].slots.map(({ module, ...slot }) => slot)]));
  return { ...Object.fromEntries(Object.entries(manifest.pageTypes || {}).map(([pageType, entry]) => [pageType, (entry.slots || []).map(({ module, ...slot }) => slot)])), ...own };
}

// ---- Each competitor its own blueprint (the owner's rule since 2026-09-25: design and template follow the competitor) ----
// The competitor's page, section by section (docs/research/pattern-inventory.json), sets the order and the module of a
// page type's slots. Our content purposes (the default blueprint's slots) take the competitor sections of their kind in
// order, each rendered with that section's module; a purpose the competitor page has no section for keeps its place
// after the purposes that precede it in the default order (the page still says everything a buyer needs); a competitor
// module only the owner can fill truthfully (client logos, testimonials) becomes an optional owner slot, never
// written by Site Factory. Choices (docs/research/blueprint-choices.json) let a person leave competitor sections out;
// they apply only when that file says enabled: true.

// Our block kinds a competitor section's decision can hold, and the module (block variant) it brings.
function sectionKinds(decision = '') {
  return decision.split('+').map((part) => part.trim()).flatMap((part) => {
    const [block, variant] = part.split(' ')[0].split(':');
    if (block === 'intro/proof') return [{ kinds: ['intro', 'proof'] }];
    if (block === 'splitMedia') return [{ kinds: ['splitMedia'], variant }];
    if (block === 'featureGrid') return [{ kinds: ['featureGrid'], variant }];
    // Short points with a mark each: the why_us slot where the blueprint has one, else a grid of columns.
    if (block === 'iconList') return [{ kinds: ['iconList', 'featureGrid'], prefer: 'iconList', variant }];
    if (block === 'gallery') return [{ kinds: ['gallery'], variant }];
    if (block === 'cta') return [{ kinds: ['cta'], variant }];
    if (block === 'band') return [{ kinds: ['cta'], variant: 'image-band' }];
    if (['stats', 'table', 'faq', 'process'].includes(block)) return [{ kinds: [block], variant }];
    if (block === 'form') return [{ kinds: ['form'], variant }];
    if (block === 'contactChannels') return [{ kinds: ['contactChannels'], variant }];
    if (['logos', 'testimonials'].includes(block)) return [{ owner: block }];
    return [];
  });
}

// Blocks whose slot may name the module (variant) the competitor's section brings.
export const VARIANT_BLOCKS = new Set(['splitMedia', 'featureGrid', 'gallery', 'cta', 'process', 'stats', 'faq', 'table', 'iconList', 'contactChannels']);

export function competitorBlueprint(defaults, sections) {
  const pool = defaults.map((slot, order) => ({ slot, order, used: false }));
  const placed = [];
  const ownerSlots = new Set();
  for (const section of sections) {
    for (const kind of sectionKinds(section.decision)) {
      if (kind.owner) {
        if (!ownerSlots.has(kind.owner)) { ownerSlots.add(kind.owner); placed.push({ slot: { id: kind.owner, block: kind.owner, fill: 'owner', required: false, purpose: kind.owner === 'logos' ? 'Client or certification logos the owner can show (real, with permission)' : 'Testimonials real clients agreed to publish' }, order: null }); }
        continue;
      }
      // A run of the competitor's rows fills one repeating purpose (several text/photo rows in a row).
      const last = placed.at(-1);
      if (last?.slot.block === 'splitMedia' && kind.kinds.includes('splitMedia') && last.slot.repeat && last.count < last.slot.repeat[1]) { last.count += 1; continue; }
      // The closing call to action takes the module of the competitor's last closing section, not its first.
      const closing = kind.kinds.includes('cta') && placed.find((item) => item.slot.block === 'cta');
      if (closing) { if (kind.variant) closing.slot = { ...closing.slot, variant: kind.variant }; continue; }
      const match = (kind.prefer && pool.find((entry) => !entry.used && entry.slot.block === kind.prefer)) || pool.find((entry) => !entry.used && kind.kinds.includes(entry.slot.block));
      if (!match) continue;
      match.used = true;
      // An iconList section on a grid slot renders as columns (the grid's nearest module).
      const moduleVariant = kind.prefer === 'iconList' && match.slot.block === 'featureGrid' ? 'columns' : kind.variant;
      const variant = VARIANT_BLOCKS.has(match.slot.block) && moduleVariant ? { variant: moduleVariant } : {};
      placed.push({ slot: { ...match.slot, ...variant }, order: match.order, count: 1 });
    }
  }
  // Purposes the competitor page has no section for, after the placed purpose that precedes them in the default order.
  for (const entry of pool.filter((item) => !item.used)) {
    const before = placed.reduce((at, item, index) => (item.order !== null && item.order < entry.order ? index + 1 : at), 0);
    placed.splice(before, 0, { slot: entry.slot, order: entry.order });
  }
  // The closing call to action closes the page, in the module of the competitor section it took.
  const closing = placed.findIndex((item) => item.slot.block === 'cta');
  if (closing >= 0) placed.push(...placed.splice(closing, 1));
  return placed.map((item) => item.slot);
}

// Blueprints for every page type: the competitor's where the inventory has that page type, else the default.
// sections: docs/research/analysis/section-modules.json, the module the analysis named for each competitor section
// ({ pageType, index, module: "<block>:<variant>" | "owner:logos" | "skip" }); it overrides the capture's coarse pattern.
export function competitorBlueprints(inventory, { defaults = DEFAULT_MANIFEST, choices = null, sections: named = [] } = {}) {
  const base = blueprintsFrom(defaults);
  const chosen = choices?.enabled === true ? choices.pageTypes ?? {} : {};
  return Object.fromEntries(Object.entries(base).map(([pageType, slots]) => {
    const page = TEMPLATE_PAGE_TYPES.includes(pageType) ? null : inventory?.pages?.find((item) => item.pageType === pageType);
    if (!page) return [pageType, withProofSlots(pageType, slots)];
    const left = new Set((chosen[pageType] ?? []).filter((item) => item.include === false).map((item) => item.index));
    const module = (section) => named.find((item) => item.pageType === pageType && item.index === section.index)?.module;
    const all = page.sections.map((section) => {
      const chosen = module(section);
      return chosen ? { ...section, decision: chosen.startsWith('owner:') ? chosen.slice(6) : chosen } : section;
    }).filter((section) => !section.decision?.startsWith('hero:') && !section.decision?.startsWith('skip'));
    // An owner module a person left out is not added back as a proof slot.
    const leftOwner = all.filter((section) => left.has(section.index)).flatMap((section) => sectionKinds(section.decision)).filter((kind) => kind.owner).map((kind) => kind.owner);
    return [pageType, withProofSlots(pageType, competitorBlueprint(slots, all.filter((section) => !left.has(section.index))), leftOwner)];
  }));
}

// The choices file a person edits to leave competitor sections out (enabled: false until they turn it on).
export function blueprintChoices(inventory) {
  return {
    enabled: false,
    note: 'Set enabled to true and include to false for a competitor section the blueprint should not follow.',
    pageTypes: Object.fromEntries((inventory?.pages ?? []).map((page) => [page.pageType, page.sections.filter((section) => !section.decision?.startsWith('hero:') && !section.decision?.startsWith('skip')).map((section) => ({ index: section.index, pattern: section.pattern, decision: section.decision, firstHeading: section.firstHeading ?? null, include: true }))])),
  };
}

// A slot's module as block fields: its photography and, when the competitor section gives one, its variant.
export function slotDesign(slot) {
  return { ...mediaPolicy(slot), ...(slot?.variant ? { variant: slot.variant } : {}) };
}

// The template's module for each block: the reference pattern this template renders the block with.
function moduleFor(block, pageType, components) {
  const patterns = components.pageTypes?.[pageType] || {};
  switch (block) {
    // Photo cards as the site's cards show them (lib/slot-visuals.mjs: icon cards for a trade whose cards name services).
    case 'featureGrid': return cardGridVariant(patterns.featureGrid ?? (components.featureGridMedia ? 'media' : components.featureGrid), components);
    case 'gallery': return patterns.gallery ?? 'grid';
    case 'splitMedia': return patterns.splitSequence?.length ? patterns.splitSequence.join(' > ') : components.splitMedia;
    case 'intro': return components.intro ?? 'text';
    case 'proof': return components.proof;
    case 'cta': return patterns.cta ?? components.cta;
    case 'faq': return components.faq;
    default: return 'default';
  }
}

export function slotManifest({ components = {}, source = null, blueprints = BLUEPRINTS } = {}) {
  return {
    schemaVersion: SLOT_MANIFEST_SCHEMA,
    source,
    note: 'Each page type follows the competitor page it was copied from: slot order and modules from its sections, our content purposes in them.',
    pageTypes: Object.fromEntries(Object.entries(blueprints).map(([pageType, slots]) => [pageType, {
      hero: { variant: components.heroByPageType?.[pageType] ?? components.hero, words: { heading: [4, 12], lead: [15, 35] }, cta: true },
      slots: slots.map((slot) => ({ ...slot, module: `${slot.block}:${slot.variant ?? moduleFor(slot.block, pageType, components)}` })),
    }])),
  };
}

// ---- Placeholder pages built from a blueprint (pages Site Factory has not authored) ----

const words = (count, label) => {
  const base = `${PLACEHOLDER} ${label}.`;
  const filler = ' Authored copy of this length will render here.';
  let text = base;
  while (text.split(/\s+/).length < count) text += filler;
  return text;
};
const mid = ([min, max]) => Math.round((min + max) / 2);

// A slot's declared photography: { mediaKind: <class> } when the blueprint names one, { mediaKind: null } for "none",
// nothing when the slot leaves it to the template's module design (media-slots.mjs).
export function mediaPolicy(slot) {
  if (!slot || slot.media === undefined) return {};
  if (slot.media === null || slot.media === 'none') return { mediaKind: null };
  return { mediaKind: typeof slot.media === 'string' ? slot.media : slot.media.kind };
}

function slotBlocks(slot, context) {
  return slotBlocksOf(slot, context).map((block) => (block.type === 'form' ? block : slot.fill === 'plan' ? { ...block, ...(slot.variant ? { variant: slot.variant } : {}) } : { ...block, ...slotDesign(slot) }));
}

function slotBlocksOf(slot, { page, pagesPlan, contactRoute, proof = null, trust = null }) {
  // An owner slot shows the site's proof (src/data/site-proof.json), or nothing while there is none.
  if (slot.fill === 'owner') { const block = proofBlock(slot.id, proof, { route: page.url, trust }); return block ? [block] : []; }
  const heading = `${PLACEHOLDER} ${slot.purpose}`;
  const body = (range) => [words(mid(range), slot.purpose)];
  switch (slot.fill === 'plan' ? 'plan' : slot.block) {
    case 'plan': {
      const parentId = slot.source === 'children:self' ? page.page_id : slot.source.split(':')[1];
      const children = childPages(pagesPlan, parentId).filter((child) => child.page_id !== page.page_id);
      if (!children.length) return [];
      return [{ id: slot.id, type: 'gallery', heading, ...childCards(slot, children) }];
    }
    case 'intro': case 'proof': return [{ id: slot.id, type: slot.block, heading, paragraphs: body(slot.words.body) }];
    case 'splitMedia': return Array.from({ length: slot.repeat[1] > 2 ? 2 : slot.repeat[1] }, (_, n) => ({ id: `${slot.id}-${n + 1}`, type: 'splitMedia', heading, paragraphs: body(slot.words.body) }));
    case 'featureGrid': return [{ id: slot.id, type: 'featureGrid', heading, items: Array.from({ length: slot.items[1] }, (_, n) => ({ heading: `${PLACEHOLDER} Item ${n + 1}`, paragraphs: [words(mid(slot.itemWords.text), 'Card text')] })) }];
    case 'stats': return [{ id: slot.id, type: 'stats', heading, items: Array.from({ length: 4 }, (_, n) => ({ value: `${PLACEHOLDER} Figure`, label: `${PLACEHOLDER} Fact ${n + 1}` })) }];
    case 'process': return [{ id: slot.id, type: 'process', heading, steps: Array.from({ length: 4 }, (_, n) => ({ heading: `${PLACEHOLDER} Step ${n + 1}`, text: words(20, 'Step description') })) }];
    case 'table': return [{ id: slot.id, type: 'table', heading, columns: [`${PLACEHOLDER} Option`, `${PLACEHOLDER} Best for`, `${PLACEHOLDER} What changes`], rows: Array.from({ length: 4 }, (_, n) => [`${PLACEHOLDER} Option ${n + 1}`, `${PLACEHOLDER} Use`, `${PLACEHOLDER} Effect`]) }];
    case 'faq': return [{ id: slot.id, type: 'faq', heading, items: Array.from({ length: 4 }, (_, n) => ({ question: `${PLACEHOLDER} Buyer question ${n + 1}?`, answer: words(mid(slot.itemWords.answer), 'Answer') })) }];
    case 'form': return [leadFormBlock(slot.id)];
    // The ways to reach the company come from its own details at build time (ContactChannelsBlock): no copy here.
    case 'contactChannels': return [{ id: slot.id, type: 'contactChannels' }];
    // The contact page closes on its own form: a band that asks to contact us would link to itself.
    case 'cta': return page.url === contactRoute ? [] : [{ id: slot.id, type: 'cta', heading, paragraphs: [words(20, 'Closing text')], cta: { label: 'Contact', href: contactRoute }, links: [] }];
    default: return [];
  }
}

// A template-owned page (the privacy policy) is legal text: its sections are text blocks, no photos. Placeholder and
// imported pages alike.
export const legalText = (pageType, blocks) => (TEMPLATE_PAGE_TYPES.includes(pageType) ? blocks.map((block) => (block.type === 'intro' ? { ...block, variant: 'text' } : block)) : blocks);

export function blueprintPage({ page, pagesPlan, contactRoute, blueprints = BLUEPRINTS, proof = null, trust = null }) {
  const slots = blueprints[page.page_type];
  if (!slots) throw new Error(`no blueprint for page type ${page.page_type}`);
  // A legal page has no call to action either (an imported one keeps Site Factory's).
  const legal = TEMPLATE_PAGE_TYPES.includes(page.page_type);
  const blocks = legalText(page.page_type, slots.flatMap((slot) => slotBlocks(slot, { page, pagesPlan, contactRoute, proof, trust })));
  // The owner slots the page's tree name adds (site-proof.mjs PAGE_PROOF_SLOTS), before the FAQ, as on an imported page.
  for (const slot of ownerSlotsOf(slots, page.page_type, page.page_id).filter((item) => item.page)) {
    const block = proofBlock(slot.id, proof, { route: page.url, trust });
    if (block) blocks.splice(indexBefore(blocks, ['faq', 'cta']), 0, block);
  }
  // A required block its blueprint has no slot for (the inquiry page's form), before the closing call, as on an
  // imported page (page-assembly.mjs placeRequiredBlocks).
  for (const type of requiredBlocks(page.page_type, page.page_id)) {
    if (blocks.some((block) => block.type === type)) continue;
    const id = blocks.some((block) => block.id === type) ? `${type}-required` : type;
    blocks.splice(indexBefore(blocks, ['cta']), 0, type === 'form' ? leadFormBlock(id) : { id, type });
  }
  // The site tree's resources page asks for its resources by form until it has files (lib/resource-promise.mjs).
  placeResourceForm(blocks, { id: page.page_id, pageType: page.page_type });
  // The privacy policy's "what this site collects" is the site's own, written or not (lib/data-practices.mjs).
  if (legal && isPrivacyPolicy({ route: page.url, label: page.label })) blocks.push(dataPracticesBlock('data-practices'));
  const heroCta = page.url !== contactRoute && !legal;
  return {
    id: page.page_id, route: page.url, pageType: page.page_type, status: 'placeholder',
    // The page's name (the site tree's) heads it; its copy is marked placeholder until Site Factory writes the page.
    seo: { title: page.label, description: `${PLACEHOLDER} Site Factory has not authored this page yet.`, canonical: page.url },
    jsonLd: [],
    hero: { heading: page.label, lead: [words(25, 'Hero subtitle')], ...(heroCta ? { cta: { label: 'Contact', href: contactRoute } } : {}) },
    blocks,
  };
}
