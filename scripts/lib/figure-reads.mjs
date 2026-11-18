// Whether a figure (a value over its label: the trust bar's, a page's own) reads: used where figures are chosen
// (lib/page-figures.mjs) and where they are checked (lib/site-data-checks.mjs).

// Words that end no figure: a value cut off before its noun ("65 that" from "a team of 65 that completes…").
export const FUNCTION_WORDS = Object.freeze(['a', 'about', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'but', 'by', 'for', 'from', 'in', 'into', 'is', 'it', 'its', 'of', 'on', 'or', 'our', 'over', 'per', 'so', 'than', 'that', 'the', 'their', 'then', 'these', 'they', 'this', 'those', 'to', 'up', 'was', 'we', 'were', 'which', 'who', 'whom', 'whose', 'with', 'you', 'your']);
const words = (text) => String(text ?? '').toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) ?? [];
const singular = (word) => word.replace(/ies$/, 'y').replace(/(ch|sh|x|ss)es$/, '$1').replace(/s$/, '');
// What is wrong with a trust-bar figure (value, label), or null: a number followed by a function word, or a label that
// opens on the value's unit ("5 years" over "Years experience" reads "5 years years experience").
export function trustValueProblem({ value, label }) {
  const text = String(value ?? '').trim();
  if (!/\d/.test(text)) return null;
  const last = words(text).at(-1);
  if (last && FUNCTION_WORDS.includes(last) && new RegExp(`\\d[\\d,.]*\\s+(?:\\S+\\s+)*${last}\\W*$`, 'i').test(text)) return `"${text}" ends on "${last}": a figure cut off before its noun`;
  const unit = /[a-z]$/i.test(text) ? last : null;
  const first = words(label)[0];
  if (unit && first && singular(unit) === singular(first)) return `"${text}" over "${label}": the label repeats the unit`;
  return null;
}

// A figure shown without the unit its label opens on ("5 years" over "Years experience" shows "5"; site12 2026-11-17:
// Site Factory's values are a number and its unit, and its labels name the unit as well). The value's words are Site
// Factory's; only the repeated one is not shown twice.
export function withoutRepeatedUnit({ value, label, ...rest }) {
  const text = String(value ?? '').trim();
  const last = words(text).at(-1);
  const first = words(label)[0];
  if (!/\d/.test(text) || !/[a-z]$/i.test(text) || !last || !first || singular(last) !== singular(first)) return { value, label, ...rest };
  const kept = text.replace(new RegExp(`\\s*${last}$`, 'i'), '').trim();
  return /\d/.test(kept) ? { value: kept, label, ...rest } : { value, label, ...rest };
}

// A number stated as a limit ("no more than 10 properties", "up to 5 properties", "each batch of 5") is a cap, not a
// count: a stand-in count (clients served) is not made from it nor checked against it (site12 2026-11-17: "manages no
// more than 10 properties" became "10 clients served", then "up to 5 properties" contradicted it).
const BOUND = /\b(?:up to|no more than|not more than|at most|maximum(?: of)?|max\.?|fewer than|less than|under|batch of|per|every|each)\s*$/i;
// The matches of a measure (a RegExp or its source) in a text that state a count, not a limit.
export function countMatches(text, measure) {
  const pattern = measure instanceof RegExp ? new RegExp(measure.source, measure.flags.includes('g') ? measure.flags : `${measure.flags}g`) : new RegExp(measure, 'gi');
  return [...String(text ?? '').matchAll(pattern)].filter((match) => !BOUND.test(String(text).slice(Math.max(0, match.index - 30), match.index)));
}
