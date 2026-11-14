// The icon of an icon card (FeatureGridBlock.astro variant icons; lib/slot-visuals.mjs decides which cards take icons):
// config/card-icons.json maps words to Lucide icons (src/lib/lucide-icons.json). The first rule matching a word of the
// card's title wins, then one matching its text, else the config's fallback (null: no icon).

import defaults from '../../config/card-icons.json' with { type: 'json' };

// The card's words: each word as written (hyphened ones also in their parts) and each pair joined by a hyphen.
function cardWords(text = '') {
  const words = String(text).match(/[\p{L}\p{N}][\p{L}\p{N}/-]*/gu) ?? [];
  const parts = words.flatMap((word) => [word, ...(word.includes('-') ? word.split('-').filter(Boolean) : [])]);
  return [...parts, ...words.slice(1).map((word, index) => `${words[index]}-${word}`)];
}

// Whether a rule word matches a card word: written with capitals it matches only so written (IT, not "it"); else any
// case, its plural too, and a trailing * matches every word it starts.
function matches(rule, word) {
  if (/\p{Lu}/u.test(rule)) return word === rule || word === `${rule}s`;
  const lower = word.toLowerCase();
  if (rule.endsWith('*')) return lower.startsWith(rule.slice(0, -1));
  return lower === rule || lower === `${rule}s` || lower === `${rule}es`;
}

const firstRule = (rules, text) => {
  const words = cardWords(text);
  return rules.find((rule) => rule.words.some((ruleWord) => words.some((word) => matches(ruleWord, word))))?.icon ?? null;
};

// item: a card ({ heading, paragraphs }). Returns the icon's name, or null for none.
export function cardIcon(item, map = defaults) {
  return firstRule(map.rules, item?.heading) ?? firstRule(map.rules, (item?.paragraphs ?? []).join(' ')) ?? map.fallback ?? null;
}
