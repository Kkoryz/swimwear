import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { BLOCK_VARIANTS, TEMPLATE_VARIANTS } from '../lib/authoring-contract.mjs';
import { importantCount, overriddenDeclarations, parseRules, splitSelectors, unknownVariants } from '../lib/css-lint.mjs';

const SHEETS = ['src/styles/template.css', 'src/styles/patterns.css'];
// !important in the shared stylesheets may only go down from here (the heading margins are the most of it).
const IMPORTANT_CEILING = { 'src/styles/template.css': 10, 'src/styles/patterns.css': 25 };
const known = new Set([...Object.values(TEMPLATE_VARIANTS).flat(), ...Object.values(BLOCK_VARIANTS).flat()]);

test('the shared stylesheets set no property twice for one selector, name no retired variant and add no !important', async () => {
  for (const sheet of SHEETS) {
    const css = await readFile(new URL(`../../${sheet}`, import.meta.url), 'utf8');
    const rules = parseRules(css);
    assert.deepEqual(overriddenDeclarations(rules), [], `${sheet}: a declaration later overridden is dead`);
    assert.deepEqual(unknownVariants(css, known), [], `${sheet}: a selector for a variant no block has`);
    assert.ok(importantCount(rules) <= IMPORTANT_CEILING[sheet], `${sheet}: ${importantCount(rules)} !important, more than ${IMPORTANT_CEILING[sheet]}`);
  }
});

test('dark FAQ cards fold like the accordion, the first open; a caption panel sits over its photo, not under it', async () => {
  const faq = await readFile(new URL('../../src/components/blocks/FaqBlock.astro', import.meta.url), 'utf8');
  assert.match(faq, /const open = \['open-list', 'cards'\]\.includes\(variant\)/, 'only the open list and the light cards show every answer');
  const patterns = await readFile(new URL('../../src/styles/patterns.css', import.meta.url), 'utf8');
  assert.doesNotMatch(patterns, /\[data-variant="dark-cards"\]\) summary \{ cursor: default; pointer-events: none/, 'a dark card\'s summary can be clicked');
  assert.match(patterns, /\[data-variant="caption-panel"\] figcaption \{ position: absolute; inset: auto/, 'the caption panel is inside the photo');
  assert.doesNotMatch(patterns, /\[data-variant="caption-panel"\] \.gallery__item \{[^}]*box-shadow/, 'no card shadow around a caption-panel tile');
  // The circles gallery is a carousel with controls (Track.astro), not a scroll row with no way to move it.
  const gallery = await readFile(new URL('../../src/components/blocks/GalleryBlock.astro', import.meta.url), 'utf8');
  assert.match(gallery, /module === 'circles' && \(\s*<Track /);
  assert.match(patterns, /\[data-variant="circles"\] \.track \{ --carousel-item-width: var\(--circles-item-width/);
});

test('the stylesheet reader keeps media contexts and selector lists apart', () => {
  const rules = parseRules('.a, :is(h2, p) { color: red; }\n@media (min-width: 900px) { .a { color: blue !important; } }\n.a { margin: 0; color: green; }');
  assert.deepEqual(splitSelectors('.a, :is(h2, p)'), ['.a', ':is(h2, p)']);
  assert.deepEqual(rules.map((rule) => [rule.selector, rule.context]), [['.a, :is(h2, p)', ''], ['.a', '@media (min-width: 900px)'], ['.a', '']]);
  assert.equal(importantCount(rules), 1);
  assert.deepEqual(overriddenDeclarations(rules).map((item) => [item.selector, item.property, item.lines]), [['.a', 'color', [1, 3]]]);
});
