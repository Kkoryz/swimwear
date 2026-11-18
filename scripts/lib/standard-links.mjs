// Standards and certifications the copy names link to their standard body's own page, once a page (four-site audit
// 2026-11-17, C7/G2: site13 named OEKO-TEX, GRS, RCS, bluesign, ISO 9001, WRAP and BSCI with no source, zero
// outbound links; claude-seo seo-content external linking, seo-geo "Citations to primary sources"). The table is
// config/standard-bodies.json. A deterministic step of the assembly: the first time a page's copy names a standard,
// those very words become a link ([words](url), the inline link the copy's own links use); no word changes, no
// verification link (owner 2026-11-17: no verification buttons). Only the fields the template renders with their
// inline links are read (InlineText.astro): section and card paragraphs, list items, price and step texts, answers.

import table from '../../config/standard-bodies.json' with { type: 'json' };

export const STANDARDS = Object.freeze(table.standards);

const INLINE_LINK = /\[[^\]]+\]\([^)\s]+\)/g;
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// One pattern for the table: every spelling, longest first, standing as words of their own (no letter or digit on
// either side: "GRS" in "GRS-certified" yes, in "GRSX" no).
function matcher(standards) {
  const names = standards.flatMap((standard) => standard.names.map((name) => ({ name, standard }))).sort((left, right) => right.name.length - left.name.length);
  const byName = new Map(names.map((entry) => [entry.name, entry.standard]));
  return { pattern: new RegExp(`(?<![\\p{L}\\p{N}])(?:${names.map((entry) => escape(entry.name)).join('|')})(?![\\p{L}\\p{N}])`, 'gu'), byName };
}

// One text with the standards not linked on the page yet (linked: their ids) linked at their first mention; text inside
// a link the copy already has stays as it is.
function linkText(text, { pattern, byName }, linked) {
  if (typeof text !== 'string' || !text) return text;
  let out = '';
  let last = 0;
  const plain = (part) => part.replace(pattern, (words) => {
    const standard = byName.get(words);
    if (!standard || linked.has(standard.id)) return words;
    linked.add(standard.id);
    return `[${words}](${standard.url})`;
  });
  for (const match of text.matchAll(INLINE_LINK)) {
    out += plain(text.slice(last, match.index)) + match[0];
    last = match.index + match[0].length;
  }
  return out + plain(text.slice(last));
}

// The page's blocks with each standard linked at its first mention, in page order (a new list; the page's data is not
// changed, so its content date and hash stay). standards: the table (config/standard-bodies.json).
export function linkStandards(blocks, standards = STANDARDS) {
  if (!standards.length) return blocks;
  const match = matcher(standards);
  const linked = new Set();
  const text = (value) => linkText(value, match, linked);
  const list = (values) => (Array.isArray(values) ? values.map(text) : values);
  return blocks.map((block) => {
    const next = { ...block };
    if (Array.isArray(block.paragraphs)) next.paragraphs = list(block.paragraphs);
    if (Array.isArray(block.items)) {
      next.items = block.items.map((item) => {
        if (!item || typeof item !== 'object') return item;
        const own = { ...item };
        if (Array.isArray(item.paragraphs)) own.paragraphs = list(item.paragraphs);
        if (['iconList', 'pricing'].includes(block.type) && typeof item.text === 'string') own.text = text(item.text);
        if (block.type === 'faq' && typeof item.answer === 'string') own.answer = text(item.answer);
        return own;
      });
    }
    if (block.type === 'process' && Array.isArray(block.steps)) next.steps = block.steps.map((step) => (step && typeof step === 'object' && typeof step.text === 'string' ? { ...step, text: text(step.text) } : step));
    return next;
  });
}
