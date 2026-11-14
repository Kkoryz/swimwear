// Whether the browser draws the site's text in the fonts it ships (the layout audit, scripts/audit-authoring-layout.mjs):
// font_not_loaded, a text's computed first family has no loaded font file (the browser shows a fallback: Georgia for
// Source Serif 4); font_synthesized, the weight or style a text asks for has no file and the browser fakes it (bold
// drawn from a regular face).

const GENERIC = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded', 'emoji', 'math', 'fangsong', '-apple-system', 'blinkmacsystemfont']);
const clean = (family) => String(family || '').trim().replace(/^['"]|['"]$/g, '').toLowerCase();

// In the page (page.evaluate, no imports): every visible text's first computed family, weight and style, once each,
// and the font faces the document has with their load status. Runs after the page was scrolled through (lazy text and
// images shown), once the fonts in use are loaded.
export async function measureFonts() {
  await document.fonts.ready;
  const used = new Map();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent.trim();
    const element = node.parentElement;
    if (!text || !element || element.closest('script, style, noscript, template')) continue;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    if (rect.width === 0 || rect.height === 0 || style.visibility === 'hidden' || style.display === 'none') continue;
    const family = style.fontFamily.split(',')[0].trim().replace(/^['"]|['"]$/g, '');
    const weight = Number.parseFloat(style.fontWeight) || 400;
    const fontStyle = /^(italic|oblique)/.test(style.fontStyle) ? 'italic' : 'normal';
    const id = `${family}|${weight}|${fontStyle}`;
    if (!used.has(id)) used.set(id, { family, weight, style: fontStyle, sample: text.slice(0, 40), where: `${element.tagName.toLowerCase()}${element.classList[0] ? `.${element.classList[0]}` : ''}` });
  }
  const faces = [...document.fonts].map((face) => ({ family: face.family.replace(/^['"]|['"]$/g, ''), weight: face.weight, style: face.style, status: face.status }));
  return { used: [...used.values()], faces };
}

// A face's weight descriptor as a range ("400", "100 900", "bold").
export function weightRange(value) {
  const parts = String(value ?? '400').trim().split(/\s+/).map((part) => (part === 'normal' ? 400 : part === 'bold' ? 700 : Number.parseFloat(part)));
  const [low, high = low] = parts.filter(Number.isFinite);
  return Number.isFinite(low) ? [Math.min(low, high), Math.max(low, high)] : [400, 400];
}

// The weight the browser picks among the faces' ranges for a wanted weight (CSS Fonts 4, font-weight matching).
export function matchedWeight(wanted, ranges) {
  if (ranges.some(([low, high]) => low <= wanted && wanted <= high)) return wanted;
  const above = (from, to = Infinity) => { const lows = ranges.map(([low]) => low).filter((low) => low > from && low <= to); return lows.length ? Math.min(...lows) : null; };
  const below = (from) => { const highs = ranges.map(([, high]) => high).filter((high) => high < from); return highs.length ? Math.max(...highs) : null; };
  if (wanted >= 400 && wanted <= 500) return above(wanted, 500) ?? below(wanted) ?? above(500);
  if (wanted < 400) return below(wanted) ?? above(wanted);
  return above(wanted) ?? below(wanted);
}

// The problems of one page at one width: { used, faces } from measureFonts; system, the families the site uses as
// system fonts on purpose (installed-fonts.json roles with source "system"), which have no file. A family is reported
// once (font_not_loaded), a synthesized weight or style once per family, weight and style. Chromium draws a bold when a
// weight of 600 or more is drawn from a face under 600, and an oblique when an italic has no italic face.
export function fontProblems({ used = [], faces = [] } = {}, { system = [] } = {}) {
  const exempt = new Set([...GENERIC, ...system.map(clean)]);
  const loaded = faces.filter((face) => face.status === 'loaded');
  const problems = [];
  const missing = new Map();
  for (const text of used) {
    const family = clean(text.family);
    if (!family || exempt.has(family)) continue;
    const own = loaded.filter((face) => clean(face.family) === family);
    if (!own.length) {
      const entry = missing.get(family) ?? { issue: 'font_not_loaded', family: text.family, weights: [], sample: text.sample, where: text.where };
      if (!entry.weights.includes(text.weight)) entry.weights.push(text.weight);
      missing.set(family, entry);
      continue;
    }
    const styled = own.filter((face) => (/^(italic|oblique)/.test(face.style) ? 'italic' : 'normal') === text.style);
    const synthesized = [];
    if (!styled.length) synthesized.push('style');
    const matched = matchedWeight(text.weight, (styled.length ? styled : own).map((face) => weightRange(face.weight)));
    if (text.weight >= 600 && matched < 600) synthesized.push('weight');
    if (synthesized.length) problems.push({ issue: 'font_synthesized', family: text.family, weight: text.weight, style: text.style, synthesized, drawnFrom: matched, sample: text.sample, where: text.where });
  }
  return [...missing.values(), ...problems];
}
