import { PLAN_ASSERTIONS } from './plan-assertions.mjs';

// The template's own layout decisions a site's stylesheet may not undo (owner 2026-11-12: "不应该照搬固定宽度和顶端对齐 应该
// 适配我们自己的设计"). The hotel site's style-board repair wrote a rule stronger than the template's to set its split
// photos back to the competitor's fixed shape and top alignment, and another pinned the closing band's button to the
// band's foot; both read right beside the competitor's module and wrong with our copy. A rule of
// src/styles/reference.css that sets one of these properties on these parts fails the layout audit
// (template_rule_overridden) and goes to the site-CSS repair, which takes it out.

// A selector whose rule styles a plain section itself (its rightmost part is the section, .block--<type>, of a type the
// template alternates white and tinted: not a photo, band, closing call, form or split row, which carry their own
// surface; the testimonials alternate since 2026-11-15). The hotel site's repairs tinted sections by their neighbours
// (".block--gallery + .block--icon-list"), and two grey sections met where the template's alternation had one.
const OWN_SURFACE = /^(cta|gallery|split|band|figure|form|charts|page-lead)$/;
const topLevel = (text, separator) => {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const char of text) {
    if (char === '(' || char === '[') depth += 1;
    if (char === ')' || char === ']') depth -= 1;
    if (depth === 0 && separator.test(char)) { parts.push(current); current = ''; } else current += char;
  }
  return [...parts, current].map((part) => part.trim()).filter(Boolean);
};
// Only a page's own sections: not a block inside another block or inside an article's body (posts are not alternated).
export const stylesPlainSection = (selector) => topLevel(selector, /,/).some((item) => {
  // The compounds with the combinator after each (" ", ">", "+", "~"; the last has none).
  const steps = [];
  let depth = 0;
  let current = '';
  for (const char of item.trim()) {
    if (char === '(' || char === '[') depth += 1;
    if (char === ')' || char === ']') depth -= 1;
    if (depth === 0 && /[\s>+~]/.test(char)) {
      if (current) { steps.push({ compound: current, after: ' ' }); current = ''; }
      if (char !== ' ' && steps.length) steps.at(-1).after = char;
    } else current += char;
  }
  const last = current;
  if (last.includes('::') || /\.post-(article|body)\b/.test(item)) return false;
  // A block inside another: a block compound followed by a descendant or child combinator (+ and ~ name a neighbour).
  if (steps.some((step) => /^[\s>]$/.test(step.after) && /\.block(--[\w-]+)?\b/.test(step.compound))) return false;
  const types = [...last.matchAll(/\.block--([\w-]+)/g)].map((match) => match[1]);
  return types.some((type) => !OWN_SURFACE.test(type));
});

export const PROTECTED_RULES = Object.freeze([
  { part: { test: stylesPlainSection }, properties: ['background', 'background-color'], rule: 'neighbouring plain sections alternate white and tinted backgrounds, set by the template (the treatment colours the tint through --section-tint, never one section)' },
  // The trust bar is the first section of the alternation (hotel-rm 2026-11-15: a repair set it to the page's surface
  // on four page types, and the overview under it ran on as one surface).
  { part: /\.trust-bar(?![\w-])\s*(,|$)/, properties: ['background', 'background-color'], rule: 'the trust bar is the first section of the white and tinted alternation, its surface set by the template (the treatment colours the tint through --section-tint)' },
  { part: /\.split__media-set|\.split__media\b|\.split__copy/, properties: ['align-self', 'height', 'max-height', 'aspect-ratio'], rule: 'a split row\'s photo runs its copy\'s height up to a 4:5 portrait, then stays in view beside the longer copy as it scrolls (sticky), and shorter copy sits level with the photo\'s middle (template.css)' },
  { part: /\.split\b(?![\w-])/, properties: ['align-items'], rule: 'a split row\'s photo and copy share their edges (template.css)' },
  { part: /\.button\b/, properties: ['position'], values: /absolute|fixed|sticky/, rule: 'a button stays in its copy\'s flow, under the text it ends (template.css)' },
  // The hotel site's design repair of 2026-11-14 set --heading-fit: 4rem on its service heroes and fixed a post title's
  // size: fifteen titles ran to three lines on desktops, and the run stopped on them.
  // Every input of that fit too: the next design repair set --fit-above: 2.8125rem on the post titles, and three ran to
  // four and five lines.
  { part: /[\s\S]/, properties: ['--heading-fit', '--fit-above', '--fit-above-step', '--fit-min', '--fit-ems', '--fit-min-desktop', '--fit-min-phone', '--fit-ems-desktop', '--fit-ems-phone', '--title-min-phone', '--title-ems-phone', '--section-cap'], rule: 'a title is sized to its own words so it keeps to its lines (template.css [data-heading-fit])' },
  { part: /\.page-hero\b[^,]*\bh1\b|\.page-hero__title|\.post-header__title|\.blog-hub-hero\b[^,]*\bh1\b/, properties: ['font-size'], rule: 'a title is sized to its own words so it keeps to its lines (template.css [data-heading-fit])' },
]);

