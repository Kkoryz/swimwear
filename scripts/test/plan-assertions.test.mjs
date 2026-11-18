import assert from 'node:assert/strict';
import test from 'node:test';

import { PLAN_ASSERTIONS, planGate } from '../lib/plan-assertions.mjs';
import { SITE_DECISIONS } from '../lib/protected-rules.mjs';

const block = (fields) => ({ id: 'b', type: 'intro', variant: null, surface: 'white', slots: [], estimate: { heightPx: 400, visualPx: 0, pictured: false }, ...fields });
const page = (blocks, fields = {}) => ({ route: '/x/', pageType: 'solution', hero: null, blocks, budgetWalls: 0, signatureFloor: 0, signatureBands: 0, band: null, ...fields });
const issues = (plans, context = {}) => planGate(plans, context).items.map((item) => item.assertion);

test('every assertion says who clears it and whether it holds the run', () => {
  for (const assertion of PLAN_ASSERTIONS) {
    assert.ok(['plan', 'template', 'site-factory', 'owner'].includes(assertion.owner), assertion.id);
    assert.ok(['fail', 'report', 'review'].includes(assertion.gate), assertion.id);
    assert.ok(assertion.zh, `${assertion.id} has its Chinese line`);
  }
});

test("the review's site decisions are the assertion table's rules, word for word as before", () => {
  assert.equal(SITE_DECISIONS.length, 9);
  assert.match(SITE_DECISIONS[0], /^the style of each module follows the competitor/);
  assert.match(SITE_DECISIONS[6], /^cards that name services carry a line icon/);
  assert.deepEqual(SITE_DECISIONS, PLAN_ASSERTIONS.filter((assertion) => assertion.rule).map((assertion) => assertion.rule));
});

test('two neighbouring plain sections on one surface fail, a tinted split row beside a tinted section too', () => {
  assert.deepEqual(issues([page([block({ id: 'a', surface: 'white' }), block({ id: 'b', surface: 'white' })])]), ['surface_repeat']);
  assert.deepEqual(issues([page([block({ id: 'a', surface: 'tinted' }), block({ id: 's', type: 'splitMedia', surface: 'tinted' })])]), ['surface_repeat']);
  assert.deepEqual(issues([page([block({ id: 'a', surface: 'white' }), block({ id: 'g', type: 'gallery', surface: 'own' }), block({ id: 'b', surface: 'white' })])]), []);
});

test('rows of short items one under the other fail; a section going on in its own block is one section', () => {
  const cards = (id, extra = {}) => block({ id, type: 'featureGrid', pattern: 'cards', columns: 3, titleLevel: 'h3', set: extra.continues ?? id, items: 3, longestItemWords: 20, ...extra });
  assert.ok(issues([page([cards('a'), { ...cards('b'), surface: 'tinted' }])]).includes('item_rows_adjacent'));
  assert.ok(!issues([page([cards('a'), { ...cards('b', { continues: 'a' }), surface: 'white' }])]).includes('item_rows_adjacent'));
});

test("a card set's grids share columns and title level; long cards go three to a row at most; no card alone in a last row", () => {
  const grid = (id, extra) => block({ id, type: 'featureGrid', pattern: 'cards', set: 's', items: 4, longestItemWords: 20, columns: 4, titleLevel: 'h3', ...extra });
  assert.ok(issues([page([grid('s', {}), grid('t', { continues: 's', titleLevel: 'h2', surface: 'own' })])]).includes('card_set_uneven'));
  assert.ok(issues([page([grid('s', { longestItemWords: 45 })])]).includes('long_cards_row'));
  assert.ok(issues([page([grid('s', { items: 5, columns: 4 })])]).includes('orphan_card'));
  assert.ok(!issues([page([grid('s', { items: 5, columns: 3 })])]).includes('orphan_card'));
});

test('service cards with photos, tall photo steps, a phone hero strip and walls out of place fail', () => {
  const related = block({ id: 'related', type: 'relatedPages', variant: 'tiles', slots: ['product'], linksTo: ['solution', 'solution'] });
  assert.ok(issues([page([related])], { serviceCards: true }).includes('service_card_photo'));
  assert.ok(!issues([page([related])], { serviceCards: false }).includes('service_card_photo'));
  assert.ok(issues([page([block({ id: 'p', type: 'process', variant: 'photo-cards', phoneHeightPx: 1240 })])]).includes('photo_steps_tall'));
  const hero = { variant: 'media-banner', photo: true, framed: true, phoneFrame: 3.06, title: { fits: true } };
  assert.ok(issues([page([], { hero })], { phoneHeroes: true }).includes('phone_hero_strip'));
  assert.ok(!issues([page([], { hero: { ...hero, phoneFrame: 0.8 } })], { phoneHeroes: true }).includes('phone_hero_strip'));
  const wall = (id) => block({ id, type: 'gallery', surface: 'own', wall: 'budget', estimate: { heightPx: 720, visualPx: 600, pictured: true } });
  assert.ok(issues([page([block({ id: 'a' }), wall('w1'), wall('w2'), block({ id: 'b', surface: 'tinted' })])]).includes('wall_placement'));
  assert.ok(issues([page([block({ id: 'c', type: 'testimonials', surface: 'own' }), wall('w1'), block({ id: 'd', type: 'logos', surface: 'own' })])]).includes('wall_placement'));
  assert.ok(issues([page([], { budgetWalls: 4 })]).includes('walls_cap'));
  assert.ok(issues([page([], { signatureFloor: 2, signatureBands: 1 })]).includes('signature_floor'));
});

