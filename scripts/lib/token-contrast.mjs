// The design tokens' colour pairs, checked as soon as the design lock is applied (four-site audit 2026-11-17: Staylumen's
// white --text-primary on its light grey --surface-secondary, 1.47:1 on 19 pages, was found only at the audits step,
// after the treatment, the copy, the photos and the build). Each pair is a surface token and the text, border or ring
// token the template's components draw on it (template.css, patterns.css): WCAG 2.2 AA 4.5:1 for text, 3:1 for large
// text and for non-text UI (a form field's border, the focus ring: Modern Web Guidance, color.md). The tokens are read
// as the stylesheets set them (src/styles/global.css with its imports, src/styles/reference.css among them), so what is
// checked is what the page paints, not the design lock alone.
//
// readableTokens picks, for a pair that does not read, the token the reference left undefined (a dark text for a light
// grey surface on a dark site, a muted grey that reads on the page): apply-reference-analysis.mjs writes it into the
// design-lock block with a note. A token the reference did define is kept as it is, apart from the text colours that
// only ever serve as a secondary voice (a link, muted text, a small accent label, the focus ring: made a shade darker
// or lighter in their own hue, as the link colour has been since 2026-10); a main pair that still does not read (the
// page's text on the page, the button's text on the accent) fails the check, named.

import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { contrastRatio } from './contrast.mjs';

const NAMED = { white: [255, 255, 255, 1], black: [0, 0, 0, 1], transparent: [0, 0, 0, 0] };

// A CSS colour as [r, g, b, a]: #rgb, #rgba, #rrggbb, #rrggbbaa, rgb()/rgba() in either syntax, white, black,
// transparent; anything else (a gradient, color-mix(), currentColor) null.
export function parseColour(value) {
  const text = String(value ?? '').trim().toLowerCase();
  if (NAMED[text]) return NAMED[text];
  const hex = /^#([0-9a-f]{3,8})$/.exec(text);
  if (hex) {
    let digits = hex[1];
    if (digits.length === 3 || digits.length === 4) digits = [...digits].map((digit) => digit + digit).join('');
    if (digits.length !== 6 && digits.length !== 8) return null;
    const channels = digits.match(/../g).map((pair) => Number.parseInt(pair, 16));
    return [channels[0], channels[1], channels[2], channels.length === 4 ? channels[3] / 255 : 1];
  }
  const functional = /^rgba?\(([^)]+)\)$/.exec(text);
  if (!functional) return null;
  const parts = functional[1].split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3) return null;
  const number = (part, scale) => (part.endsWith('%') ? (Number.parseFloat(part) / 100) * scale : Number.parseFloat(part));
  const colour = [...parts.slice(0, 3).map((part) => number(part, 255)), parts[3] === undefined ? 1 : number(parts[3], 1)];
  return colour.every(Number.isFinite) ? colour : null;
}

// top drawn over bottom (both [r, g, b, a]; bottom opaque).
const over = (top, bottom) => [...[0, 1, 2].map((k) => top[k] * top[3] + bottom[k] * (1 - top[3])), 1];
const rgbText = (colour) => `rgb(${colour.slice(0, 3).map((channel) => Math.round(channel)).join(', ')})`;
const round = (ratio) => Math.round(ratio * 100) / 100;

// The rules of a stylesheet outside any at-rule (a token set inside @media holds at one width only): [{ selector, body }].
function topLevelRules(css) {
  const text = String(css).replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [];
  let depth = 0;
  let head = '';
  let body = '';
  let atRule = false;
  for (const char of text) {
    if (char === '{') {
      if (depth === 0) { atRule = head.trim().startsWith('@'); body = ''; } else body += char;
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) { if (!atRule) rules.push({ selector: head.trim(), body }); head = ''; } else body += char;
    } else if (depth === 0) {
      head += char;
      // A statement at-rule (@import "...";) ends at its semicolon.
      if (char === ';') head = '';
    } else body += char;
  }
  return rules;
}

// The specificity of a selector that styles the root element alone (:root, :root:root, html, html:root), else null.
function rootSpecificity(selector) {
  const item = selector.replace(/\s+/g, '');
  if (!/^(html)?(:root)*$/.test(item) || !item) return null;
  return [(item.match(/:root/g) ?? []).length, item.startsWith('html') ? 1 : 0];
}

