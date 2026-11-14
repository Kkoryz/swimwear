// Site Factory 07 sections as template blocks (import-site-factory.mjs): a section that names its blueprint slot
// becomes that slot's block, any other is mapped by its content shape (FAQ, steps, proof, cards, long form). Copy is
// placed verbatim, never rewritten; the mapping records which block each section went to.

import { BLUEPRINTS, slotDesign } from './page-blueprints.mjs';
import { CARD_GRID, SECTION_WORDS } from './rules.mjs';
import { sectionBlocks } from './visual-checks.mjs';

// Deterministic length band: a section at or above this word count needs a full-width long-form row.
export const LONG_SECTION_WORDS = SECTION_WORDS.long;
// A section needs at least this many numeric tokens (quantities, days, prices) to be read as proof.
export const MIN_PROOF_NUMBERS = 4;

export const wordCount = (text) => text.split(/\s+/).filter(Boolean).length;
const numericTokens = (text) => (text.match(/\b\d+(?:[.,]\d+)?%?/g) || []).length;
export const paragraphsOf = (body) => body.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);

export function parseFaq(body) {
  const groups = paragraphsOf(body).map((group) => group.split('\n').map((line) => line.trim()).filter(Boolean));
  if (groups.length < 2 || groups.filter((lines) => lines[0].endsWith('?')).length < 2) return null;
  return groups.map((lines) => {
    if (!lines[0].endsWith('?')) throw new Error(`FAQ group does not start with a question: ${lines[0].slice(0, 60)}`);
    if (lines.length < 2) throw new Error(`FAQ question has no answer: ${lines[0]}`);
    return { question: lines[0], answer: lines.slice(1).join('\n') };
  });
}

// A list section (07: heading, an optional one-line lead as the body, items of { title, text, fact_ids?, placeholder? }),
// the selling points of a why_us slot: short points with a title each. A borrowed point (placeholder) is marked for
// the owner's sign-off.
export function listBlock(page, item) {
  return { id: item.section_id, type: 'iconList', sourceSectionIds: [item.section_id], heading: item.heading, ...leadOf(item), items: listItems(page, item) };
}

// A list section's items as { heading?, text, placeholder? }: every item needs a text; an empty title (the contract
// allows one: a plain line of the list) is no heading.
export function listItems(page, item) {
  if (!item.items?.length) throw new Error(`${page.page_id}: section ${item.section_id} is a list but has no items`);
  return item.items.map(({ title, text, placeholder }, index) => {
    if (!text?.trim()) throw new Error(`${page.page_id}: section ${item.section_id} item ${index + 1} needs a text`);
    return { ...(title?.trim() ? { heading: title.trim() } : {}), text: text.trim(), ...(placeholder ? { placeholder: true } : {}) };
  });
}

// A list section's optional lead (its body) as the block's paragraphs, or nothing.
export const leadOf = (item) => (item.body?.trim() ? { paragraphs: paragraphsOf(item.body) } : {});

// A prose section as a text block.
// A run of text-and-photo rows longer than the competitor ever shows one (allowed: its longest run on this page type,
// at least two) reads as one module repeated: every (allowed + 1)th row of the run becomes a centred text section,
// the competitor's other prose module, with the same heading and copy in the same place.
export function varyLongRuns(blocks, allowed = 2) {
  const limit = Math.max(2, allowed);
  const text = ({ media: _media, mediaKind: _kind, variant: _variant, ...copy }) => ({ ...copy, type: 'intro', variant: 'text' });
  // Counted by section as the audit counts (lib/visual-checks.mjs sectionBlocks): a section's continuing blocks go
  // with it, made text with it.
  const heads = new Set(sectionBlocks(blocks));
  const madeText = new Set();
  let run = 0;
  return blocks.map((block) => {
    if (!heads.has(block)) return madeText.has(block.continues) && block.type === 'splitMedia' ? text(block) : block;
    if (block.type !== 'splitMedia') { run = 0; return block; }
    run += 1;
    if (run <= limit) return block;
    run = 0;
    madeText.add(block.id);
    return text(block);
  });
}

// A page's block ids as they reach the HTML (data-block-id): Site Factory's section ids can be source URLs (a
// competitor page's "https://…#s3"), so an id that is not a plain slug becomes "<type>-<n>"; the section id stays in
// sourceSectionIds.
const SLUG_ID = /^[a-z0-9][a-z0-9-]*$/i;
export function pageBlockIds(blocks) {
  const taken = new Set(blocks.map((block) => block.id).filter((id) => SLUG_ID.test(id)));
  const renamed = new Map();
  const named = blocks.map((block) => {
    if (SLUG_ID.test(block.id)) return block;
    let index = 1;
    while (taken.has(`${block.type}-${index}`)) index += 1;
    taken.add(`${block.type}-${index}`);
    renamed.set(block.id, `${block.type}-${index}`);
    return { ...block, id: `${block.type}-${index}` };
  });
  // A continuing block names its section's block by the block's new id.
  return named.map((block) => (renamed.has(block.continues) ? { ...block, continues: renamed.get(block.continues) } : block));
}

