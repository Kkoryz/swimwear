// The part of a stylesheet one page can use (V-1 of Fable's 11-17 plan; owner 2026-11-17, site13's 40-minute run): a
// change to one module's rule re-audits and re-shoots only the pages that show the module. A rule is the page's when
// one of its selectors can match there: every class, id and attribute value that selector requires outside a
// functional pseudo-class (:not(), :is(), :where(), :has(), ...) appears in the page's HTML or in the scripts it loads
// (a class a script builds from a literal prefix or suffix counts as present). A rule no selector of which requires
// anything (:root and its tokens, tag selectors, *, @font-face, @keyframes, @property) is shared by every page: a
// token or a global rule that changes measures every page again, as before.
// Reading a selector conservatively (anything inside parentheses or brackets it does not understand requires
// nothing) only ever puts more rules in a page's part, never fewer.

const BLOCK_AT_RULES = new Set(['media', 'supports', 'container', 'layer', 'document', 'starting-style']);

// Top-level items of a stylesheet: { prelude, body } (body null for a statement such as @import or @layer a, b;),
// strings and comments respected.
export function cssItems(css) {
  const items = [];
  let at = 0;
  let start = 0;
  const skipString = (index) => {
    const quote = css[index];
    let end = index + 1;
    while (end < css.length && css[end] !== quote) end += css[end] === '\\' ? 2 : 1;
    return end + 1;
  };
  while (at < css.length) {
    const char = css[at];
    if (char === '/' && css[at + 1] === '*') { const end = css.indexOf('*/', at + 2); at = end < 0 ? css.length : end + 2; continue; }
    if (char === '"' || char === "'") { at = skipString(at); continue; }
    if (char === ';') { const prelude = css.slice(start, at).trim(); if (prelude) items.push({ prelude, body: null }); at += 1; start = at; continue; }
    if (char === '}') { at += 1; start = at; continue; }
    if (char === '{') {
      let depth = 1;
      let end = at + 1;
      while (end < css.length && depth > 0) {
        const inner = css[end];
        if (inner === '/' && css[end + 1] === '*') { const close = css.indexOf('*/', end + 2); end = close < 0 ? css.length : close + 2; continue; }
        if (inner === '"' || inner === "'") { end = skipString(end); continue; }
        if (inner === '{') depth += 1;
        else if (inner === '}') depth -= 1;
        end += 1;
      }
      items.push({ prelude: css.slice(start, at).trim().replace(/^\/\*[\s\S]*?\*\/\s*/g, ''), body: css.slice(at + 1, end - 1) });
      at = end;
      start = at;
      continue;
    }
    at += 1;
  }
  return items;
}

// An identifier with its CSS escapes read (`md\:grid` is the class md:grid).
const unescape = (text) => text.replace(/\\([0-9a-fA-F]{1,6})\s?/g, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16))).replace(/\\(.)/g, '$1');
const IDENT = /^-?(?:[_a-zA-Z -￿-]|\\.)(?:[\w -￿-]|\\.)*/;

// The selectors of a list, split at the commas outside parentheses and brackets.
export function splitSelectors(list) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < list.length; index += 1) {
    const char = list[index];
    if (char === '\\') { index += 1; continue; }
    if (char === '(' || char === '[') depth += 1;
    else if (char === ')' || char === ']') depth -= 1;
    else if (char === ',' && depth === 0) { parts.push(list.slice(start, index).trim()); start = index + 1; }
  }
  parts.push(list.slice(start).trim());
  return parts.filter(Boolean);
}

