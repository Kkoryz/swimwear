import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { heroSizes, WEB_WIDTHS } from '../lib/web-image.mjs';

// The file a browser takes from a w-descriptor srcset: the slot the first matching sizes entry gives (px or vw), times
// the device pixel ratio, then the smallest candidate at least that wide (else the widest).
function chosen(sizes, viewport, dpr, widths = WEB_WIDTHS) {
  const entries = sizes.split(',').map((part) => part.trim());
  const matches = (query) => { const max = query.match(/max-width:\s*(\d+)px/); const min = query.match(/min-width:\s*(\d+)px/); return (!max || viewport <= Number(max[1])) && (!min || viewport >= Number(min[1])); };
  const slot = entries.map((entry) => entry.match(/^(?:\(([^)]*)\)\s+)?(\d+(?:\.\d+)?)(px|vw)$/)).find((match) => match && (!match[1] || matches(match[1])));
  const needed = (slot[3] === 'vw' ? (viewport * Number(slot[2])) / 100 : Number(slot[2])) * dpr;
  return [...widths].sort((a, b) => a - b).find((width) => width >= needed) ?? Math.max(...widths);
}

// site13 blind audit M4: sizes="100vw" chose the 1536 file on a DPR 3 phone (LCP 3 to 4.5 s on slow mobile).
test('a phone takes the hero\'s 480 or 960 file, a desktop the 1536', () => {
  assert.equal(chosen('100vw', 390, 3), 1536, 'the old sizes');
  for (const [viewport, dpr, width] of [[390, 3, 960], [430, 3, 960], [390, 2, 960], [360, 1, 480], [767, 3, 960]]) assert.equal(chosen(heroSizes(), viewport, dpr), width, `${viewport}px at ${dpr}x`);
  assert.equal(chosen(heroSizes(), 1440, 1), 1536);
  assert.equal(chosen(heroSizes('(min-width: 900px) 50vw, 100vw'), 390, 3), 960);
  assert.equal(chosen(heroSizes('(min-width: 900px) 50vw, 100vw'), 1440, 2), 1536);
});

test('every hero photo of PageHero.astro declares the phone slot', async () => {
  const source = await readFile(new URL('../../src/components/blocks/PageHero.astro', import.meta.url), 'utf8');
  assert.equal((source.match(/<Picture\b[^>]*sizes=\{heroSizes\(/g) ?? []).length, 3);
  assert.doesNotMatch(source, /<Picture\b[^>]*sizes="/);
});