// The custom properties of the root element as the stylesheets set them, in order (sheets: [css or { css, path }], the
// first first): a Map name -> value, the higher specificity winning and then the later rule, as the cascade has it.
export const rootTokens = (sheets) => new Map([...cascade(sheets)].map(([name, entry]) => [name, entry.value]));
// Which stylesheet set each token's winning value: a Map name -> path (sheets given as { css, path }).
export const tokenOrigins = (sheets) => new Map([...cascade(sheets)].map(([name, entry]) => [name, entry.path]));
function cascade(sheets) {
  const won = new Map();
  let order = 0;
  for (const sheet of sheets) {
    const { css, path = null } = typeof sheet === 'string' ? { css: sheet } : sheet;
    for (const { selector, body } of topLevelRules(css)) {
      const specificity = selector.split(',').map(rootSpecificity).filter(Boolean).sort((a, b) => b[0] - a[0] || b[1] - a[1])[0];
      if (!specificity) continue;
      for (const declaration of body.split(';')) {
        const match = /^\s*(--[\w-]+)\s*:\s*([\s\S]*?)\s*$/.exec(declaration);
        if (!match) continue;
        order += 1;
        const before = won.get(match[1]);
        const beats = !before || specificity[0] > before.specificity[0] || (specificity[0] === before.specificity[0] && specificity[1] >= before.specificity[1]);
        if (beats) won.set(match[1], { value: match[2].replace(/\s*!important$/, ''), specificity, order, path });
      }
    }
  }
  return won;
}

// The stylesheets that set the page's tokens, in cascade order: src/styles/global.css with its relative @imports
// inlined where they stand (template.css, patterns.css, reference.css, fonts.css), the rest of global.css after them.
// [{ css, path }], the paths relative to the workspace.
export async function tokenSheets(root) {
  const path = resolve(root, 'src/styles/global.css');
  const css = await readFile(path, 'utf8');
  const sheets = [];
  for (const match of css.matchAll(/^\s*@import\s+["']([^"']+)["']\s*;/gm)) {
    if (!match[1].startsWith('.')) continue;
    sheets.push({ css: await readFile(resolve(dirname(path), match[1]), 'utf8').catch(() => ''), path: `src/styles/${match[1].replace(/^\.\//, '')}` });
  }
  return [...sheets, { css, path: 'src/styles/global.css' }];
}

// value with every var(--name[, fallback]) replaced by what the tokens give it; null where it resolves to nothing (an
// undefined token without a fallback, or a loop).
export function resolveValue(value, tokens, seen = new Set()) {
  let text = String(value);
  for (let at = text.indexOf('var('); at !== -1; at = text.indexOf('var(')) {
    let depth = 0;
    let end = -1;
    let comma = -1;
    for (let index = at + 3; index < text.length; index += 1) {
      if (text[index] === '(') depth += 1;
      if (text[index] === ')') { depth -= 1; if (depth === 0) { end = index; break; } }
      if (text[index] === ',' && depth === 1 && comma === -1) comma = index;
    }
    if (end === -1) return null;
    const name = text.slice(at + 4, comma === -1 ? end : comma).trim();
    const fallback = comma === -1 ? null : text.slice(comma + 1, end).trim();
    let replacement = null;
    if (tokens.has(name) && !seen.has(name)) replacement = resolveValue(tokens.get(name), tokens, new Set([...seen, name]));
    if (replacement === null && fallback !== null) replacement = resolveValue(fallback, tokens, seen);
    if (replacement === null) return null;
    text = text.slice(0, at) + replacement + text.slice(end + 1);
  }
  return text.trim();
}

