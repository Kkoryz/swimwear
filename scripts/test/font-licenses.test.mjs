import assert from 'node:assert/strict';
import test from 'node:test';

import { OPEN_FONTS, SUBSTITUTES, fontLicence, resolveFamily, substituteFor, unlicensedRoles } from '../lib/font-licenses.mjs';

test('open and system fonts pass; a commercial reference face must be substituted', () => {
  assert.equal(fontLicence('"Open Sans"'), 'open');
  assert.equal(fontLicence('Times New Roman'), 'system');
  assert.equal(fontLicence('Maison Neue'), 'unknown');
  const lock = { roles: { body: { family: 'DM Sans', substituteFor: 'Maison Neue' }, hero: { family: 'Maison Neue' }, navigation: { family: 'Arial' }, display: { family: 'Lexend', source: 'google-fonts' } } };
  assert.deepEqual(unlicensedRoles(lock), [{ role: 'hero', family: 'Maison Neue' }]);
});

test('the substitution table replaces a commercial family by its open stand-in, whatever its spelling', () => {
  assert.equal(substituteFor('freight-text-pro').family, 'Source Serif 4');
  assert.equal(substituteFor('"Freight Text Pro Book"').family, 'Source Serif 4');
  assert.equal(substituteFor('futura-pt').family, 'Jost');
  assert.equal(substituteFor('Futura PT').family, 'Jost');
  assert.equal(substituteFor('Maison Neue').family, 'DM Sans');
  // swimwearbali.com serves its Maison Neue files under the alias names Maison and Maison Book.
  assert.equal(substituteFor('Maison').family, 'DM Sans');
  assert.equal(substituteFor('"Maison Book"').family, 'DM Sans');
  // A name that only starts like a key is not it.
  assert.equal(substituteFor('Freighter'), null);
  assert.equal(substituteFor('Josefin Sans'), null);
  // Every stand-in is an open font.
  for (const { family } of Object.values(SUBSTITUTES)) assert.ok(OPEN_FONTS.includes(family), family);
});

test('a family resolves to its substitute, to itself on Google Fonts, or to a system font with no file', () => {
  assert.deepEqual(resolveFamily('freight-text-pro, Helvetica, Arial, _sans-serif'), { family: 'Source Serif 4', substituteFor: 'freight-text-pro', category: 'serif', source: 'google-fonts' });
  assert.deepEqual(resolveFamily('"Josefin Sans", Helvetica'), { family: 'Josefin Sans', source: 'google-fonts' });
  assert.deepEqual(resolveFamily('Georgia'), { family: 'Georgia', source: 'system' });
});
