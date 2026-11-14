// Site Factory sections by kind (owner, 2026-09-30: the page's structure is ours, the style imitates the competitor):
// each section names its kind (config/block-kinds.json) and may name a presentation; the page keeps the order of its
// sections, and each renders with the component the table gives for its kind and presentation, in the style of the
// imitated competitor's matching module. Copy is placed verbatim, never rewritten.

import BLOCK_KINDS from '../../config/block-kinds.json' with { type: 'json' };
import { CARDINALITY } from './authoring-contract.mjs';
import { markdownTable } from './markdown-table.mjs';
import { chunkCards, closingBlock, leadOf, listBlock, listItems, paragraphsOf, parseFaq, textBlock } from './sf-sections.mjs';
import { normalizeFact, verifyCited } from './sf-structured.mjs';

export { BLOCK_KINDS };

// A page written by kind: any of its sections names one.
export const isKindPage = (page) => (page.sections ?? []).some((section) => section.kind != null);

// A site-wide flow (owner 2026-11-10: written once in the package's site_modules, used by the pages it fits) in the
// sections that use it: each takes its steps and, without a heading of its own, its heading; site_module names it.
export function withSiteModules(authoringPackage) {
  const modules = authoringPackage.site_modules ?? {};
  const pages = authoringPackage.pages.map((page) => ({
    ...page,
    sections: (page.sections ?? []).map((section) => {
      if (section.uses == null) return section;
      const module = modules[section.uses];
      if (!module) throw new Error(`${page.page_id}: section ${section.section_id} uses ${section.uses}, which is not in the package's site_modules (${Object.keys(modules).join(', ') || 'none'})`);
      if (section.steps != null) throw new Error(`${page.page_id}: section ${section.section_id} uses ${section.uses} and has steps of its own: one or the other`);
      const { uses, ...rest } = section;
      return { ...rest, heading: section.heading || module.heading || '', steps: module.steps, site_module: uses };
    }),
  }));
  return { ...authoringPackage, pages };
}

// A step's duration as written: "10–15 days", "7 days".
const durationText = ({ min, max, unit }) => `${min === max ? min : `${min}–${max}`} ${unit}`;

// A flow's steps ({ name, we_do, client_provides?, duration: { min, max, unit } | null, fact_ids }), checked.
function flowSteps(page, section, [least, most] = [3, 6]) {
  const steps = section.steps;
  const at = `${page.page_id}: section ${section.section_id}${section.site_module ? ` (site flow ${section.site_module})` : ''}`;
  if (!Array.isArray(steps) || steps.length < least || steps.length > most) throw new Error(`${at} needs ${least} to ${most} steps, has ${Array.isArray(steps) ? steps.length : 'none'}`);
  return steps.map((step, index) => {
    if (!step?.name?.trim() || !step?.we_do?.trim()) throw new Error(`${at} step ${index + 1} needs a name and what we do (we_do)`);
    const { duration } = step;
    if (duration != null && !(Number.isFinite(duration.min) && Number.isFinite(duration.max) && duration.max >= duration.min && duration.unit?.trim())) throw new Error(`${at} step ${index + 1}: duration needs min, max (not below min) and unit, or null`);
    return { name: step.name.trim(), weDo: step.we_do.trim(), ...(step.client_provides?.trim() ? { provides: step.client_provides.trim() } : {}), ...(duration ? { duration: durationText(duration) } : {}) };
  });
}

// The flow's lead: the page's sentence for it (note) first, then the section's own body.
const flowLead = (section) => {
  const paragraphs = [...(section.note?.trim() ? [section.note.trim()] : []), ...paragraphsOf(section.body ?? '')];
  return paragraphs.length ? { paragraphs } : {};
};

// The figures, prices, swatches and photo captions of a section's items, checked.
function sectionItems(page, section, required) {
  if (!section.items?.length) throw new Error(`${page.page_id}: section ${section.section_id} (${section.presentation}) has no items`);
  return section.items.map((item, index) => {
    const missing = required.filter((field) => !String(field.split('.').reduce((value, key) => value?.[key], item) ?? '').trim());
    if (missing.length) throw new Error(`${page.page_id}: section ${section.section_id} item ${index + 1} needs ${missing.join(', ')}`);
    return item;
  });
}

