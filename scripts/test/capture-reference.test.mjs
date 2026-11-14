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