test('a page\'s picture area passes within 30% either way of its band (owner 2026-11-16: planned to the band, passed within 30%)', async () => {
  const { pictureBand } = await import('../lib/rules.mjs');
  assert.deepEqual(pictureBand({ min: 7, max: 36 }), { min: 4.9, max: 46.8 });
  const band = { wordsPer1000px: { max: 266 }, visualAreaPct: { min: 7, max: 36 }, longestTextOnlyPx: { max: 8545 } };
  const at = (visualAreaPct) => planGate([page([], { band, estimate: { heightPx: 3000, visualAreaPct, longestTextOnlyPx: 600, wordsPer1000px: 90 }, feasibility: { verdict: 'fits', walls: 0, limits: [] } })]);
  // Staylumen's /resources/ (43.4% calibrated) and /locations/, short pages a hero, a table and a closing photo take over 36%.
  assert.deepEqual(at(43.4).items, []);
  assert.deepEqual(at(39.9).items, []);
  assert.match(at(46.9).items[0].detail, /pictures 46.9% over 46.8% \(36% \+ 30%\)/);
  assert.match(at(4.8).items[0].detail, /pictures 4.8% under 4.9% \(7% - 30%\)/);
});

test("a page whose pictures cannot reach the band is the owner's and 08's to know, not held and not Site Factory's; one planned off its band that could fit is held", () => {
  const band = { wordsPer1000px: { max: 36 }, visualAreaPct: { min: 47, max: 85 }, longestTextOnlyPx: { max: 820 } };
  const gate = planGate([page([], { band, estimate: { heightPx: 13900, visualAreaPct: 45, longestTextOnlyPx: 1300, wordsPer1000px: 86 }, feasibility: { verdict: 'does_not_fit', limits: [{ metric: 'visualAreaPct', walls: 6 }], reachPct: 45, gapPct: 2, cap: 3, estimate: {} } })]);
  assert.deepEqual(gate.items.map((item) => [item.assertion, item.gate, item.owner]), [['does_not_fit', 'report', 'owner']]);
  assert.match(gate.items[0].detail, /2 points short of 47%/);
  assert.equal(gate.failed, 0);
  // 30% is under 47% less 30% (32.9%).
  const off = planGate([page([], { band, estimate: { heightPx: 9000, visualAreaPct: 30, longestTextOnlyPx: 700, wordsPer1000px: 30 }, feasibility: { verdict: 'fits_with_walls', walls: 2, limits: [] } })]);
  assert.deepEqual(off.items.map((item) => [item.assertion, item.gate]), [['density_band', 'fail']]);
  // The words a 1,000px and the longest text-only run hold nothing (owner 2026-11-14: only the picture area counts).
  const wordy = planGate([page([], { band, estimate: { heightPx: 9000, visualAreaPct: 50, longestTextOnlyPx: 2700, wordsPer1000px: 90 }, feasibility: { verdict: 'fits', walls: 0, limits: [] } })]);
  assert.deepEqual(wordy.items, []);
});

test('section headings over three lines and titles that cannot keep to their lines go to Site Factory, one a width', () => {
  const plans = [page([block({ id: 'a', heading: { text: 'A very long heading', desktop: 4, mobile: 5 } })], { hero: { photo: false, framed: false, title: { text: 'T', fits: false, desktopLines: 3, phoneLines: 5 } } })];
  const gate = planGate(plans);
  assert.deepEqual(gate.items.filter((item) => item.assertion === 'section_heading_lines').map((item) => item.viewport), ['desktop', 'mobile']);
  assert.ok(gate.items.some((item) => item.assertion === 'title_lines' && item.owner === 'site-factory'));
  assert.equal(gate.failed, 0);
});

test("a wall where a section's cards go on as a list is the planner's rule (lib/visual-budget.mjs place across); between two grids of one set it fails", () => {
  const wall = block({ id: 'w', type: 'gallery', surface: 'own', wall: 'budget', estimate: { heightPx: 720, visualPx: 600, pictured: true } });
  const grid = (id, extra = {}) => block({ id, type: 'featureGrid', pattern: 'cards', set: 'm3', columns: 3, titleLevel: 'h3', items: 3, longestItemWords: 10, ...extra });
  assert.ok(!issues([page([grid('m3'), wall, block({ id: 'list', type: 'iconList', continues: 'm3', surface: 'own' })])]).includes('wall_placement'));
  assert.ok(issues([page([grid('m3'), wall, grid('m3-2', { continues: 'm3', surface: 'own' })])]).includes('wall_placement'));
});

test('an owner\'s waiver lets a gate failure through, named and kept in the list', async () => {
  const { applyPlanWaivers } = await import('../lib/plan-assertions.mjs');
  const items = [
    { assertion: 'phone_hero_strip', gate: 'fail', route: '/services/', block: 'hero' },
    { assertion: 'phone_hero_strip', gate: 'fail', route: '/about-us/', block: 'hero' },
    { assertion: 'orphan_card', gate: 'fail', route: '/hotel-digital-marketing/', block: 'featureGrid-1' },
    { assertion: 'heading_lines', gate: 'report', route: '/', block: 'm2' },
  ];
  const waivers = [
    { assertion: 'phone_hero_strip', why: 'the competitor\'s phone hero is a strip too', by: 'owner', at: '2026-11-14' },
    { assertion: 'orphan_card', route: '/other/', why: 'another page', by: 'owner', at: '2026-11-14' },
  ];
  const out = applyPlanWaivers(items, waivers);
  assert.deepEqual(out.map((item) => item.gate), ['waived', 'waived', 'fail', 'report'], 'every page by assertion; a waiver for another page does not reach this one');
  assert.match(out[0].waiver, /strip too \(owner, 2026-11-14\)/);
  assert.deepEqual(applyPlanWaivers(items, []), items);
});
