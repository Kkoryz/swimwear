// A page title sized to its own words (owner 2026-11-12: at most two lines on a desktop). The competitor's title size
// is the ceiling (--size-hero), but a competitor whose titles are one or two words gives that size to a ten-word title
// of ours, which then wraps four or five times. Each title gets the largest size at which it wraps to at most two lines
// on a desktop and four on a phone, never below a floor, and its column may widen to the container to hold it there.
//
// The model: a title's words wrap greedily into lines of a capacity counted in characters (a space counts as one);
// the smallest capacity that keeps the title within its lines, times the font's average character width (in em),
// is the line's width in ems. That is independent of the column, so the renderer writes it as CSS custom properties
// and the stylesheet divides the column's real width by it (container query units): a size per page and per width.

// Desktop titles: two lines, at least 36px. Phone titles: four lines, at least 24px. Below 24px a phone title is barely
// above the lead (17-18px) and under the section headings a phone shows (24-28px), so it stops reading as the title;
// 24px still fits four lines of a 60-character title in a 360px column (15 characters a line at 0.68em).
export const HERO_FIT = Object.freeze({ desktop: { lines: 2, minPx: 36 }, phone: { lines: 4, minPx: 24 } });
// A blog post's title keeps the floor its own scale already has (patterns.css .post-header__title, 1.75rem); on a phone
// the hero's 24px, the size of the article's own largest headings there (an 86-character question took six lines at
// 28px).
export const POST_TITLE_FIT = Object.freeze({ desktop: { lines: 2, minPx: 28 }, phone: { lines: 4, minPx: 24 } });
// Section headings: past three lines the audit warns (scripts/audit-authoring-layout.mjs section_heading_lines).
export const SECTION_HEADING_MAX_LINES = 3;

// Real letters are wider or narrower than the average; a line of the capacity's characters may be wider than the
// average says. The capacity is widened by this much so such a line still fits.
export const WRAP_MARGIN = 1.05;

// Average character widths (em, spaces included) where the competitor's own title could not be measured, by kind of
// family and case. Conservative: at the wide end of common faces, so a title is a little small rather than one line
// too long. Measured for reference: Josefin Sans bold caps 0.60-0.66, Georgia mixed case 0.50-0.53, Inter/Helvetica
// mixed case 0.52-0.56.
export const DEFAULT_CHAR_EM = Object.freeze({
  sans: { upper: 0.68, mixed: 0.57 },
  serif: { upper: 0.7, mixed: 0.55 },
  mono: { upper: 0.62, mixed: 0.62 },
});
// The widest kind: a family nobody named is taken for capitals in a sans.
export const UNKNOWN_CHAR_EM = DEFAULT_CHAR_EM.sans.upper;
// A measured average needs this many characters of the competitor's titles; fewer ("ABOUT") say little about a face.
export const MIN_MEASURED_CHARS = 12;

const SERIF = /\b(serif|georgia|times|garamond|baskerville|caslon|freight|playfair|merriweather|lora|source serif|libre baskerville|crimson|cormorant|didot|bodoni|minion|charter|cambria|palatino|book antiqua)\b/i;
const MONO = /\b(mono|monospace|courier|consolas|menlo|code)\b/i;

