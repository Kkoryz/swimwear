import assert from 'node:assert/strict';
import test from 'node:test';

import { buildFontLock, normalizeReferenceUrl, REFERENCE_VIEWPORTS } from '../capture-reference.mjs';

test('normalizes an HTTP(S) reference URL', () => {
  assert.equal(normalizeReferenceUrl('https://example.com/path'), 'https://example.com/path');
  assert.throws(() => normalizeReferenceUrl('file:///tmp/page.html'), /HTTP\(S\)/);
  assert.throws(() => normalizeReferenceUrl('not-a-url'), /HTTP\(S\)/);
});

test('builds a role-based font lock without guessing', () => {
  const elements = [
    { tag: 'body', directText: '', styles: { 'font-family': 'Poppins', 'font-weight': '400', 'font-size': '16px', 'line-height': '24px' } },
    { tag: 'h1', directText: 'Hero', styles: { 'font-family': 'Raleway', 'font-weight': '500', 'font-size': '50px', 'line-height': '70px' } },
    { tag: 'h2', directText: 'Section', styles: { 'font-family': 'Playfair Display', 'font-weight': '700', 'font-size': '35px', 'line-height': '45.5px' } },
    { tag: 'h3', directText: 'Subheading', styles: { 'font-family': 'Montserrat', 'font-weight': '600', 'font-size': '24px', 'line-height': '31.2px' } },
  ];
  const lock = buildFontLock({ sourceUrl: 'https://example.com/', elements, assets: [] });
  assert.equal(lock.roles.hero.family, 'Raleway');
  assert.equal(lock.roles.display.family, 'Playfair Display');
  assert.equal(lock.roles.subheading.weight, '600');
  assert.equal(lock.roles.body.family, 'Poppins');
});

test('a heading whose text sits in its spans has a font role, and the body is the paragraph type that carries most of the text (Duda, hometeamluxuryrentals.com)', () => {
  const font = (family, size) => ({ 'font-family': `${family}, "${family} Fallback"`, 'font-weight': '400', 'font-size': size, 'line-height': '1.4' });
  const elements = [
    { tag: 'body', selector: 'body#dmRoot', directText: '', styles: font('Montserrat', '16px') },
    { tag: 'h1', selector: '#a > h1', directText: '', styles: font('Marcellus', '72px') },
    { tag: 'span', selector: '#a > h1 > span', directText: 'Luxury Homes.', styles: font('Marcellus', '72px') },
    { tag: 'h2', selector: '#b > h2', directText: '', styles: font('Marcellus', '40px') },
    { tag: 'span', selector: '#b > h2 > span', directText: 'Featured rentals', styles: font('Marcellus', '40px') },
    // A small print line first, the copy after it in spans.
    { tag: 'p', selector: '#c > p', directText: 'Ratings reported by guests.', styles: font('Montserrat', '11px') },
    ...[1, 2, 3].flatMap((n) => [
      { tag: 'p', selector: `#d${n} > p`, directText: '', styles: font('Montserrat', '18px') },
      { tag: 'span', selector: `#d${n} > p > span`, directText: 'We look after every detail of your stay, from the first message to the last checkout of the season.', styles: font('Montserrat', '18px') },
    ]),
  ];
  const lock = buildFontLock({ sourceUrl: 'https://hometeamluxuryrentals.com/', elements, assets: [] });
  assert.deepEqual([lock.roles.hero.family, lock.roles.hero.size], ['Marcellus', '72px']);
  assert.equal(lock.roles.display.size, '40px');
  assert.deepEqual([lock.roles.body.family, lock.roles.body.size], ['Montserrat', '18px']);
});

test('captures the fixed MVP viewport contract', () => {
  assert.deepEqual(
    REFERENCE_VIEWPORTS.map(({ id, width }) => ({ id, width })),
    [
      { id: 'desktop-1440', width: 1440 },
      { id: 'tablet-768', width: 768 },
      { id: 'mobile-390', width: 390 },
    ],
  );
});