export const textBlock = (type, item) => ({ id: item.section_id, type, sourceSectionIds: [item.section_id], heading: item.heading, paragraphs: paragraphsOf(item.body), wordCount: wordCount(item.body) });

// The closing band: its heading and text from the cta section (closing), its button from page.cta; the page's links go
// to the related pages block (placeRelated), not the band.
export function closingBlock(page, closing) {
  if (page.cta) return { id: 'cta', type: 'cta', sourceSectionIds: closing?.sourceSectionIds ?? [], ...(closing ? { heading: closing.heading, paragraphs: closing.paragraphs } : {}), ...(closing?.visuals?.length ? { visuals: closing.visuals } : {}), cta: { label: page.cta.label, href: page.cta.target_url }, links: [] };
  if (closing) throw new Error(`${page.page_id}: a closing section cannot be placed without a page cta`);
  return null;
}

export function parseSteps(body) {
  const lines = body.split('\n').map((line) => line.trim()).filter(Boolean);
  if (lines.length < 3 || !lines.every((line) => /^(?:\d+[.)]|step\s+\d+\b)/i.test(line))) return null;
  return lines;
}

function classify(sections) {
  const shapes = sections.map((item, index) => {
    // Site Factory marks its code-built list of approved facts (one per line) with key_facts: true.
    if (item.key_facts === true) return { kind: 'keyFacts' };
    if (index === 0) return { kind: 'intro' };
    const faq = parseFaq(item.body);
    if (faq) return { kind: 'faq', faq };
    const steps = parseSteps(item.body);
    if (steps) return { kind: 'process', steps };
    return { kind: 'content' };
  });
  const candidates = sections
    .map((item, index) => ({ index, numbers: numericTokens(item.body) }))
    .filter(({ index, numbers }) => shapes[index].kind === 'content' && numbers >= MIN_PROOF_NUMBERS)
    .sort((left, right) => right.numbers - left.numbers || left.index - right.index);
  if (candidates.length) shapes[candidates[0].index] = { kind: 'proof' };
  return shapes;
}

// Split a run of standard-length sections into equal-card grids of 2 or 3; never leave a single card.
function chunkRun(run) {
  const chunks = [];
  let rest = run.slice();
  while (rest.length) {
    const size = rest.length === 4 || rest.length === 2 ? 2 : 3;
    chunks.push(rest.slice(0, size));
    rest = rest.slice(size);
  }
  return chunks;
}

// Card slots: consecutive sections of one slot share a grid of at most 4 equal cards (5 → 3+2, 7 → 4+3).
// max: the most cards to a row (rules.mjs cardGridMax). Long cards, three to a row, come in grids of three, a last one
// left over making the last two grids two and two (Strandmill 2026-11-14: grids of four in a set three columns wide
// left one card under three).
export function chunkCards(items, max = CARD_GRID.max) {
  if (max < 4) {
    const chunks = [];
    for (let index = 0; index < items.length; index += max) chunks.push(items.slice(index, index + max));
    if (chunks.length > 1 && chunks.at(-1).length === 1) { const last = [...chunks.pop(), ...chunks.pop()]; chunks.push(last.slice(0, Math.ceil(last.length / 2)), last.slice(Math.ceil(last.length / 2))); }
    return chunks;
  }
  const size = items.length <= 4 ? items.length : items.length % 4 === 0 || items.length % 4 === 3 ? 4 : 3;
  const chunks = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  if (chunks.length > 1 && chunks.at(-1).length === 1) chunks.at(-2).push(...chunks.pop());
  return chunks;
}

