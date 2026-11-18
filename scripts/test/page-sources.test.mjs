import assert from 'node:assert/strict';
import test from 'node:test';

import { placeSources } from '../lib/page-assembly.mjs';
import { validateAuthoringPages } from '../lib/authoring-contract.mjs';

// Site Factory integ deb67119 (2026-11-17): a page's researched figures (a city's tax rate, a licence fee) come with
// footnotes citing the page's own sources; the page ends with them in its sources list, with when each was read.
test("a page's footnoted sources join its sources list, with when each was read; one no footnote cites is left out", () => {
  const page = {
    page_id: 'city-austin',
    knowledge: [{ card_id: 'k1', title: 'Card', sources: [{ url: 'https://www.example.org/guide', title: 'Guide', publisher: 'Example' }] }],
    sources: [
      { url: 'https://www.austintexas.gov/str', title: '', publisher: 'austintexas.gov', retrieved: '2026-11-10', quote: 'Type 2 licence' },
      { url: 'https://competitor.example.com/austin', title: 'A competitor', publisher: 'competitor.example.com' },
      { url: 'https://comptroller.texas.gov/taxes/hotel/', title: 'Hotel Occupancy Tax', publisher: 'comptroller.texas.gov', retrieved: '2026-11-11T08:00:00Z' },
    ],
    footnotes: [{ section_id: 's1', sentence: 'The city charges 9% hotel tax.', refs: [3, 1] }, { section_id: 's2', sentence: 'A licence costs USD 783.', refs: [1] }],
  };
  const blocks = [{ id: 'intro', type: 'intro', heading: 'H', paragraphs: ['P'] }, { id: 'cta', type: 'cta' }];
  const mapping = [];
  placeSources(blocks, mapping, page);
  const sources = blocks.find((block) => block.type === 'sources');
  assert.deepEqual(sources.items, [
    { title: 'Guide', url: 'https://www.example.org/guide', publisher: 'Example' },
    { title: 'austintexas.gov', url: 'https://www.austintexas.gov/str', retrieved: '2026-11-10' },
    { title: 'Hotel Occupancy Tax', url: 'https://comptroller.texas.gov/taxes/hotel/', publisher: 'comptroller.texas.gov', retrieved: '2026-11-11' },
  ]);
  assert.equal(blocks.at(-1).type, 'cta', 'before the closing call');
  assert.match(mapping[0].rule, /2 footnoted page sources/);
  const built = { id: 'x', route: '/x/', pageType: 'general', status: 'authored', seo: { title: 'T', description: 'D', canonical: '/x/' }, jsonLd: [], hero: { heading: 'H' }, blocks: [sources] };
  assert.deepEqual(validateAuthoringPages([built]), []);
  assert.throws(() => placeSources([], [], { ...page, footnotes: [{ section_id: 's', sentence: 'S', refs: [4] }] }), /cites source 4, the page lists 3/);
});