// What a fact must state (owner 2026-11-10): a figure's value, a price's amount and a step's duration are claims, each
// stated in a fact the item cites (the value and amount as written, a duration's numbers); every cited fact exists and
// is approved for public use. facts: the page's facts (lib/sf-structured.mjs pageFactsOf), or null.
export function verifyKindFacts(page, facts, table = BLOCK_KINDS) {
  if (!isKindPage(page)) return;
  const cited = [];
  const claims = [];
  for (const section of page.sections) {
    const { component } = componentOf(page, section, table);
    const where = (index) => `${section.section_id} ${section.steps ? 'step' : 'item'} ${index + 1}`;
    if (component === 'stats') for (const [index, item] of (section.items ?? []).entries()) claims.push({ where: where(index), ids: item.fact_ids ?? [], what: 'value', texts: [String(item.value)] });
    if (component === 'pricing') for (const [index, item] of (section.items ?? []).entries()) claims.push({ where: where(index), ids: item.fact_ids ?? [], what: 'price', texts: [String(item.price?.amount ?? '')] });
    for (const [index, step] of (section.steps ?? []).entries()) {
      cited.push(...(step.fact_ids ?? []).map((id) => [where(index), id]));
      if (step.duration) claims.push({ where: where(index), ids: step.fact_ids ?? [], what: 'duration', numbers: [...new Set([step.duration.min, step.duration.max])] });
    }
  }
  if (!cited.length && !claims.length) return;
  if (!facts) throw new Error(`${page.page_id}: figures, prices or steps cite facts: --facts is needed to verify them`);
  verifyCited(page.page_id, [...cited, ...claims.flatMap((claim) => claim.ids.map((id) => [claim.where, id]))], facts);
  const plain = (text) => normalizeFact(String(text)).replace(/[–—]/g, '-');
  for (const claim of claims) {
    if (!claim.ids.length) throw new Error(`${page.page_id}: ${claim.where}: a ${claim.what} cites no fact (fact_ids)`);
    const stated = claim.ids.map((id) => plain(facts.get(id).text));
    const found = claim.texts
      ? claim.texts.every((text) => stated.some((fact) => fact.includes(plain(text))))
      : claim.numbers.every((number) => stated.some((fact) => new RegExp(`(?<![\\d.])${String(number).replace('.', '\\.')}(?![\\d.])`).test(fact)));
    if (!found) throw new Error(`${page.page_id}: ${claim.where}: the ${claim.what} ${claim.texts ? `"${claim.texts.join(' ')}"` : claim.numbers.join('–')} is not stated in ${claim.ids.join(', ')}`);
  }
}

// The competitor's style for each component: the module (variant) of the first slot of that block the site's
// blueprint for this page type took from the competitor section it follows.
export function competitorStyles(slots = []) {
  const styles = new Map();
  for (const slot of slots) if (slot.variant && !styles.has(slot.block)) styles.set(slot.block, slot.variant);
  return styles;
}

// The component a section renders with, from its kind and presentation.
export function componentOf(page, section, table = BLOCK_KINDS) {
  const kind = table.kinds[section.kind];
  if (!kind) throw new Error(`${page.page_id}: section ${section.section_id} has an unknown kind ${section.kind} (config/block-kinds.json)`);
  const presentation = section.presentation ?? kind.default;
  const component = kind.presentations[presentation];
  if (!component) throw new Error(`${page.page_id}: section ${section.section_id} (${section.kind}) cannot be presented as ${presentation}; it can be ${Object.keys(kind.presentations).join(', ')}`);
  return { component, presentation, media: kind.media ?? null };
}