// A page of slots (no kinds). Known limit: its sections' visuals are not carried (Site Factory no longer writes such
// pages, 2026-11-09; pages written by kind carry them, lib/sf-kinds.mjs).
export function planBlocks(page, { hasKeyFigures = false, pageType = null, blueprints = BLUEPRINTS } = {}) {
  if (!Array.isArray(page.sections) || page.sections.length === 0) throw new Error(`${page.page_id}: sections are empty`);
  const shapes = classify(page.sections);
  const blocks = [];
  const mapping = [];
  const slots = new Map((blueprints[pageType] || []).map((slot) => [slot.id, slot]));
  let cards = null;
  let closing = null;
  const flushCards = () => {
    if (!cards) return;
    for (const chunk of chunkCards(cards.items)) {
      blocks.push({ id: chunk.map((item) => item.section_id).join('+'), type: 'featureGrid', sourceSectionIds: chunk.map((item) => item.section_id), items: chunk.map((item) => ({ heading: item.heading, paragraphs: paragraphsOf(item.body), wordCount: wordCount(item.body) })), ...slotDesign(slots.get(cards.slot)) });
      for (const item of chunk) mapping.push({ sectionId: item.section_id, blockType: 'featureGrid', slotId: cards.slot, rule: `slot ${cards.slot} (grid of ${chunk.length})` });
    }
    cards = null;
  };
  let run = [];
  const flush = () => {
    flushCards();
    if (!run.length) return;
    if (run.length === 1) {
      blocks.push({ ...textBlock('splitMedia', run[0]), media: null });
      mapping.push({ sectionId: run[0].section_id, blockType: 'splitMedia', rule: 'standard length without a sibling' });
    } else {
      for (const chunk of chunkRun(run)) {
        blocks.push({
          id: chunk.map((item) => item.section_id).join('+'),
          type: 'featureGrid',
          sourceSectionIds: chunk.map((item) => item.section_id),
          items: chunk.map((item) => ({ heading: item.heading, paragraphs: paragraphsOf(item.body), wordCount: wordCount(item.body) })),
        });
        for (const item of chunk) mapping.push({ sectionId: item.section_id, blockType: 'featureGrid', rule: `consecutive standard-length sections (grid of ${chunk.length})` });
      }
    }
    run = [];
  };

  page.sections.forEach((item, index) => {
    const shape = shapes[index];
    const words = wordCount(item.body);
    if (item.slot != null) {
      const slot = slots.get(item.slot);
      if (!slot || slot.fill !== 'copy') throw new Error(`${page.page_id}: section ${item.section_id} names slot ${item.slot}, which the ${pageType} blueprint has no copy slot for`);
      if (slot.block === 'featureGrid') {
        if (run.length) flush();
        if (cards && cards.slot !== slot.id) flushCards();
        cards = cards || { slot: slot.id, items: [] };
        cards.items.push(item);
        return;
      }
      flush();
      if (slot.block === 'faq') {
        const faq = parseFaq(item.body);
        if (!faq) throw new Error(`${page.page_id}: section ${item.section_id} fills the faq slot but has no question/answer pairs`);
        blocks.push({ id: item.section_id, type: 'faq', sourceSectionIds: [item.section_id], heading: item.heading, items: faq });
      } else if (slot.block === 'cta') {
        // The closing band's heading and text; its button and related links come from page.cta and page.links.
        closing = { heading: item.heading, paragraphs: paragraphsOf(item.body), sourceSectionIds: [item.section_id] };
      } else if (slot.block === 'iconList') {
        blocks.push({ ...listBlock(page, item), ...slotDesign(slot) });
      } else if (['intro', 'proof', 'splitMedia'].includes(slot.block)) {
        blocks.push({ ...textBlock(slot.block, item), ...(slot.block === 'splitMedia' ? { media: null } : {}), ...slotDesign(slot) });
      } else {
        throw new Error(`${page.page_id}: slot ${slot.id} (${slot.block}) cannot be filled from a section`);
      }
      mapping.push({ sectionId: item.section_id, blockType: slot.block, slotId: slot.id, rule: `slot ${slot.id}` });
      return;
    }
    flushCards();
    if (shape.kind === 'content' && words < LONG_SECTION_WORDS) { run.push(item); return; }
    flush();
    if (shape.kind === 'intro') {
      blocks.push(textBlock('intro', item));
      mapping.push({ sectionId: item.section_id, blockType: 'intro', rule: 'first section' });
    } else if (shape.kind === 'keyFacts') {
      if (hasKeyFigures) {
        mapping.push({ sectionId: item.section_id, blockType: null, rule: 'key_facts section replaced by structured key figures (same approved facts)' });
      } else {
        const lines = item.body.split('\n').map((line) => line.trim()).filter(Boolean);
        blocks.push({ id: item.section_id, type: 'iconList', variant: 'checks', sourceSectionIds: [item.section_id], heading: item.heading, items: lines.map((text) => ({ text })) });
        mapping.push({ sectionId: item.section_id, blockType: 'iconList', rule: `key_facts section as a checklist (${lines.length} facts)` });
      }
    } else if (shape.kind === 'faq') {
      blocks.push({ id: item.section_id, type: 'faq', sourceSectionIds: [item.section_id], heading: item.heading, items: shape.faq });
      mapping.push({ sectionId: item.section_id, blockType: 'faq', rule: `question/answer pairs (${shape.faq.length})` });
    } else if (shape.kind === 'process') {
      blocks.push({ id: item.section_id, type: 'process', sourceSectionIds: [item.section_id], heading: item.heading, steps: shape.steps });
      mapping.push({ sectionId: item.section_id, blockType: 'process', rule: `numbered steps (${shape.steps.length})` });
    } else if (shape.kind === 'proof') {
      blocks.push(textBlock('proof', item));
      mapping.push({ sectionId: item.section_id, blockType: 'proof', rule: `densest numeric section (${numericTokens(item.body)} numbers)` });
    } else {
      blocks.push({ ...textBlock('splitMedia', item), media: null });
      mapping.push({ sectionId: item.section_id, blockType: 'splitMedia', rule: `long-form (${words} words >= ${LONG_SECTION_WORDS})` });
    }
  });
  flush();

  const cta = closingBlock(page, closing);
  if (cta) blocks.push(cta);
  return { blocks, mapping };
}
