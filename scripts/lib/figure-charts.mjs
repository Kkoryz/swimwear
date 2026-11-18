// A page's lead times drawn from the data it already holds (four-site audit 2026-11-17, Fable's plan G8: claude-seo
// seo-geo multi-modal "infographics and charts", Google's AI guidance on supporting text with visuals): the times a page
// states as figures (src/data/page-figures.json, each word for word in its text), in its order terms table (the owner
// slot from site-proof.json's terms, the approved facts) and in the site's trust figures (site-trust.json) the page's
// text states, drawn as durations on one time scale (lib/visual-data.mjs: only time is drawn on a scale), so sampling
// and bulk production read in proportion. A deterministic rule: the numbers, units and labels are the data's, never
// converted (no weeks made into days), no word of Site Factory's copy changed. Fewer than two times in one unit, or a
// page that already draws its times from Site Factory's visuals, draws nothing. The chart follows the section whose
// text states the most of its times; with none, it is not drawn.

import { slotBlockId } from './slot-blocks.mjs';

// A time: a number or a range ("10 to 15", "10-15", "10–15") and its unit.
const TIME = /(\d+(?:\.\d+)?)(?:\s*(?:-|–|—|to)\s*(\d+(?:\.\d+)?))?\s+(working days?|business days?|days?|weeks?|months?|hours?)(?![\w-])/gi;
const plural = (unit) => (unit.endsWith('s') ? unit : `${unit}s`);
const norm = (text) => String(text ?? '').replace(/[‐-―]/g, '-').replace(/\s+/g, ' ').trim().toLowerCase();
export const CHART_TIMES_MAX = 8;
// A time is drawn when its label says how long a piece of the work takes (a lead time, sampling, production,
// delivery...): terms of a contract (a notice period, a replacement guarantee, an engagement's length) are not lead
// times and do not go on one scale with them (the four sites' figures, 2026-11-17: Staylumen's 30-day cancellation
// notice beside its 7-14 day launch, the motel site's 90-day replacement period beside its hiring times).
export const LEAD_TIME_LABEL = /\b(?:times?|lead|turnaround|production|sampl(?:e|es|ing)|delivery|dispatch|shipping|transit|set-?up|launch|timeline)\b/i;

// The one time a text states ({ min, max, unit, stated }), or null when it states none or several. whole: the text is
// the time and nothing else (a figure's value).
export function timeIn(text, { whole = false } = {}) {
  const value = String(text ?? '').trim();
  const found = [...value.matchAll(TIME)];
  if (found.length !== 1) return null;
  const [stated, low, high, unit] = found[0];
  if (whole && stated.length !== value.length) return null;
  const min = Number(low);
  const max = Number(high ?? low);
  return max >= min ? { min, max, unit: plural(unit.toLowerCase()), stated } : null;
}

// Every string a block shows, ids and links left out.
const strings = (value, key = '') => {
  if (typeof value === 'string') return /^(id|href|src|type|variant|route|image|media)$/i.test(key) ? [] : [value];
  if (Array.isArray(value)) return value.flatMap((item) => strings(item, key));
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([name, item]) => strings(item, name));
  return [];
};
const blockText = (block) => norm(strings(block).join('\n'));
// Whether a text states a phrase as a whole (no "5 days" inside "45 days").
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const states = (text, phrase) => new RegExp(`(?<![\\w.,])${escape(norm(phrase))}(?![\\w])`).test(text);

// The chart of a page's times: { after: block id, chart: { kind: 'ranges', unit, items, alt } }, or null.
// figures: the page's own (page-figures.json[route]); trust: site-trust.json.
/** @typedef {{ id: string, type: string, rows?: string[][], visuals?: { type?: string, data?: { shape?: string } }[] }} TimeBlock */
/** @type {(page: object | null, blocks?: TimeBlock[], data?: { figures?: { value: string, label: string }[], trust?: { items?: { value: string, label: string }[] } | null }) => { after: string, chart: { kind: 'ranges', unit: string, items: { label: string, min: number, max: number }[], alt: string } } | null} */
export function figureChart(page, blocks = page?.blocks ?? [], { figures = [], trust = null } = {}) {
  if (!page || blocks.some((block) => (block.visuals ?? []).some((visual) => visual?.type === 'data' && visual.data?.shape === 'periods'))) return null;
  const texts = blocks.map((block) => ({ id: block.id, type: block.type, text: blockText(block) }));
  const stated = (value) => texts.some((block) => states(block.text, value));
  const terms = blocks.find((block) => block.id === slotBlockId('owner', 'orderTerms') && block.type === 'table');
  const candidates = [
    ...(figures ?? []).map((figure) => ({ label: figure.label, time: timeIn(figure.value, { whole: true }) })),
    ...(terms?.rows ?? []).map((row) => ({ label: row[0], time: timeIn(row.slice(1).join(' ')) })),
    ...(trust?.items ?? []).filter((item) => stated(item.value)).map((item) => ({ label: item.label, time: timeIn(item.value, { whole: true }) })),
  ].filter((item) => item.time && typeof item.label === 'string' && LEAD_TIME_LABEL.test(item.label));
  const seen = new Set();
  const times = candidates.filter((item) => { const key = `${item.time.min}-${item.time.max}-${item.time.unit}`; if (seen.has(key)) return false; seen.add(key); return true; });
  const units = [...new Set(times.map((item) => item.time.unit))];
  const unit = units.sort((a, b) => times.filter((item) => item.time.unit === b).length - times.filter((item) => item.time.unit === a).length)[0];
  const drawn = times.filter((item) => item.time.unit === unit).slice(0, CHART_TIMES_MAX);
  if (drawn.length < 2) return null;
  // The section that states the most of the times (the first of equals); a closing band is no place for it.
  const host = texts.filter((block) => block.type !== 'cta').map((block) => ({ id: block.id, count: drawn.filter((item) => states(block.text, item.time.stated)).length })).filter((block) => block.count > 0).sort((a, b) => b.count - a.count)[0];
  if (!host) return null;
  const items = drawn.map((item) => ({ label: item.label.trim(), min: item.time.min, max: item.time.max }));
  return { after: host.id, chart: { kind: 'ranges', unit, items, alt: drawn.map((item) => `${item.label.trim()}: ${item.time.stated}`).join('; ') } };
}