// The first family of a font-family list, without quotes.
const firstFamily = (family = '') => String(family).split(',')[0].trim().replace(/^["']|["']$/g, '');
export function familyKind(family) {
  const first = firstFamily(family);
  if (!first) return null;
  // "sans-serif" names a sans before the serif pattern can match it.
  if (/sans/i.test(first)) return 'sans';
  if (MONO.test(first)) return 'mono';
  if (SERIF.test(first)) return 'serif';
  return 'sans';
}

// The average character width (em) a title is sized with: the competitor's title measured at capture
// (template-variants.json components.heroText, scaffold-placeholder-pages.mjs measureHeroText) when the sample is long
// enough, else the default of its family and case, else the widest default.
/** @param {{ charEm?: number, chars?: number, family?: string, textTransform?: string } | null} [heroText] */
export function charEmFor(heroText = null) {
  const measured = heroText?.charEm;
  if (typeof measured === 'number' && measured >= 0.3 && measured <= 1.2 && (heroText.chars ?? 0) >= MIN_MEASURED_CHARS) return measured;
  const kind = familyKind(heroText?.family);
  if (!kind) return UNKNOWN_CHAR_EM;
  return DEFAULT_CHAR_EM[kind][heroText?.textTransform === 'uppercase' ? 'upper' : 'mixed'];
}

// Capitals vary more in width than lower case (M and W about twice I), and a line of long capital words runs wider than
// their average says: "HOTEL MANAGEMENT" at 0.70-0.77em a letter in a title averaging 0.635 took the hotel site's
// phone titles to five lines. A title set in capitals wraps on its average widened by this much (measured there: 1.12
// keeps all five of its ten-word titles within four phone lines with a little room).
export const CAPS_SPREAD = 1.12;
// The average character width (em) a title's lines are fitted with: charEmFor's, widened for capitals.
/** @param {{ charEm?: number, chars?: number, family?: string, textTransform?: string } | null} [heroText] */
export const wrapEmFor = (heroText = null) => charEmFor(heroText) * (heroText?.textTransform === 'uppercase' ? CAPS_SPREAD : 1);

const words = (text) => String(text ?? '').trim().split(/\s+/).filter(Boolean);

// Whether a page's lead stays on its hero photo: while it is about as long as the competitor's (heroText.leadWords,
// measured at capture) or a short line; a longer one opens the page under the hero instead, word for word (owner
// 2026-11-12: "副标题是不是太长 你看看竞品的": Concord's mastheads carry their title alone, ours a 20-word paragraph).
export const HERO_LEAD_SLACK = 8;
// Whether a page sets its hero's lead under the hero, as text of its own (PageView.astro page-lead): a photo hero
// whose lead runs much longer than the competitor's. One function for the renderer, the layout plan and the visual
// budget (motel /our-process/ 2026-11-14: the budget counted a 40-word lead as hero photo and planned no wall).
/** @param {{ hero?: { lead?: string[] } }} page @param {string} heroVariant @param {{ heroText?: { leadWords?: number } | null }} [components] */
export const leadBelowHero = (page, heroVariant, components = {}) => ['media-overlay', 'media-form'].includes(heroVariant) && Boolean(page.hero?.lead?.length) && !heroLeadShown(page.hero?.lead, components.heroText);

/** @param {string[]} [lead] @param {{ leadWords?: number } | null} [heroText] */
export function heroLeadShown(lead = [], heroText = null) {
  const competitor = heroText?.leadWords;
  if (typeof competitor !== 'number') return true;
  return lead.reduce((sum, paragraph) => sum + words(paragraph).length, 0) <= Math.max(competitor * 1.5, competitor + HERO_LEAD_SLACK);
}

// The lines a title wraps to when a line holds `capacity` characters (greedy, as browsers wrap: a word longer than a
// line takes a line of its own).
export function wrapLines(text, capacity) {
  const lines = [];
  for (const word of words(text)) {
    const last = lines.at(-1);
    if (last !== undefined && last.length + 1 + word.length <= capacity) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  return lines;
}

// The smallest whole capacity (characters a line) at which the title wraps to at most maxLines lines.
export function lineCapacity(text, maxLines) {
  const parts = words(text);
  if (!parts.length) return 0;
  const total = parts.join(' ').length;
  let low = Math.max(...parts.map((word) => word.length));
  let high = total;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (wrapLines(text, middle).length <= maxLines) high = middle; else low = middle + 1;
  }
  return low;
}

// The title's line width in ems at its line limit (capacity x average width x margin): the column's width divided by
// it is the largest size that keeps the title within its lines.
export const lineEms = (text, maxLines, charEm) => lineCapacity(text, maxLines) * charEm * WRAP_MARGIN;

const round = (value, places = 3) => Math.round(value * 10 ** places) / 10 ** places;

// The size and column a title gets in a column of columnPx (widest: containerPx), under the competitor's capPx: the
// largest size within maxLines, not above the cap; below the floor, the column widens (up to the container) until the
// floor fits, and the title takes the floor (or the cap, when the competitor's own size is smaller still).
// Returns { sizePx, columnPx, lines (as the model wraps it at that size), fits }.
export function fitHeading(text, { columnPx, containerPx = columnPx, capPx, minPx, maxLines, charEm }) {
  const ems = lineEms(text, maxLines, charEm);
  if (!ems) return { sizePx: capPx, columnPx, lines: 0, fits: true };
  const floor = Math.min(capPx, minPx);
  const column = Math.min(Math.max(columnPx, ems * floor), Math.max(columnPx, containerPx));
  const sizePx = Math.min(capPx, Math.max(minPx, column / ems));
  const lines = predictLines(text, { columnPx: column, sizePx, charEm });
  return { sizePx: round(sizePx, 2), columnPx: round(column, 1), lines, fits: lines <= maxLines };
}

// The lines the model says a title takes at sizePx in columnPx (without the margin: the plain average).
export function predictLines(text, { columnPx, sizePx, charEm }) {
  return wrapLines(text, Math.floor(columnPx / (sizePx * charEm))).length;
}

// The custom properties a fitted title's box carries (template.css [data-heading-fit]): the line width in ems at the
// desktop and the phone limit, and the floors. The stylesheet does the division by the box's width.
/** @typedef {{ desktop: { lines: number, minPx: number }, phone: { lines: number, minPx: number } }} FitRule */
/** @param {string} text @param {{ charEm: number, fit?: FitRule }} options */
export function headingFitVars(text, { charEm, fit = HERO_FIT }) {
  if (!words(text).length) return null;
  return {
    '--fit-ems-desktop': String(round(lineEms(text, fit.desktop.lines, charEm))),
    '--fit-ems-phone': String(round(lineEms(text, fit.phone.lines, charEm))),
    '--fit-min-desktop': `${fit.desktop.minPx}px`,
    '--fit-min-phone': `${fit.phone.minPx}px`,
  };
}
/** @param {string} text @param {{ charEm: number, fit?: FitRule }} options @returns {string | undefined} */
export const headingFitStyle = (text, options) => {
  const vars = headingFitVars(text, options);
  return vars ? Object.entries(vars).map(([name, value]) => `${name}: ${value}`).join('; ') : undefined;
};

// The audit's line limits (scripts/audit-authoring-layout.mjs): a page's h1 over two lines on a desktop or four on a
// phone fails (h1_lines); a section heading over three lines is a warning (section_heading_lines). Tablet widths are
// between the two and not held to either. result: { viewport, headingLines: { h1: [lines], sections: [{ text, lines }] } }.
// An article's title runs longer than a page's (a question, a comparison): one more line on each width.
export const ARTICLE_EXTRA_LINES = 1;
export function headingLineIssues(result, { article = false } = {}) {
  const failures = [];
  const warnings = [];
  const at = { route: result.route, viewport: result.viewport };
  const base = { desktop: HERO_FIT.desktop.lines, mobile: HERO_FIT.phone.lines }[result.viewport];
  if (!base || !result.headingLines) return { failures, warnings };
  const limit = base + (article ? ARTICLE_EXTRA_LINES : 0);
  for (const heading of result.headingLines.h1 ?? []) if (heading.lines > limit) failures.push({ ...at, issue: 'h1_lines', value: heading.text, lines: heading.lines, maximum: limit });
  // The page title is the largest heading on the page: one smaller than a section heading reads upside down
  // (heading_scale_inverted; the hero floor in template.css keeps it a step above). Desktop and phone, as the lines.
  const title = (result.headingLines.h1 ?? [])[0];
  const largest = (result.headingLines.sections ?? []).reduce((top, heading) => (heading.fontPx > (top?.fontPx ?? 0) ? heading : top), null);
  if (title?.fontPx && largest?.fontPx && title.fontPx + 0.5 < largest.fontPx) failures.push({ ...at, issue: 'heading_scale_inverted', value: title.text, fontPx: title.fontPx, sectionFontPx: largest.fontPx, section: largest.text });
  for (const heading of result.headingLines.sections ?? []) if (heading.lines > SECTION_HEADING_MAX_LINES) warnings.push({ ...at, issue: 'section_heading_lines', value: heading.text, lines: heading.lines, maximum: SECTION_HEADING_MAX_LINES });
  return { failures, warnings };
}

// In the browser (page.evaluate, self-contained): the lines the page's h1 and its section headings (main h2) take,
// counted as the line boxes of their text (one per distinct top of the text's client rects). Hidden headings and
// those in a closed <details> are left out.
export function measureHeadingLines() {
  const lines = (element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const tops = [];
    for (const rect of range.getClientRects()) {
      if (rect.width < 1 || rect.height < 1) continue;
      if (!tops.some((top) => Math.abs(top - rect.top) < rect.height / 2)) tops.push(rect.top);
    }
    return tops.length;
  };
  const shown = (element) => {
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' && !(element.parentElement?.closest('details:not([open])') && !element.closest('summary'));
  };
  const read = (selector) => [...document.querySelectorAll(selector)].filter((element) => element.textContent.trim() && shown(element)).map((element) => ({ text: element.textContent.trim().replace(/\s+/g, ' ').slice(0, 80), lines: lines(element), fontPx: Number.parseFloat(getComputedStyle(element).fontSize) || 0 }));
  return { h1: read('main h1'), sections: read('main h2') };
}
