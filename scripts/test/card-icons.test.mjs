import assert from 'node:assert/strict';
import test from 'node:test';

import { cardIcon } from '../lib/card-icons.mjs';
import map from '../../config/card-icons.json' with { type: 'json' };
import lucide from '../../src/lib/lucide-icons.json' with { type: 'json' };

const card = (heading, text = '') => ({ heading, paragraphs: text ? [text] : [] });

test("an icon card's icon comes from its title, then its text, else the fallback", () => {
  assert.equal(cardIcon(card('Revenue management')), 'trending-up');
  assert.equal(cardIcon(card('Accounting and reporting')), 'calculator');
  assert.equal(cardIcon(card('IT support')), 'server', 'IT written in capitals');
  assert.equal(cardIcon(card('Full remote management')), 'monitor-smartphone', 'the first rule that matches wins');
  assert.equal(cardIcon(card('Housekeeping')), 'bed', 'a word starting a rule word*');
  assert.equal(cardIcon(card('Front-desk cover')), 'concierge-bell', 'a hyphened word');
  assert.equal(cardIcon(card('Why it pays', 'We take over the guest messages.')), 'concierge-bell', 'no rule in the title: the text decides; "it" is not IT');
  assert.equal(cardIcon(card('Something else')), map.fallback);
  assert.equal(cardIcon(card('Something else'), { ...map, fallback: null }), null, 'no fallback: no icon');
});

test('every icon the config names is in the vendored Lucide set, with its licence', () => {
  const names = new Set(Object.keys(lucide.icons));
  for (const rule of map.rules) {
    assert.ok(names.has(rule.icon), `config/card-icons.json names ${rule.icon}, which src/lib/lucide-icons.json does not hold`);
    assert.ok(rule.words.length > 0);
  }
  assert.ok(map.fallback === null || names.has(map.fallback));
  assert.equal(lucide.license, 'ISC');
  assert.match(lucide.licenseText, /Permission to use, copy, modify/);
  // Plain outline shapes only: nothing that runs or loads.
  for (const [name, inner] of Object.entries(lucide.icons)) assert.doesNotMatch(inner, /<(?!\/?(path|circle|rect|line|polyline|polygon|ellipse)\b)|\son\w+=/, name);
});