// The rules of a stylesheet as { selector, properties: [name], values: { name: value } }, innermost blocks only (media
// queries are looked into).
export function cssRules(css) {
  const text = String(css).replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [];
  for (const match of text.matchAll(/([^{}@;]+)\{([^{}]*)\}/g)) {
    const selector = match[1].trim();
    const declarations = [...match[2].matchAll(/(?:^|;)\s*([a-z-]+)\s*:\s*([^;]*)/g)].map((item) => [item[1], item[2].trim()]);
    if (selector && declarations.length) rules.push({ selector, properties: declarations.map(([name]) => name), values: Object.fromEntries(declarations) });
  }
  return rules;
}

// The site's rules that undo a template decision: [{ selector, property, rule }].
export function protectedOverrides(css) {
  const found = [];
  for (const { selector, properties, values } of cssRules(css)) {
    for (const guard of PROTECTED_RULES) {
      if (!guard.part.test(selector)) continue;
      for (const property of properties.filter((name) => guard.properties.includes(name) && (!guard.values || guard.values.test(values[name])))) found.push({ selector: selector.replace(/\s+/g, ' ').slice(0, 160), property, rule: guard.rule });
    }
  }
  return found;
}

// The stylesheet with the declarations that undo a template decision taken out (a rule left empty goes): an agent's
// repair that set one is mended by code at once, before the rebuild, instead of failing the audit and spending a repair
// round on taking it back out (Fable's 08-onward review: four style-board repairs of one day wrote such rules).
// { css, removed: [{ selector, property, rule }] }.
export function stripProtected(css) {
  const removed = [];
  const out = String(css).replace(/([^{}@;]+)\{([^{}]*)\}/g, (all, head, body) => {
    const selector = head.replace(/\/\*[\s\S]*?\*\//g, '').trim();
    const guards = selector ? PROTECTED_RULES.filter((guard) => guard.part.test(selector)) : [];
    if (!guards.length) return all;
    const declarations = body.split(';');
    const kept = declarations.filter((declaration) => {
      const match = /^\s*([a-z-]+)\s*:\s*([\s\S]*?)\s*$/.exec(declaration);
      const guard = match && guards.find((item) => item.properties.includes(match[1]) && (!item.values || item.values.test(match[2])));
      if (guard) removed.push({ selector: selector.replace(/\s+/g, ' ').slice(0, 160), property: match[1], rule: guard.rule });
      return !guard;
    });
    if (kept.length === declarations.length) return all;
    return kept.join(';').trim() ? `${head}{${kept.join(';')}}` : head.match(/^\s*/)[0];
  });
  return { css: out, removed };
}

// The site's own layout rules (owner 2026-11-14: "从源头解决"): what the template decided for our copy where it departs
// from the competitor's module, given to the design review and to every repair (config/agent-steps {{siteRules}}) so a
// review does not ask to copy the competitor's fixed values and a repair does not write them. The protected ones are
// also taken out by code if a repair writes them anyway (stripProtected).
// The sentences are the plan gate's assertion table (lib/plan-assertions.mjs): each is checked by code before the photos
// (an assertion with a check) or judged by the review alone (gate "review"), so what the review is told and what the
// gate checks cannot drift apart (hotel-rm 2026-11-14: the review was told a rule the template did not keep).
export const SITE_DECISIONS = Object.freeze(PLAN_ASSERTIONS.filter((assertion) => assertion.rule).map((assertion) => assertion.rule));
export function siteRules(components = {}) {
  const rules = [...new Set(PROTECTED_RULES.map((guard) => guard.rule.replace(/ \(template\.css[^)]*\)$/, '')))];
  if (components.headingAlign === 'start') rules.unshift('every section heading starts on the content\'s left edge; none is centred, even where the competitor\'s module centres it');
  return [...rules, ...SITE_DECISIONS].map((rule) => `- ${rule}`).join('\n');
}
// The same, in one line (kept for callers that put it beside a route).
export const siteLayoutNote = (components = {}) => `the site's own layout rules, not to be copied from the competitor: ${siteRules(components).replace(/^- /gm, '').split('\n').join('; ')}`;