// What one selector requires of a page: the classes and ids ("w:<name>", a word of the page) and the exact attribute
// values ("s:<value>", text of the page) outside any functional pseudo-class; [] when it requires nothing (it may match
// on any page). A name written with a hex escape, or one HTML would write escaped, requires nothing.
export function selectorNeeds(selector) {
  const needs = [];
  let index = 0;
  while (index < selector.length) {
    const char = selector[index];
    if (char === '\\') { index += 2; continue; }
    if (char === '(') {
      let depth = 1;
      index += 1;
      while (index < selector.length && depth > 0) { if (selector[index] === '\\') index += 1; else if (selector[index] === '(') depth += 1; else if (selector[index] === ')') depth -= 1; index += 1; }
      continue;
    }
    if (char === '[') {
      const end = selector.indexOf(']', index);
      const inside = selector.slice(index + 1, end < 0 ? selector.length : end);
      // Only an exact value (=, ~=) must appear as it is; ^= *= $= |= and a bare attribute require nothing.
      const exact = /^\s*[\w-]+\s*~?=\s*(?:"([^"]*)"|'([^']*)'|([^\s\]]+))\s*(?:[is])?\s*$/.exec(inside);
      const value = exact ? (exact[1] ?? exact[2] ?? exact[3]) : null;
      if (value && !/[&<>"'\\]/.test(value)) needs.push(`s:${value}`);
      index = end < 0 ? selector.length : end + 1;
      continue;
    }
    if ((char === '.' || char === '#') && IDENT.test(selector.slice(index + 1))) {
      const name = IDENT.exec(selector.slice(index + 1))[0];
      const read = unescape(name);
      if (!/\\[0-9a-fA-F]/.test(name) && !/[&<>"']/.test(read)) needs.push(`w:${read}`);
      index += 1 + name.length;
      continue;
    }
    index += 1;
  }
  return needs;
}

// A stylesheet's rules, each with the at-rules around it (context) and what each of its selectors needs: a rule whose
// every selector needs something is a page's ({ needs: [[...], ...] }), any other is shared (needs: null).
export function cssRules(css, context = '') {
  const rules = [];
  for (const { prelude, body } of cssItems(css)) {
    if (body === null) { rules.push({ context, text: `${prelude};`, needs: null }); continue; }
    const name = /^@([\w-]+)/.exec(prelude)?.[1]?.toLowerCase();
    if (name && BLOCK_AT_RULES.has(name) && body.includes('{')) { rules.push(...cssRules(body, `${context}${prelude}{`)); continue; }
    const text = `${prelude}{${body}}`;
    if (name) { rules.push({ context, text, needs: null }); continue; }
    const needs = splitSelectors(prelude).map(selectorNeeds);
    rules.push({ context, text, needs: needs.length && needs.every((list) => list.length) ? needs : null });
  }
  return rules;
}

// What a page offers a selector: the words of its HTML and of the scripts it loads, and the literal parts scripts
// build class names from (`chat__message--${who}`, 'block--' + kind, kind + '--open').
export function pageWords(texts) {
  const words = new Set();
  const all = texts.join('\n');
  const prefixes = new Set();
  const suffixes = new Set();
  for (const text of texts) {
    for (const match of text.matchAll(/class(?:Name)?\s*=\s*["']([^"']*)["']/g)) for (const name of match[1].split(/\s+/)) if (name) words.add(name);
    for (const match of text.matchAll(/[^\s"'`<>=(){};,+]+/g)) words.add(match[0]);
    for (const match of text.matchAll(/[\w-]+/g)) words.add(match[0]);
    for (const match of text.matchAll(/([\w-]{2,})(?:\$\{|["'`]\s*\+)/g)) prefixes.add(match[1]);
    for (const match of text.matchAll(/(?:\}|\+\s*["'`])([\w-]{2,})/g)) suffixes.add(match[1]);
  }
  return { words, prefixes: [...prefixes], suffixes: [...suffixes], text: all };
}

const present = (need, { words, prefixes, suffixes, text }) => {
  const name = need.slice(2);
  if (need.startsWith('s:')) return text.includes(name);
  return words.has(name) || prefixes.some((prefix) => name.startsWith(prefix)) || suffixes.some((suffix) => name.endsWith(suffix));
};

// The rules a page can use, as one text in the stylesheet's order.
export function pageCss(rules, offered) {
  return rules.filter((rule) => rule.needs && rule.needs.some((needs) => needs.every((need) => present(need, offered)))).map((rule) => `${rule.context}${rule.text}`).join('\n');
}

// The rules every page shares, as one text.
export const sharedCss = (rules) => rules.filter((rule) => !rule.needs).map((rule) => `${rule.context}${rule.text}`).join('\n');
