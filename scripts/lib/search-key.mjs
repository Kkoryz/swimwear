// One search however it is written: the cannibalisation rule Site Factory's blog pick holds a topic to (sf-blog-v2
// sitefactory/blog/topics.py page_hit: two searches are the same when their written forms are equal, or their query
// keys are; equal only, never one held in another), ported from sitefactory/core (keyword_data.written_form,
// text.query_key, text.singular) so the site's checks judge as the pick did: the prelaunch audit (lib/prelaunch/
// cannibal.mjs) and the publish gate (lib/blog-gates.mjs). One port, used by both; test/search-key.test.mjs holds it to
// the Python functions when the Site Factory code is at hand (SITE_FACTORY_CODE).
// The one difference: Site Factory picks a word's singular by how often English uses each candidate (wordfreq:
// "movies" movie, not movy); without that table every candidate is kept, and two searches are the same when any of
// their forms are. A superset of Site Factory's equal pairs: what it calls one search, this does too.

// English function words: they never tell two searches apart (sitefactory.core.text.FUNCTION_WORDS).
const FUNCTION_WORDS = new Set(['a', 'an', 'and', 'for', 'in', 'of', 'the', 'to', 'with']);

// sitefactory.core.text.normalize_query: NFKC, lower case, one apostrophe, single spaces.
const normalizeQuery = (text) => String(text ?? '').normalize('NFKC').toLowerCase().replaceAll('’', "'").split(/\s+/).filter(Boolean).join(' ');

// The singulars a word may have (sitefactory.core.text._singular_word; its wordfreq choices kept as alternatives).
function singularWords(word) {
  if (!/^\p{L}+$/u.test(word.replaceAll('-', '')) || word.length < 3 || word.endsWith('ss')) return [word];
  if (word.length === 3) return word.endsWith('s') ? [word, word.slice(0, -1)] : [word];
  if (word.endsWith('ies')) return [`${word.slice(0, -3)}y`, word.slice(0, -1)];
  if (word.endsWith('ves')) return [word.slice(0, -1), `${word.slice(0, -3)}f`, `${word.slice(0, -3)}fe`];
  if (/(ses|xes|ches|shes)$/.test(word)) return [word.slice(0, -2), word.slice(0, -1)];
  return [word.endsWith('s') ? word.slice(0, -1) : word];
}

// Every grouping form of a phrase (sitefactory.core.text.singular): hyphens as spaces, apostrophes dropped, "&" as
// "and", each word singular; [[words]] for each combination of the words' singulars.
function singularForms(phrase) {
  const words = phrase.replaceAll("'", '').replaceAll('’', '').replaceAll('&', ' and ').replaceAll('-', ' ').split(/\s+/).filter(Boolean);
  let forms = [[]];
  for (const word of words) forms = forms.flatMap((form) => singularWords(word).map((one) => [...form, one]));
  return forms;
}

// keyword_data.written_form: the words in order, singular, without function words ("vacation rentals cleaning
// services" is vacation rental cleaning service).
export const writtenForms = (query) => [...new Set(singularForms(normalizeQuery(query)).map((words) => words.filter((word) => !FUNCTION_WORDS.has(word)).join(' ')))];

// text.query_key: the words in any order, singular, without function words ("women's jeans wholesale" and "wholesale
// womens jeans" share one; "tshirt" and "t shirt" do not). Only letters, digits and ' ’ & - make words.
export function queryKeys(query) {
  const tokens = String(query ?? '').toLowerCase().match(/[a-z0-9'’&-]+/g) ?? [];
  return [...new Set(singularForms(tokens.join(' ')).map((words) => {
    const set = new Set(words);
    const kept = [...set].filter((word) => !FUNCTION_WORDS.has(word));
    return (kept.length ? kept : [...set]).sort().join(' ');
  }))];
}

// The keys a search is filed under: its written forms and its query keys.
const keysOf = (query) => [...writtenForms(query).map((form) => `form:${form}`), ...queryKeys(query).map((key) => `key:${key}`)].filter((key) => !/^(form|key):$/.test(key));

// Whether two searches are one (page_hit's equality).
export const sameSearch = (left, right) => { const keys = new Set(keysOf(left)); return keysOf(right).some((key) => keys.has(key)); };

// The site's searches, filed for lookup: entries [{ query, ...anything }]; hits(query) is every entry that is the
// same search, in the order given.
export function searchIndex(entries = []) {
  const byKey = new Map();
  entries.forEach((entry, order) => { for (const key of keysOf(entry.query)) (byKey.get(key) ?? byKey.set(key, []).get(key)).push(order); });
  return {
    entries,
    hits: (query) => [...new Set(keysOf(query).flatMap((key) => byKey.get(key) ?? []))].sort((a, b) => a - b).map((order) => entries[order]),
  };
}

// The cannibalisation rule, one for the prelaunch audit and the publish gate: a page's or an article's main search
// ({ route, query }) is taken when it is the same search as another page's or article's primary or secondary (entries
// of index with another route). Returns those entries.
export const cannibalHits = (subject, index) => (subject?.query ? index.hits(subject.query).filter((entry) => entry.route !== subject.route && ['primary', 'secondary'].includes(entry.role)) : []);
