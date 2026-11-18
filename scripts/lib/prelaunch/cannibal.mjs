// Prelaunch check 2, cannibalisation: no two pages or articles are written for the same main search, and no page's or
// article's main search is another page's secondary (lib/search-key.mjs cannibalHits, the rule Site Factory's blog
// pick and the publish gate use). The searches: Site Factory's pages.json and keywords.json (lib/site-keywords.mjs),
// the articles' geo.keyword.

import { cannibalHits, searchIndex } from '../search-key.mjs';

// searches: [{ route, role: 'primary' | 'secondary', query }]. One finding per pair: two primaries once, a primary and
// another page's secondary once per secondary.
export function cannibalFindings(searches) {
  const index = searchIndex(searches);
  const seen = new Set();
  const findings = [];
  for (const subject of searches.filter((entry) => entry.role === 'primary')) {
    for (const hit of cannibalHits(subject, index)) {
      const key = hit.role === 'primary' ? ['primary', ...[`${subject.route} ${subject.query}`, `${hit.route} ${hit.query}`].sort()].join('|') : `secondary|${subject.route} ${subject.query}|${hit.route} ${hit.query}`;
      if (seen.has(key)) continue;
      seen.add(key);
      findings.push({ level: 'issue', kind: hit.role === 'primary' ? 'primary_primary' : 'primary_secondary', route: subject.route, query: subject.query, other: { route: hit.route, role: hit.role, query: hit.query }, detail: hit.role === 'primary' ? `the same main search as ${hit.route} ("${hit.query}")` : `the main search is ${hit.route}'s secondary "${hit.query}"` });
    }
  }
  return findings;
}
