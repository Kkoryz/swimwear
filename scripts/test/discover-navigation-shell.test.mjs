import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyPage, normalizeRoutePath } from '../discover-navigation-shell.mjs';

test('normalizes same-origin navigation routes', () => {
  assert.equal(normalizeRoutePath('https://argusapparel.com/about/', 'https://argusapparel.com/'), '/about');
  assert.equal(normalizeRoutePath('https://argusapparel.com/', 'https://argusapparel.com/'), '/');
  assert.equal(normalizeRoutePath('https://example.com/about', 'https://argusapparel.com/'), null);
  assert.equal(normalizeRoutePath('mailto:info@example.com', 'https://argusapparel.com/'), null);
});

test('classifies representative page types deterministically', () => {
  assert.equal(classifyPage('/'), 'home');
  assert.equal(classifyPage('/about'), 'about');
  assert.equal(classifyPage('/contact-us'), 'contact');
  assert.equal(classifyPage('/t-shirt-manufacturers'), 'manufacturer');
  assert.equal(classifyPage('/custom-embroidery-services'), 'manufacturer');
  assert.equal(classifyPage('/blog'), 'content');
});
