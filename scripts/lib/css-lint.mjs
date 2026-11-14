// Hygiene of the template's shared stylesheets (src/styles/template.css, patterns.css): a property set twice for the
// same selector in the same media context (the earlier one is dead), the same property twice in one rule, and
// selectors for block variants no block has any more. Read by scripts/test/css-lint.test.mjs, so the stylesheets stay
// clean as the template grows.

// The rules of a stylesheet: [{ selector, context, line, declarations: [{ property, value, important }] }]. Nested
// at-rules give the context ("@media (min-width: 900px)"); comments are dropped. A small parser for flat stylesheets.
export function parseRules(css) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '));
  const rules = [];
  const stack = [];
  let start = 0;
  const lineAt = (index) => text.slice(0, index).split('\n').length;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '{') {
      stack.push({ head: text.slice(start, index).trim(), at: index });
      start = index + 1;
    } else if (char === '}') {
      const open = stack.pop();
      if (!open) continue;
      const body = text.slice(start, index);
      if (!open.head.startsWith('@')) {
        const context = stack.map((item) => item.head.replace(/\s+/g, ' ')).join(' ');
        const declarations = body.split(';').map((part) => part.trim()).filter((part) => part.includes(':')).map((part) => {
          const colon = part.indexOf(':');
          const value = part.slice(colon + 1).trim();
          return { property: part.slice(0, colon).trim().toLowerCase(), value: value.replace(/\s*!important$/i, ''), important: /!important$/i.test(value) };
        });
        rules.push({ selector: open.head.replace(/\s+/g, ' '), context, line: lineAt(open.at), declarations });
      }
      start = index + 1;
    } else if (char === ';' && stack.length === 0) start = index + 1;
  }
  return rules;
}

// A property one selector sets twice in one context (in two rules, or twice in one rule): the earlier is dead.
// [{ selector, context, property, lines }]. Fallback pairs whose values differ in kind (a value then a var() of it)
// are kept apart only when the first is a plain fallback for the second (display: -webkit-box; display: flex is not).
// The selectors of a selector list, split at top-level commas only (":is(h2, p)" stays one).
export function splitSelectors(list) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const char of list) {
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (char === ',' && depth === 0) { parts.push(current.trim()); current = ''; } else current += char;
  }
  return [...parts, current.trim()].filter(Boolean);
}

export function overriddenDeclarations(rules) {
  const seen = new Map();
  const found = [];
  for (const rule of rules) for (const selector of splitSelectors(rule.selector)) {
    for (const declaration of rule.declarations) {
      if (declaration.property.startsWith('--')) continue;
      const key = `${rule.context}|${selector}|${declaration.property}`;
      const before = seen.get(key);
      if (before && !(before.important && !declaration.important)) found.push({ selector, context: rule.context, property: declaration.property, lines: [before.line, rule.line] });
      seen.set(key, { line: rule.line, important: declaration.important });
    }
  }
  return found;
}

// !important declarations of a stylesheet.
export const importantCount = (rules) => rules.reduce((sum, rule) => sum + rule.declarations.filter((declaration) => declaration.important).length, 0);

// Variant selectors ([data-variant="x"]) naming a variant no block or template component has.
export function unknownVariants(css, known) {
  return [...new Set([...css.matchAll(/\[data-variant="([^"]+)"\]/g)].map((match) => match[1]))].filter((variant) => !known.has(variant));
}