// The pairs the template draws (text: the token chain a component reads; inked: what a part painted with the secondary
// surface reads instead where the site's text needs its own colour there, template.css body[data-secondary-ink]).
const LINK = 'var(--link, var(--accent-text, var(--text-primary)))';
const HEADING = 'var(--heading-color, var(--text-primary))';
export const TOKEN_PAIRS = Object.freeze([
  { id: 'text', text: 'var(--text-primary)', surface: '--surface-primary', minimum: 4.5, kind: 'text', uses: 'running text on the page' },
  { id: 'text-on-secondary', text: 'var(--text-primary)', inked: 'var(--text-on-secondary)', surface: '--surface-secondary', minimum: 4.5, kind: 'text', uses: 'running text in tinted sections and on tinted cards' },
  { id: 'heading', text: HEADING, surface: '--surface-primary', minimum: 3, kind: 'large text', uses: 'section headings on the page' },
  { id: 'heading-on-secondary', text: HEADING, inked: 'var(--text-on-secondary)', surface: '--surface-secondary', minimum: 3, kind: 'large text', uses: 'headings in tinted sections and on tinted cards' },
  { id: 'muted', text: 'var(--text-muted)', surface: '--surface-primary', minimum: 4.5, kind: 'text', uses: 'captions, dates and notes on the page' },
  { id: 'muted-on-secondary', text: 'var(--text-muted)', inked: 'var(--muted-on-secondary)', surface: '--surface-secondary', minimum: 4.5, kind: 'text', uses: 'captions, dates and notes on tinted surfaces' },
  { id: 'inverse', text: 'var(--text-inverse)', surface: '--surface-dark', minimum: 4.5, kind: 'text', uses: 'text on dark bands, photo heroes and the footer' },
  { id: 'inverse-muted', text: 'var(--text-inverse-muted, rgb(255 255 255 / 0.78))', surface: '--surface-dark', minimum: 4.5, kind: 'text', uses: 'notes on dark bands and in the footer' },
  { id: 'button', text: 'var(--accent-contrast)', surface: '--accent', minimum: 4.5, kind: 'text', uses: 'the label of the primary button, the header button and the enquiry bar' },
  { id: 'link', text: LINK, surface: '--surface-primary', minimum: 4.5, kind: 'text', uses: 'links in running text on the page' },
  { id: 'link-on-secondary', text: LINK, inked: 'var(--text-on-secondary)', surface: '--surface-secondary', minimum: 4.5, kind: 'text', uses: 'links on tinted surfaces' },
  { id: 'accent-text', text: 'var(--accent-text, var(--accent))', surface: '--surface-primary', minimum: 4.5, kind: 'text', uses: 'small labels in the accent (client names, card numbers)' },
  { id: 'accent-text-on-secondary', text: 'var(--accent-text, var(--accent))', inked: 'var(--text-on-secondary)', surface: '--surface-secondary', minimum: 4.5, kind: 'text', uses: 'small accent labels on tinted cards' },
  { id: 'focus', text: 'var(--focus-ring, var(--accent))', surface: '--surface-primary', minimum: 3, kind: 'non-text', uses: 'the keyboard focus ring on the page' },
  { id: 'focus-on-secondary', text: 'var(--focus-ring, var(--accent))', inked: 'var(--text-on-secondary)', surface: '--surface-secondary', minimum: 3, kind: 'non-text', uses: 'the keyboard focus ring on tinted surfaces' },
  { id: 'control-border', text: 'var(--input-border, var(--border-color))', surface: '--surface-primary', minimum: 3, kind: 'non-text', uses: 'the border of a form field' },
]);

// The colours of one pair: { text, surface, textValue, surfaceValue } ([r, g, b, a] or null each).
function pairColours(pair, tokens, secondaryInk) {
  const textValue = resolveValue(secondaryInk && pair.inked ? pair.inked : pair.text, tokens);
  const surfaceValue = resolveValue(`var(${pair.surface})`, tokens);
  const page = parseColour(resolveValue('var(--surface-primary)', tokens));
  const pageGround = page ? (page[3] < 1 ? over(page, [255, 255, 255, 1]) : page) : [255, 255, 255, 1];
  const surface = parseColour(surfaceValue);
  const ground = surface && (surface[3] < 1 ? over(surface, pageGround) : surface);
  const text = parseColour(textValue);
  return { textValue, surfaceValue, ground, ink: text && ground ? (text[3] < 1 ? over(text, ground) : text) : null };
}

