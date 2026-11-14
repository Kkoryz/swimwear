import assert from 'node:assert/strict';
import test from 'node:test';

import { isDecorative, parsePage } from '../lib/built-site.mjs';
import { liveProblems } from '../lib/live-checks.mjs';

const html = '<html lang="en"><head><title> Leggings </title><meta content="Custom leggings." name="description"><meta name="robots" content="noindex, follow">'
  + '<link href="https://knitpace.com/leggings/" rel="canonical"><meta property="og:image" content="https://knitpace.com/og.png">'
  + '<script type="application/ld+json">{"@type":"Service"}</script><script type="application/ld+json">{bad</script></head>'
  + '<body><img class="logo" src="/logo.svg" alt="Knit Pace"><main><h1>Leggings &amp; <b>tights</b></h1>'
  + '<img class="hero__backdrop" src="/h.webp" alt="" loading="eager"><img src="/c.webp" alt data-decorative><img src="/x.webp">'
  + '<a href="/about/">About us</a><a href="/x/" aria-label="X"><img src="/i.svg" alt="Icon"></a><p>We make leggings.</p></main></body></html>';

test('a built page: head tags in any attribute order, JSON-LD, headings, images and links', () => {
  const page = parsePage(html);
  assert.equal(page.lang, 'en');
  assert.equal(page.title, 'Leggings');
  assert.equal(page.description, 'Custom leggings.');
  assert.equal(page.robots, 'noindex, follow');
  assert.equal(page.canonical, 'https://knitpace.com/leggings/');
  assert.equal(page.meta.get('og:image'), 'https://knitpace.com/og.png');
  assert.deepEqual(page.jsonLd.map((block) => block.data?.['@type'] ?? 'invalid'), ['Service', 'invalid']);
  assert.deepEqual(page.headings.map((heading) => [heading.level, heading.text]), [[1, 'Leggings & tights']]);
  assert.deepEqual(page.images.map((image) => [image.src, image.alt, image.inMain]), [['/logo.svg', 'Knit Pace', false], ['/h.webp', '', true], ['/c.webp', '', true], ['/x.webp', null, true], ['/i.svg', 'Icon', true]]);
  assert.deepEqual(page.links.map((link) => [link.href, link.text, link.ariaLabel, link.imageAlt]), [['/about/', 'About us', null, null], ['/x/', '', 'X', 'Icon']]);
  assert.equal(page.mainText, 'leggings tights about us we make leggings');
});

test('a backdrop or a data-decorative photo is decorative, any other photo is not', () => {
  assert.deepEqual(parsePage(html).images.map(isDecorative), [false, true, true, false, false]);
});

test('the live home page canonical is read whatever the attribute order', () => {
  const origin = 'https://knitpace.com';
  const problems = liveProblems(origin, { home: { status: 200, headers: {}, body: `<head><link href="${origin}/" rel="canonical"></head>` } });
  assert.ok(!problems.some((problem) => problem.check === 'home_canonical'));
});
