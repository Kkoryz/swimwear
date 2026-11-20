// Structured data (sf/structured/v1) of a Site Factory page: key figures, process steps and a comparison table, each
// figure checked word for word against the approved facts before it is placed among the prose blocks.

import { factApproved, factConfirmed } from './facts.mjs';

export const normalizeFact = (text) => text.toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();
// A value is stated in a fact where the fact holds it verbatim and no digit runs on at either end: "5" is not stated in
// "50 sewing lines", nor "500" in "1,500 pieces" (fact and value both normalised by the caller).
export function statedIn(fact, value) {
  if (!value) return false;
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp((/^\d/.test(value) ? '(?<!\\d|\\d[.,])' : '') + escaped + (/\d$/.test(value) ? '(?!\\d|[.,]\\d)' : '')).test(fact);
}

// A page may carry facts of its own (a page-level fact such as the offer its site-plan line states).
export const pageFactsOf = (source, facts) => (Array.isArray(source.facts) && source.facts.length
  ? new Map([...(facts || []), ...source.facts.map((fact) => [fact.fact_id, { text: fact.text, approved: factApproved(fact), confirmed: factConfirmed(fact) }])])
  : facts);

// Every fact id a page cites anywhere (sections, key figures, process steps, comparison).
export function citedFactIds(value, found = new Set()) {
  if (Array.isArray(value)) value.forEach((item) => citedFactIds(item, found));
  else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (key === 'fact_id' && typeof item === 'string') found.add(item);
      else if (key === 'fact_ids' && Array.isArray(item)) item.forEach((id) => found.add(id));
      // Industry knowledge cards are never company facts.
      else if (key !== 'facts' && key !== 'knowledge') citedFactIds(item, found);
    }
  }
  return found;
}

// A figure's value is a claim: it must be stated verbatim in the approved fact it cites.
export function verifyStructured(pageId, structured, facts) {
  for (const [index, figure] of (structured.key_figures || []).entries()) {
    const fact = facts.get(figure.fact_id);
    if (!fact) throw new Error(`${pageId}: key_figures[${index}] cites unknown fact ${figure.fact_id}`);
    if (!fact.approved) throw new Error(`${pageId}: key_figures[${index}] cites fact ${figure.fact_id}, which is not approved for public use`);
    if (!statedIn(normalizeFact(fact.text), normalizeFact(figure.value))) throw new Error(`${pageId}: key figure "${figure.value}" is not stated in fact ${figure.fact_id}`);
  }
  // Every other cited fact must exist and be approved for public use too.
  const cited = [
    ...(structured.process_steps || []).flatMap((step, index) => (step.fact_ids || []).map((id) => [`process_steps[${index}]`, id])),
    ...(structured.comparison?.fact_ids || []).map((id) => ['comparison', id]),
  ];
  verifyCited(pageId, cited, facts);
}

// Facts a page's list sections cite (section items' fact_ids): each must exist and be approved for public use. A
// stand-in item (placeholder: true) is Site Factory's copy built on facts not approved yet, shown marked until the owner
// replaces it (Fable 2026-11-11): its facts must exist, approved or not.
export function verifySectionFacts(page, facts) {
  const cited = (page.sections || []).flatMap((section) => (section.items || []).flatMap((item, index) => (item.fact_ids || []).map((id) => [`${section.section_id} item ${index + 1}`, id, item.placeholder === true])));
  if (!cited.length) return;
  if (!facts) throw new Error(`${page.page_id}: list items cite facts: --facts is needed to verify them`);
  verifyCited(page.page_id, cited, facts);
}

// cited: [where, fact id, stand-in] (a stand-in's fact need not be approved).
export function verifyCited(pageId, cited, facts) {
  for (const [where, id, standIn = false] of cited) {
    if (!facts.has(id)) throw new Error(`${pageId}: ${where} cites unknown fact ${id}`);
    if (!standIn && !facts.get(id).approved) throw new Error(`${pageId}: ${where} cites fact ${id}, which is not approved for public use`);
  }
}

// Default placement spreads the three text-only patterns between media-backed sections: figures right after the
// intro, process after the first body section (split, cards or gallery), comparison before the proof section.
// Without a body section the process goes before the FAQ; without a proof the comparison goes before the FAQ.
export function placeStructured(blocks, mapping, structured) {
  const insert = (block, anchor, rule) => {
    const at = anchor(blocks);
    blocks.splice(at < 0 ? blocks.length - (blocks.at(-1)?.type === 'cta' ? 1 : 0) : at, 0, block);
    mapping.push({ sectionId: `structured.${block.id}`, blockType: block.type, rule });
  };
  const after = (type) => (list) => { const index = list.findIndex((block) => block.type === type); return index < 0 ? -1 : index + 1; };
  const before = (type) => (list) => list.findIndex((block) => block.type === type);
  if (structured.key_figures?.length) {
    insert({ id: 'key-figures', type: 'stats', sourceSectionIds: [], ...(structured.key_figures_title ? { heading: structured.key_figures_title } : {}), items: structured.key_figures.map((figure) => ({ value: figure.value, label: figure.label, ...(figure.note?.trim() ? { note: figure.note.trim() } : {}) })), factIds: structured.key_figures.map((figure) => figure.fact_id) }, after('intro'), `structured key figures (${structured.key_figures.length})`);
  }
  if (structured.comparison) {
    const { title, columns, rows } = structured.comparison;
    insert({ id: 'comparison', type: 'table', sourceSectionIds: [], ...(title ? { heading: title } : {}), columns, rows }, (list) => { const proof = before('proof')(list); return proof >= 0 ? proof : before('faq')(list); }, `structured comparison (${rows.length} rows)`);
  }
  if (structured.process_steps?.length) {
    insert({ id: 'process-steps', type: 'process', sourceSectionIds: [], ...(structured.process_title ? { heading: structured.process_title } : {}), steps: structured.process_steps.map((step) => (step.title || step.placeholder ? { ...(step.title ? { heading: step.title } : {}), text: step.text, ...(step.placeholder ? { placeholder: true } : {}) } : step.text)) }, (list) => { const body = list.findIndex((block) => ['splitMedia', 'featureGrid', 'gallery'].includes(block.type)); return body >= 0 ? body + 1 : before('faq')(list); }, `structured process steps (${structured.process_steps.length})`);
  }
}