// Every pair with its ratio: [{ id, text, surface, textValue, surfaceValue, ratio, minimum, kind, uses, ok }], or
// unchecked (with why) where a value is no plain colour (a gradient, currentColor): reported, never guessed.
export function tokenContrast(tokens, { secondaryInk = false } = {}) {
  return TOKEN_PAIRS.map((pair) => {
    const { textValue, surfaceValue, ground, ink } = pairColours(pair, tokens, secondaryInk);
    const textToken = (secondaryInk && pair.inked ? pair.inked : pair.text).match(/var\((--[\w-]+)/)[1];
    const base = { id: pair.id, text: textToken, surface: pair.surface, textValue, surfaceValue, minimum: pair.minimum, kind: pair.kind, uses: pair.uses };
    if (!ink || !ground) return { ...base, unchecked: textValue === null || surfaceValue === null ? 'a token in the chain is not set' : /currentcolor/i.test(textValue) ? 'currentColor: it takes the colour of the text it rings' : 'not a plain colour' };
    const ratio = round(contrastRatio(ink, ground));
    return { ...base, ratio, ok: ratio >= pair.minimum };
  });
}

// A pair that fails, as one line: "--text-primary rgb(255, 255, 255) on --surface-secondary rgb(213, 213, 213): 1.47:1,
// needs 4.5:1 (text: running text in tinted sections and on tinted cards)".
// origins (tokenOrigins): where each value was set, said for the two tokens.
export function describePair(pair, origins = null) {
  const where = (token) => (origins?.get(token) ? ` (set in ${origins.get(token)})` : '');
  return `${pair.text} ${pair.textValue}${where(pair.text)} on ${pair.surface} ${pair.surfaceValue}${where(pair.surface)}: ${pair.ratio}:1, needs ${pair.minimum}:1 (${pair.kind}: ${pair.uses})`;
}

// The colour moved toward black or white in steps until it reads on every ground ([r, g, b] each) at minimum: the
// nearest such shade (its own hue), or null.
function shade(colour, grounds, minimum) {
  const worst = (candidate) => Math.min(...grounds.map((ground) => contrastRatio(candidate, ground)));
  if (worst(colour) >= minimum) return null;
  let best = null;
  for (const target of [[0, 0, 0], [255, 255, 255]]) {
    for (let step = 0.02; step <= 1.0001; step += 0.02) {
      const candidate = colour.slice(0, 3).map((channel, k) => channel + (target[k] - channel) * step);
      if (worst(candidate) >= minimum) { if (!best || step < best.step) best = { step, colour: candidate }; break; }
    }
  }
  return best?.colour ?? null;
}

// ink softened toward ground as far as it still reads at minimum (a muted voice of the ink): [r, g, b].
function soften(ink, grounds, minimum, most = 0.45) {
  let kept = ink.slice(0, 3);
  for (let step = 0.05; step <= most + 1e-9; step += 0.05) {
    const candidate = ink.slice(0, 3).map((channel, k) => channel + (grounds[0][k] - channel) * step);
    if (Math.min(...grounds.map((ground) => contrastRatio(candidate, ground))) < minimum) break;
    kept = candidate;
  }
  return kept;
}

// A treatment rule that paints the secondary surface another colour in its part of the page (Staylumen's
// `.block--cta { --surface-secondary: rgb(0 0 0) }`, written when the grey's white text did not read) and names no ink
// for it: where the site's secondary parts take their own ink (components.secondaryInk), the rule gains the ink that
// reads on its colour (template.css --secondary-ink and the rest), or those parts would print the grey's dark ink on
// black. tokens: the root tokens (rootTokens). { css, added: [{ selector, surface, ink }] }; a rule already naming
// --secondary-ink is left as it is.
export function inkLocalSurfaces(css, tokens) {
  const added = [];
  const out = String(css).replace(/([^{}@;]+)\{([^{}]*)\}/g, (all, head, body) => {
    const value = /(?:^|;)\s*--surface-secondary\s*:\s*([^;]+)/.exec(body)?.[1]?.trim();
    // The page's own secondary surface (a root rule) is the template's to ink (--text-on-secondary).
    const selector = head.replace(/\/\*[\s\S]*?\*\//g, '').trim();
    if (!value || /--secondary-ink\s*:/.test(body) || selector.split(',').every((item) => rootSpecificity(item))) return all;
    const surface = parseColour(resolveValue(value, tokens));
    if (!surface || surface[3] < 1) return all;
    const palette = ['var(--text-on-secondary)', 'var(--text-primary)', 'var(--text-inverse)'].map((expression) => parseColour(resolveValue(expression, tokens))).filter((colour) => colour && colour[3] === 1);
    const best = [...palette, [0, 0, 0, 1], [255, 255, 255, 1]].map((colour) => ({ colour, ratio: contrastRatio(colour, surface) })).find((item) => item.ratio >= 7) ?? [...palette, [0, 0, 0, 1], [255, 255, 255, 1]].map((colour) => ({ colour, ratio: contrastRatio(colour, surface) })).sort((a, b) => b.ratio - a.ratio)[0];
    const ink = rgbText(best.colour);
    const muted = rgbText(soften(best.colour, [surface], 4.6));
    added.push({ selector: selector.replace(/\s+/g, ' ').slice(0, 160), surface: value, ink });
    const trimmed = body.replace(/\s*$/, '');
    const separator = trimmed.endsWith(';') || !trimmed.trim() ? '' : ';';
    return `${head}{${trimmed}${separator} --secondary-ink: ${ink}; --secondary-muted: ${muted}; --secondary-link: ${ink}; --secondary-accent: ${ink};${body.match(/\s*$/)[0] || ' '}}`;
  });
  return { css: out, added };
}

// The tokens to write for the pairs that do not read: { tokens: { name: { value, note } }, secondaryInk }.
// tokens: the root tokens as the stylesheets set them (rootTokens); defined: the names the reference set (the design
// lock and the treatment's root tokens), which are not replaced, except the secondary voices (shaded in their hue).
// treatment: the tokens the treatment's reference.css sets at its own :root:root (owner 2026-11-17, claude-seo over the
// reference: RateHarbor's treatment border was 2.26:1); one mended is marked override, for apply-reference-analysis to
// write where it wins over the treatment.
export function readableTokens(tokens, defined = new Set(), treatment = new Set()) {
  const working = new Map(tokens);
  const out = {};
  const colourOf = (expression) => parseColour(resolveValue(expression, working));
  const ground = (token) => pairColours({ text: 'var(--surface-primary)', surface: token }, working, false).ground;
  const ratioOf = (id, secondaryInk) => tokenContrast(working, { secondaryInk }).find((pair) => pair.id === id);
  const set = (name, colour, why) => {
    const value = rgbText(colour);
    working.set(name, value);
    out[name] = { value, note: `/* Derived (apply-reference-analysis.mjs, four-site audit 2026-11-17): ${why}. */`, ...(treatment.has(name) ? { override: true } : {}) };
  };
  // The palette's colour that reads best on a ground, black and white included.
  const bestOn = (ground, tokens) => [...tokens.map((token) => colourOf(`var(${token})`)).filter((colour) => colour && colour[3] === 1), [255, 255, 255, 1], [0, 0, 0, 1]].map((colour) => ({ colour, ratio: contrastRatio(colour, ground) })).sort((a, b) => b.ratio - a.ratio)[0];
  const failing = (id, secondaryInk) => { const pair = ratioOf(id, secondaryInk); return pair && pair.ok === false ? pair : null; };
  const primary = ground('--surface-primary');
  const secondary = ground('--surface-secondary');

  // Text on the secondary surface: its own colour where the page's text does not read there.
  let secondaryInk = false;
  const onSecondary = failing('text-on-secondary', false);
  if (onSecondary && secondary && !defined.has('--text-on-secondary')) {
    const palette = ['--text-inverse', '--surface-dark', '--surface-primary', '--text-primary'].map((token) => colourOf(`var(${token})`)).filter((colour) => colour && colour[3] === 1);
    const best = [...palette, [0, 0, 0, 1], [255, 255, 255, 1]].map((colour) => ({ colour, ratio: contrastRatio(colour, secondary) })).filter((item) => item.ratio >= 4.5).sort((a, b) => b.ratio - a.ratio)[0];
    if (best) {
      set('--text-on-secondary', best.colour, `the page's ${onSecondary.textValue} text is ${onSecondary.ratio}:1 on the ${onSecondary.surfaceValue} secondary surface; text on that surface takes this colour of the palette, ${round(best.ratio)}:1`);
      set('--muted-on-secondary', soften(best.colour, [secondary], 4.6), 'the muted voice of --text-on-secondary on the secondary surface, 4.5:1 or more');
      secondaryInk = true;
    }
  }
  const grounds = (onBoth) => [primary, ...(onBoth && !secondaryInk ? [secondary] : [])].filter(Boolean);
  const mend = (id, token, from, minimum, { derive, onBoth = true }) => {
    const pair = failing(id, secondaryInk) ?? (onBoth && !secondaryInk ? failing(`${id}-on-secondary`, false) : null);
    if (!pair) return;
    const isDefined = defined.has(token);
    if (isDefined && !derive.shadeDefined) return;
    const colour = colourOf(from);
    if (!colour) return;
    const ink = derive(colour, isDefined);
    if (ink) set(token, ink, `${isDefined ? `the reference's ${resolveValue(from, working)}` : `the template's ${resolveValue(from, working)}`} is ${pair.ratio}:1 on ${pair.surfaceValue} (${pair.uses}); ${isDefined ? 'a shade of it in its own hue' : 'a colour'} that reads at ${minimum}:1 or more`);
  };
  const shadeOf = (minimum, onBoth = true) => Object.assign((colour) => shade(colour, grounds(onBoth), minimum), { shadeDefined: true });
  // Muted text: the page's text softened toward the page (undefined), or the reference's muted made darker or lighter.
  const mutedDerive = Object.assign((colour, isDefined) => (isDefined ? shade(colour, grounds(true), 4.5) : (colourOf('var(--text-primary)') && soften(colourOf('var(--text-primary)'), grounds(true), 4.6))), { shadeDefined: true });
  mend('muted', '--text-muted', 'var(--text-muted)', 4.5, { derive: mutedDerive });
  // Notes on dark surfaces.
  const dark = ground('--surface-dark');
  // Text on dark surfaces, the reference's own included (Staylumen's lock named its dark text --text-inverse: black on
  // its black dark surface, 1:1): the palette's colour that reads best on the dark surface.
  const inverse = failing('inverse', secondaryInk);
  if (inverse && dark) {
    const best = bestOn(dark, ['--surface-primary', '--text-primary']);
    if (best.ratio >= 4.5) set('--text-inverse', best.colour, `${defined.has('--text-inverse') ? "the reference's" : "the template's"} ${inverse.textValue} text is ${inverse.ratio}:1 on the ${inverse.surfaceValue} dark surface; the palette's colour that reads best on it, ${round(best.ratio)}:1`);
  }
  const inverseMuted = failing('inverse-muted', secondaryInk);
  if (inverseMuted && dark && colourOf('var(--text-inverse)') && contrastRatio(colourOf('var(--text-inverse)'), dark) >= 4.5) {
    const isDefined = defined.has('--text-inverse-muted');
    const ink = isDefined ? shade(colourOf('var(--text-inverse-muted)'), [dark], 4.5) : soften(colourOf('var(--text-inverse)'), [dark], 4.6);
    if (ink) set('--text-inverse-muted', ink, `${inverseMuted.text} ${inverseMuted.textValue} is ${inverseMuted.ratio}:1 on the ${inverseMuted.surfaceValue} dark surface; ${isDefined ? 'a shade of it' : 'the inverse text softened'} that reads at 4.5:1`);
  }
  // The button's label, the reference's own included (owner 2026-11-17: where copying the reference and claude-seo
  // disagree, claude-seo wins; RateHarbor's lock set a 2.55:1 label): the palette's colour that reads best on the accent.
  const button = failing('button', secondaryInk);
  const accent = ground('--accent');
  if (button && accent) {
    const best = bestOn(accent, ['--text-inverse', '--text-primary', '--surface-primary', '--surface-dark']);
    if (best.ratio >= 4.5) set('--accent-contrast', best.colour, `${defined.has('--accent-contrast') ? "the reference's" : "the template's"} ${button.textValue} label is ${button.ratio}:1 on the ${button.surfaceValue} accent; the palette's colour that reads best on it, ${round(best.ratio)}:1`);
  }
  // The accent as small text, then the links (which fall back to it), then the focus ring (3:1).
  mend('accent-text', '--accent-text', 'var(--accent-text, var(--accent))', 4.5, { derive: shadeOf(4.5) });
  mend('link', '--link', LINK, 4.5, { derive: shadeOf(4.5) });
  const focusDerive = Object.assign((colour, isDefined) => {
    if (isDefined) return shade(colour, grounds(true), 3);
    const candidates = ['var(--accent-text, var(--accent))', 'var(--text-primary)'].map(colourOf).filter(Boolean);
    return candidates.find((candidate) => grounds(true).every((item) => contrastRatio(candidate, item) >= 3)) ?? shade(colour, grounds(true), 3);
  }, { shadeDefined: true });
  mend('focus', '--focus-ring', 'var(--focus-ring, var(--accent))', 3, { derive: focusDerive });
  // A form field's border (3:1 on the field's own surface): the page's text softened toward the field.
  const border = failing('control-border', secondaryInk);
  if (border && primary && (!defined.has('--input-border') || treatment.has('--input-border')) && colourOf('var(--text-primary)')) {
    set('--input-border', soften(colourOf('var(--text-primary)'), [primary], 3.1, 0.7), `the ${border.textValue} border is ${border.ratio}:1 on the ${border.surfaceValue} field; a form field's border reads at 3:1 (Modern Web Guidance, color.md)`);
  }
  // Headings defined in a colour of their own below 3:1: a shade of it.
  mend('heading', '--heading-color', HEADING, 3, { derive: Object.assign((colour, isDefined) => (isDefined ? shade(colour, grounds(true), 3) : null), { shadeDefined: true }) });
  return { tokens: out, secondaryInk };
}
