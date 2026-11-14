// Each page's own key figures for the band under its hero (owner 2026-10-30: the site-wide band showed site10's one
// approved figure, "2011 since", on every page; a page shows its own important figures instead). A judge lists a
// page's figures most important first (config/agent-steps/page-figures.md); one is kept only when the page's text
// states it word for word, with a label of at most FIGURE_LABEL_WORDS words. A figure that many of the site's pages
// state (the ordering terms every product page repeats) comes after the page's own and only fills the room they leave,
// so pages do not all show the same band.

export const PAGE_FIGURES_SCHEMA = 'seo-site-page-figures-v1';
export const FIGURES_MAX = 4;
// A page with none of its own shows this many of the common ones.
export const FIGURES_COMMON_ONLY = 3;
export const FIGURE_LABEL_WORDS = 4;
// The page types that keep the site-wide band (founding year, certificates), and those with no band.
export const SITE_BAND_PAGE_TYPES = Object.freeze(['home', 'about']);
export const NO_BAND_PAGE_TYPES = Object.freeze(['privacy']);
// Never on the band, whatever the judge lists (owner 2026-10-30): money (prices, fees, rates, surcharges, discounts,
// deposits) and examples. site10's bands led with a 40% small-order surcharge, a wetsuit price its text had taken from a
// competitor, and an example fabric blend.
const NOT_SHOWN = /[$€£¥]|\b(?:US\$|USD|EUR|GBP|RMB|CNY)\b|\b(?:price|prices|pricing|fee|fees|cost|costs|rate|rates|surcharge|discount|deposit|example|e\.g\.)\b/i;
// Left out of a page's text: stand-ins (case studies, testimonials, the owner's proof) and lists of links.
const SKIP_BLOCKS = new Set(['caseStudies', 'testimonials', 'relatedPages', 'logos']);

export const normalizeText = (text) => String(text).replace(/[‐-―]/g, '-').replace(/\s+/g, ' ').trim().toLowerCase();

// Every string a value shows, ids, types and links left out.
const strings = (value, key = '') => {
  if (typeof value === 'string') return /^(id|href|src|type|route|image|media|variant)$/i.test(key) || /^(\/|https?:)/.test(value) ? [] : [value];
  if (Array.isArray(value)) return value.flatMap((item) => strings(item, key));
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([name, item]) => strings(item, name));
  return [];
};

// The text a page's own blocks show (its hero heading included).
export function pageText(page) {
  const blocks = (page.blocks ?? []).filter((block) => !SKIP_BLOCKS.has(block.type) && !String(block.id ?? '').startsWith('owner-') && !block.placeholder);
  return [page.hero?.heading, ...blocks.flatMap((block) => strings(block))].filter(Boolean).join('\n');
}

// The figures a reply lists: [{ value, label }].
export function parseFigures(reply) {
  const line = String(reply ?? '').trim().split('\n').reverse().find((text) => text.trim().startsWith('{'));
  const figures = JSON.parse(line ?? '').figures;
  if (!Array.isArray(figures)) throw new Error('no figures list in the reply');
  return figures.filter((figure) => typeof figure?.value === 'string' && typeof figure?.label === 'string').map(({ value, label }) => ({ value: value.trim(), label: label.trim() }));
}

// The band of a page from the judge's figures: those its text states word for word, the page's own first.
// siteTexts: every page's normalized text, to tell a common figure from the page's own.
export function pickFigures(candidates, text, siteTexts) {
  const own = normalizeText(text);
  const seen = new Set();
  const valid = candidates.filter((figure) => {
    const value = normalizeText(figure.value);
    if (!/\d/.test(value) || !own.includes(value) || figure.label.split(/\s+/).length > FIGURE_LABEL_WORDS || seen.has(value) || NOT_SHOWN.test(`${figure.value} ${figure.label}`)) return false;
    seen.add(value);
    return true;
  });
  const commonAt = Math.ceil(siteTexts.length / 4);
  const common = (figure) => siteTexts.filter((other) => other.includes(normalizeText(figure.value))).length > commonAt;
  const mine = valid.filter((figure) => !common(figure));
  const shared = valid.filter(common);
  return (mine.length ? [...mine, ...shared].slice(0, FIGURES_MAX) : shared.slice(0, FIGURES_COMMON_ONLY)).map(({ value, label }) => ({ value, label }));
}
