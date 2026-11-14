import assert from 'node:assert/strict';
import test from 'node:test';

import { changedRoutes, pageSnapshot, snapshotDrift } from '../lib/seo-snapshot.mjs';

const html = ({ title = 'Leggings Manufacturer', robots = '', canonical = 'https://knitpace.com/leggings/', schema = '{"@type":"Service"}', h1 = 'Leggings', body = 'We make leggings.' } = {}) =>
  `<html><head><title>${title}</title><meta name="description" content="D">${robots}<link rel="canonical" href="${canonical}"><meta property="og:image" content="https://knitpace.com/og.png"><script type="application/ld+json">${schema}</script></head><main><h1>${h1}</h1><h2>Fabrics</h2><p>${body}</p></main></html>`;
const snap = (pages) => ({ pages: Object.fromEntries(Object.entries(pages).map(([route, options]) => [route, pageSnapshot(html(options))])) });

test('a page snapshot holds what search engines read', () => {
  const page = pageSnapshot(html());
  assert.equal(page.title, 'Leggings Manufacturer');
  assert.equal(page.canonical, 'https://knitpace.com/leggings/');
  assert.equal(page.h1, 'Leggings');
  assert.deepEqual(page.h2, ['Fabrics']);
  assert.deepEqual(page.schemaTypes, ['Service']);
  assert.equal(page.robots, null);
});

test('a removed page, added noindex, moved canonical and dropped schema are critical', () => {
  const baseline = snap({ '/a/': {}, '/b/': {} });
  const next = snap({ '/a/': { robots: '<meta name="robots" content="noindex, follow">', canonical: 'https://knitpace.com/x/', schema: '{"@type":"WebPage"}' } });
  const critical = snapshotDrift(baseline, next).filter((change) => change.level === 'critical').map((change) => `${change.route} ${change.rule}`);
  assert.deepEqual(critical, ['/a/ noindex_added', '/a/ canonical_changed', '/a/ schema_removed', '/b/ page_removed']);
});

test('copy edits are warnings or info, and changed routes are what IndexNow submits', () => {
  const baseline = snap({ '/a/': {}, '/b/': {} });
  const next = snap({ '/a/': { title: 'Custom Leggings Manufacturer', body: 'We make custom leggings.' }, '/b/': {}, '/c/': {} });
  const changes = snapshotDrift(baseline, next);
  assert.ok(changes.every((change) => change.level !== 'critical'));
  assert.deepEqual(changes.map((change) => change.rule).sort(), ['content_changed', 'page_added', 'title_changed']);
  assert.deepEqual(changedRoutes(changes).sort(), ['/a/', '/c/']);
});
