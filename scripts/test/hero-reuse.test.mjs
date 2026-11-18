import assert from 'node:assert/strict';
import test from 'node:test';

import briefs from '../../config/image-briefs.json' with { type: 'json' };
import { HERO_MAX_PAGES, PHOTO_MAX_PAGES, planLibrary, REUSE_CAPPED_KINDS } from '../lib/image-plan.mjs';
import { heroReuseProblems, photoReuseProblems } from '../lib/seo-site-checks.mjs';

const components = { intro: 'text', featureGrid: 'outlined', hero: 'media-overlay', heroByPageType: { contact: 'plain' } };
const intro = { id: 'i', type: 'intro', heading: 'H', paragraphs: ['P'] };
// Site-wide pages of no product or service (a solution page opens on its own service photo: image-plan.mjs serviceHeroes).
const general = (count) => Array.from({ length: count }, (_, index) => ({ route: `/page-${index + 1}/`, pageType: 'general', status: 'authored', hero: { heading: `Page ${index + 1}` }, blocks: [intro] }));
const styleRefs = { hero: [{ path: 'h.jpg', subject: 'a studio' }], lifestyle: [{ path: 'l.jpg', subject: '' }], product: [{ path: 'p.jpg', subject: '' }] };
const heroes = (plan) => plan.entries.filter((entry) => entry.kind === 'hero' && entry.category === 'general' && !entry.phoneOf).length;

test('the image plan asks for site-wide heroes enough that none opens more than HERO_MAX_PAGES pages (four-site audit 2026-11-17, A-10)', () => {
  const cap = briefs.generalCaps.hero;
  // Within the cap's share the cap stands; beyond it, page-own heroes are asked for (planned only, nothing made).
  assert.equal(heroes(planLibrary({ pages: general(cap * HERO_MAX_PAGES), components, line: 'swimwear', briefs, styleRefs })), cap);
  const many = planLibrary({ pages: general(18), components, line: 'swimwear', briefs, styleRefs });
  assert.equal(heroes(many), Math.ceil(18 / HERO_MAX_PAGES));
  assert.ok(many.entries.filter((entry) => entry.kind === 'hero').every((entry) => entry.status === 'planned'));
  assert.equal(HERO_MAX_PAGES, 3);
});

test('a hero photo opening more than HERO_MAX_PAGES indexable pages is reported', () => {
  const page = (route, status = 'authored') => ({ route, status, pageType: 'solution' });
  const html = (src) => `<html><body><main id="main"><section class="page-hero" data-authoring-block="hero"><img src="${src}" alt="" loading="eager"></section><section data-authoring-block="intro"><img src="/media/photos/other.webp" alt=""></section></main></body></html>`;
  const pages = [page('/a/'), page('/b/'), page('/c/'), page('/d/'), page('/e/'), page('/held/', 'hold')];
  const built = new Map(pages.map((item, index) => [item.route, html(index === 4 ? '/media/photos/own-hero.webp' : '/media/photos/general-hero-1-960.webp')]));
  const found = heroReuseProblems(pages, built);
  assert.deepEqual(found.map((item) => [item.route, item.issue, item.level]), [['/media/photos/general-hero-1-960.webp', 'hero_reused', 'warning']]);
  assert.match(found[0].detail, /opens 4 pages \(\/a\/ \/b\/ \/c\/ \/d\/\), at most 3/);
  built.delete('/d/');
  assert.deepEqual(heroReuseProblems(pages, built), [], 'three pages are within');
});

test('the image plan asks for site-wide process photos enough that none shows on more than PHOTO_MAX_PAGES pages (C13)', () => {
  // site13: three process photos (general-process-1 to 3) on 11 pages each. Three photo rows a page: 33 positions.
  const rows = ['a', 'b', 'c'].map((id) => ({ id, type: 'splitMedia', heading: `Row ${id}`, paragraphs: ['P'], media: null }));
  const pages = (count) => general(count).map((page) => ({ ...page, blocks: [intro, ...rows] }));
  const own = { ...components, pageTypes: { general: { splitSequence: ['single'] } } };
  const process = (plan) => plan.entries.filter((entry) => entry.kind === 'process' && entry.category === 'general');
  const all = { ...briefs, placeholderKinds: [] };
  assert.deepEqual(REUSE_CAPPED_KINDS, ['process']);
  assert.equal(process(planLibrary({ pages: pages(PHOTO_MAX_PAGES), components: own, line: 'swimwear', briefs: all, styleRefs })).length, briefs.caps.process, "within the cap's share the cap stands");
  const many = process(planLibrary({ pages: pages(11), components: own, line: 'swimwear', briefs: all, styleRefs }));
  assert.equal(many.length, Math.ceil((11 * rows.length) / PHOTO_MAX_PAGES));
  assert.ok(many.every((entry) => entry.status === 'planned'), 'planned only: nothing is made here');
  // A site with its own process photos plans none (the class is left to them).
  assert.equal(process(planLibrary({ pages: pages(11), components: own, line: 'swimwear', briefs, styleRefs })).length, 0);
});

test('a site-wide process photo on more than PHOTO_MAX_PAGES indexable pages is reported as process_reused', () => {
  const page = (route, status = 'authored') => ({ route, status, pageType: 'solution' });
  const photo = (id) => `<img src="/media/photos/${id}-960.webp" srcset="/media/photos/${id}-480.webp 480w, /media/photos/${id}-960.webp 960w" alt="">`;
  const html = (ids) => `<html><body><main id="main"><section data-authoring-block="split">${ids.map(photo).join('')}</section></main></body></html>`;
  const pages = [page('/a/'), page('/b/'), page('/c/'), page('/d/'), page('/held/', 'hold')];
  const built = new Map(pages.map((item) => [item.route, html(['general-process-1', 'general-product-1', item.route === '/a/' ? 'general-process-2' : 'general-process-3'])]));
  const found = photoReuseProblems(pages, built);
  assert.deepEqual(found.map((item) => [item.route, item.issue, item.level]), [['/media/photos/general-process-1', 'process_reused', 'warning']]);
  assert.match(found[0].detail, /shows on 4 pages \(\/a\/ \/b\/ \/c\/ \/d\/\), at most 3/);
  built.delete('/d/');
  assert.deepEqual(photoReuseProblems(pages, built), [], 'three pages are within; a held page does not count');
});

test("a site's lineLabel names the line in the photos' subjects; the line stays the plan's key (site12 2026-11-17)", () => {
  const coded = planLibrary({ pages: general(2), components, line: 'hotel-rm', briefs, styleRefs });
  const named = planLibrary({ pages: general(2), components, line: 'hotel-rm', lineName: 'hotel revenue management', briefs, styleRefs });
  const general1 = (plan) => plan.entries.filter((entry) => entry.category === 'general').map((entry) => entry.subject).join(' | ');
  assert.match(general1(coded), /hotel-rm/);
  assert.doesNotMatch(general1(named), /hotel-rm/);
  assert.equal(named.line, coded.line);
  assert.deepEqual(named.entries.map((entry) => entry.id), coded.entries.map((entry) => entry.id), 'the same photos, only worded otherwise');
});