// Sections whose body is longer than their component holds (block-kinds components.<c>.words.body): rendered as written
// (copy is never cut), listed on the import report for Site Factory, whose plan stays within the table.
export function overLength(page, table = BLOCK_KINDS) {
  if (!isKindPage(page)) return [];
  return page.sections.flatMap((section) => {
    const { component } = componentOf(page, section, table);
    const maximum = table.components[component]?.words?.body?.[1];
    const words = (section.body ?? '').split(/\s+/).filter(Boolean).length;
    return maximum != null && words > maximum ? [{ route: page.url, sectionId: section.section_id, kind: section.kind, component, words, maximum }] : [];
  });
}

// Blocks and the mapping of a page written by kind, in the order of its sections, closed by the call to action.
export function planKindBlocks(page, { styles = new Map(), table = BLOCK_KINDS } = {}) {
  if (!page.sections?.length) throw new Error(`${page.page_id}: sections are empty`);
  const blocks = [];
  const mapping = [];
  let closing = null;
  // A section longer than its component holds may go on in sections of its own (continuation_of: the first one's id, its
  // kind, no heading): each renders as the section going on, without a heading, its block marked continues.
  const firsts = new Map();
  for (const section of page.sections) {
    if (section.kind == null) throw new Error(`${page.page_id}: section ${section.section_id} has no kind (a page written by kind names one for every section)`);
    const { component, presentation, media } = componentOf(page, section, table);
    // The contract's default is "" (no continuation), as in SF's 2026-10-27 package.
    const goesOn = section.continuation_of || null;
    if (goesOn != null && !firsts.has(goesOn)) throw new Error(`${page.page_id}: section ${section.section_id} continues ${goesOn}, which is not a section before it`);
    if (goesOn != null && firsts.get(goesOn).kind !== section.kind) throw new Error(`${page.page_id}: section ${section.section_id} continues ${goesOn}, a ${firsts.get(goesOn).kind} section, as ${section.kind}`);
    const [blockStart, mappingStart] = [blocks.length, mapping.length];
    // The competitor's module for this component and the photography the kind asks for.
    const design = { ...(styles.get(component) ? { variant: styles.get(component) } : {}), ...(media ? { mediaKind: media } : {}) };
    // A section's block keeps the section's id, except the closing band's own id (a section named "cta" that is not the
    // closing band).
    const add = (block) => { blocks.push(block.id === 'cta' && block.type !== 'cta' ? { ...block, id: `cta-${section.kind}` } : block); mapping.push({ sectionId: section.section_id, blockType: block.type, kind: section.kind, rule: `kind ${section.kind} (${presentation})` }); };
    switch (component) {
      case 'intro':
      case 'proof':
        add({ ...textBlock(component, section), ...design });
        break;
      case 'splitMedia':
        add({ ...textBlock('splitMedia', section), media: null, ...design });
        break;
      case 'featureGrid': {
        // A list with an untitled line is no set of cards (a card is titled): it shows as a list.
        if (listItems(page, section).some((item) => !item.heading)) {
          add({ ...listBlock(page, section), ...(styles.get('iconList') ? { variant: styles.get('iconList') } : {}) });
          mapping.at(-1).rule += ', a list (an item has no title)';
          break;
        }
        // Cards come in equal grids of at most four (5 -> 3+2 ...); the first grid carries the heading and the lead, the
        // others go on from it (continues), so the audit counts the section once (lib/visual-checks.mjs sectionBlocks).
        const items = listItems(page, section).map(({ heading, text, placeholder }) => ({ heading, paragraphs: paragraphsOf(text), ...(placeholder ? { placeholder: true } : {}) }));
        chunkCards(items).forEach((chunk, index) => {
          const block = { id: index ? `${section.section_id}-${index + 1}` : section.section_id, type: 'featureGrid', sourceSectionIds: [section.section_id], ...(index ? { continues: section.section_id } : { heading: section.heading, ...leadOf(section) }), items: chunk, ...design };
          blocks.push(block);
        });
        mapping.push({ sectionId: section.section_id, blockType: 'featureGrid', kind: section.kind, rule: `kind ${section.kind} (${presentation}, ${items.length} cards)` });
        break;
      }
      case 'iconList':
        add({ ...listBlock(page, section), ...design });
        break;
      case 'process':
        // A flow (its steps or a site-wide flow's): the step's name, what we do, what the client gives and how long it
        // takes; else the list items (title, text).
        add(section.steps != null
          ? { id: section.section_id, type: 'process', sourceSectionIds: [section.section_id], ...(section.heading ? { heading: section.heading } : {}), ...flowLead(section), steps: flowSteps(page, section, table.components.process?.items).map(({ name, weDo, provides, duration }) => ({ heading: name, text: weDo, ...(provides ? { provides } : {}), ...(duration ? { duration } : {}) })), ...design }
          : { id: section.section_id, type: 'process', sourceSectionIds: [section.section_id], heading: section.heading, ...leadOf(section), steps: listItems(page, section), ...design });
        break;
      case 'stats':
        add({ id: section.section_id, type: 'stats', sourceSectionIds: [section.section_id], ...(section.heading ? { heading: section.heading } : {}), ...leadOf(section), items: sectionItems(page, section, ['value', 'label']).map(({ value, unit, label, note }) => ({ value: String(value), ...(unit?.trim() ? { unit: unit.trim() } : {}), label: label.trim(), ...(note?.trim() ? { note: note.trim() } : {}) })), ...(styles.get('stats') ? { variant: styles.get('stats') } : {}) });
        break;
      case 'pricing':
        add({ id: section.section_id, type: 'pricing', sourceSectionIds: [section.section_id], ...(section.heading ? { heading: section.heading } : {}), ...leadOf(section), items: sectionItems(page, section, ['title', 'price.amount', 'text']).map(({ title, price, text }) => ({ heading: title.trim(), price: { amount: String(price.amount).trim(), ...(price.unit?.trim() ? { unit: price.unit.trim() } : {}), ...(price.note?.trim() ? { note: price.note.trim() } : {}) }, text: text.trim() })) });
        break;
      case 'swatches':
        add({ id: section.section_id, type: 'swatches', sourceSectionIds: [section.section_id], ...(section.heading ? { heading: section.heading } : {}), ...leadOf(section), items: sectionItems(page, section, ['name']).map(({ name, colour, composition }) => ({ name: name.trim(), ...(colour ? { colour } : {}), ...(composition?.trim() ? { composition: composition.trim() } : {}) })) });
        break;
      case 'gallery': {
        // Captioned photos the template supplies (a trims group): the caption is the item's title, nothing else is shown.
        const items = sectionItems(page, section, ['title']);
        const worded = items.find((item) => item.text?.trim());
        if (worded) throw new Error(`${page.page_id}: section ${section.section_id} (photos): a photo is captioned by its title; "${worded.text.slice(0, 40)}" would not be shown`);
        if (section.body?.trim()) throw new Error(`${page.page_id}: section ${section.section_id} (photos) has a body a photo group does not show`);
        add({ id: section.section_id, type: 'gallery', sourceSectionIds: [section.section_id], ...(section.heading ? { heading: section.heading } : {}), items: items.map(({ title }) => ({ caption: title.trim() })), ...(styles.get('gallery') ? { variant: styles.get('gallery') } : {}), ...(media ? { mediaKind: media } : {}) });
        break;
      }
      case 'faq': {
        // The pairs as 07 writes them since 10-24 (qa: [{ question, answer }], the body empty), else an older package's
        // body of question paragraphs.
        const items = section.qa?.length ? section.qa.map(({ question, answer }) => ({ question, answer })) : parseFaq(section.body ?? '');
        if (!items?.length) throw new Error(`${page.page_id}: section ${section.section_id} (faq) has no question/answer pairs`);
        const empty = items.find((item) => !item.question?.trim() || !item.answer?.trim());
        if (empty) throw new Error(`${page.page_id}: section ${section.section_id} (faq) has a pair without its question or answer: ${JSON.stringify(empty).slice(0, 80)}`);
        // More pairs than a block holds (the contract's cardinality) go on in blocks of their own, in order, the heading on
        // the first (a FAQ page of 39 questions: 20 + 19).
        const most = CARDINALITY.faq[1];
        for (let index = 0; index < items.length; index += most) blocks.push({ id: index ? `${section.section_id}-${index / most + 1}` : section.section_id, type: 'faq', sourceSectionIds: [section.section_id], ...(index ? {} : { heading: section.heading }), items: items.slice(index, index + most), ...design });
        mapping.push({ sectionId: section.section_id, blockType: 'faq', kind: section.kind, rule: `kind ${section.kind} (${presentation}, ${items.length} pairs)` });
        break;
      }
      case 'table': {
        // A flow as a table: a row per step, its name, what we do, what the client gives and how long it takes (a
        // column no step fills is left out); the page's sentence and the section's body lead it.
        if (section.steps != null) {
          const steps = flowSteps(page, section, table.components.process?.items);
          const columns = [['Step', 'name'], ['What we do', 'weDo'], ['What you provide', 'provides'], ['Time', 'duration']].filter(([, key]) => steps.some((step) => step[key]));
          add({ id: section.section_id, type: 'table', sourceSectionIds: [section.section_id], ...(section.heading ? { heading: section.heading } : {}), ...flowLead(section), columns: columns.map(([label]) => label), rows: steps.map((step) => columns.map(([, key]) => step[key] ?? '')), ...design });
          break;
        }
        // A lead and a GFM table (lib/markdown-table.mjs); a section presented as a table without one is an error,
        // never quietly prose.
        const parsed = markdownTable(section.body ?? '');
        if (!parsed?.rows.length) throw new Error(`${page.page_id}: section ${section.section_id} (${section.kind}) is presented as a table but its body holds no Markdown table`);
        add({ id: section.section_id, type: 'table', sourceSectionIds: [section.section_id], heading: section.heading, ...(parsed.lead.length ? { paragraphs: parsed.lead } : {}), columns: parsed.columns, rows: parsed.rows, ...(parsed.after.length ? { notes: parsed.after } : {}), ...design });
        break;
      }
      case 'cta':
        // The closing band going on: its text after the band's own. What its sections ask to show goes with the band
        // (it is no block of the loop below; lib/media-slots.mjs puts it before the band).
        closing = goesOn != null && closing
          ? { ...closing, paragraphs: [...closing.paragraphs, ...paragraphsOf(section.body ?? '')], sourceSectionIds: [...closing.sourceSectionIds, section.section_id], visuals: [...closing.visuals, ...(section.visuals ?? [])] }
          : { heading: section.heading, paragraphs: paragraphsOf(section.body ?? ''), sourceSectionIds: [section.section_id], visuals: section.visuals ?? [] };
        mapping.push({ sectionId: section.section_id, blockType: 'cta', kind: section.kind, rule: 'kind cta (the closing band)' });
        break;
      default:
        throw new Error(`${page.page_id}: section ${section.section_id}: no renderer for component ${component}`);
    }
    // What the section asks to show (its visuals: a photo's subject and setting, or data) goes with its first block;
    // the template decides where and how (lib/media-slots.mjs, lib/visual-data.mjs).
    if (section.visuals?.length && blocks[blockStart]) blocks[blockStart] = { ...blocks[blockStart], visuals: section.visuals };
    if (goesOn == null) firsts.set(section.section_id, { kind: section.kind, blockId: blocks[blockStart]?.id ?? null });
    else {
      for (let index = blockStart; index < blocks.length; index += 1) {
        const { heading, ...block } = blocks[index];
        blocks[index] = { ...block, continues: firsts.get(goesOn).blockId };
      }
      for (const entry of mapping.slice(mappingStart)) entry.rule += `, continuing ${goesOn}`;
    }
  }
  const cta = closingBlock(page, closing);
  if (cta) blocks.push({ ...cta, ...(styles.get('cta') ? { variant: styles.get('cta') } : {}) });
  return { blocks, mapping };
}
