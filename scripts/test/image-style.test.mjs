import assert from 'node:assert/strict';
import test from 'node:test';

import { parseStyleProfile, PROFILE_FIELDS, pixelStats, statsRange, styleCheck, styleFor, styleProfilePrompt } from '../lib/image-style.mjs';

const pixels = (rgb, count = 16) => Array.from({ length: count }, () => rgb).flat();

test('colourfulness separates a saturated photo from a grey one; brightness is mean luminance', () => {
  const orange = pixelStats(Uint8Array.from([...pixels([240, 120, 20], 8), ...pixels([30, 30, 30], 8)]));
  const grey = pixelStats(Uint8Array.from(pixels([200, 200, 200])));
  assert.ok(orange.colourfulness > 50);
  assert.equal(grey.colourfulness, 0);
  assert.equal(grey.brightness, 200);
  assert.equal(grey.contrast, 0);
});

test('a result outside the references range (plus margin) is flagged', () => {
  const range = statsRange([{ colourfulness: 26, brightness: 100, contrast: 50 }, { colourfulness: 58, brightness: 190, contrast: 70 }]);
  assert.deepEqual(range.colourfulness, { min: 26, max: 58 });
  assert.equal(styleCheck({ colourfulness: 40, brightness: 150, contrast: 60 }, range).inRange, true);
  const drift = styleCheck({ colourfulness: 18, brightness: 215, contrast: 60 }, range);
  assert.equal(drift.inRange, false);
  assert.equal(drift.off.length, 2);
});

test('profiles need every field; a class without its own falls back to the site profile', () => {
  assert.match(styleProfilePrompt('product', 6), /6 attached images are the product photographs/);
  const full = Object.fromEntries(PROFILE_FIELDS.map((field) => [field, `${field} text`]));
  assert.deepEqual(parseStyleProfile(`thinking...\n${JSON.stringify(full)}`), full);
  assert.throws(() => parseStyleProfile('{"summary": "x"}'), /missing settings/);
  const style = { kinds: { site: { profile: 'site' }, hero: { profile: 'hero' } } };
  assert.equal(styleFor(style, 'hero').profile, 'hero');
  assert.equal(styleFor(style, 'material').profile, 'site');
});
