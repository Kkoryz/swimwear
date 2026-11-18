import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { BAND_STACK_MAX, FAQ_OPEN_MAX, HERO_FORM_FIELDS, heroShareProblems, photoName, stackedStrips, usabilityProblems } from '../lib/usability-checks.mjs';
import { ownerOf } from '../lib/issue-owners.mjs';
import { THRESHOLDS } from '../lib/thresholds.mjs';

const vh = 844;
const band = (top, height, surface) => ({ top, height, surface });
const evidence = (more = {}) => ({ viewportHeight: vh, heroFields: 0, faqs: [], openQuestions: 0, bands: [], heroSrc: null, ...more });
const issues = (list) => list.map((problem) => problem.issue);

test('a form in the first screen fails on a service page, not on the contact, the quote or a named landing page (owner 2026-11-18)', () => {
  const service = { route: '/airbnb-co-hosting/', pageType: 'solution', blocks: [{ id: 'cta', type: 'cta' }] };
  assert.deepEqual(issues(usabilityProblems(evidence({ heroFields: 9 }), { page: service })), ['hero_form']);
  assert.deepEqual(usabilityProblems(evidence({ heroFields: HERO_FORM_FIELDS - 1 }), { page: service }), [], "Vacasa's one-field estimate box is no form hero");
  assert.deepEqual(usabilityProblems(evidence({ heroFields: 9 }), { page: { route: '/contact-us/', pageType: 'contact', blocks: [] } }), []);
  assert.deepEqual(usabilityProblems(evidence({ heroFields: 9 }), { page: { route: '/request-a-quote/', pageType: 'general', blocks: [{ id: 'form', type: 'form' }] } }), []);
  const place = { route: '/san-diego/', pageType: 'place', blocks: [] };
  assert.deepEqual(issues(usabilityProblems(evidence({ heroFields: 9 }), { page: place })), ['hero_form']);
  assert.deepEqual(usabilityProblems(evidence({ heroFields: 9 }), { page: place, components: { landingPageTypes: ['place'] } }), []);
});

test('an FAQ open in full fails beyond FAQ_OPEN_MAX questions, and so does an FAQ page of open question headings', () => {
  const page = { route: '/s/', pageType: 'solution', blocks: [] };
  assert.deepEqual(issues(usabilityProblems(evidence({ faqs: [{ id: 'faq', items: 8, open: 8 }] }), { page })), ['faq_unfolded']);
  assert.deepEqual(usabilityProblems(evidence({ faqs: [{ id: 'faq', items: 8, open: 1 }, { id: 'short', items: FAQ_OPEN_MAX, open: FAQ_OPEN_MAX }] }), { page }), []);
  assert.equal(FAQ_OPEN_MAX, 2, "Staylumen's FAQ page showed three question sections open");
  const faqPage = { id: 'site:faq', route: '/faq/', pageType: 'general', blocks: [] };
  assert.deepEqual(issues(usabilityProblems(evidence({ openQuestions: 3 }), { page: faqPage })), ['faq_unfolded']);
  assert.deepEqual(usabilityProblems(evidence({ openQuestions: 4 }), { page }), [], 'question headings on another page are its sections');
  // An FAQ page of many short FAQ blocks, each open within the limit, is open in full.
  assert.deepEqual(issues(usabilityProblems(evidence({ faqs: [{ id: 'a', items: 2, open: 2 }, { id: 'b', items: 2, open: 2 }] }), { page: faqPage })), ['faq_unfolded']);
  assert.deepEqual(usabilityProblems(evidence({ faqs: [{ id: 'a', items: 2, open: 0 }, { id: 'b', items: 2, open: 0 }] }), { page: faqPage }), []);
});

test("narrow bands stacked within one screen fail from BAND_STACK_MAX: Staylumen's phone FAQ page before and after 2026-11-18", () => {
  // Before: the black header, the photo hero, a black breadcrumb row, the grey figures strip, the black sections.
  const before = [band(0, 84, 'rgb(0,0,0)'), band(84, 348, 'photo'), band(432, 36, 'rgb(0,0,0)'), band(468, 210, 'rgb(213,213,213)'), band(678, 900, 'rgb(0,0,0)')];
  assert.equal(stackedStrips(before, vh), 3);
  const page = { route: '/faq/', pageType: 'general', blocks: [] };
  assert.deepEqual(issues(usabilityProblems(evidence({ bands: before }), { page })), ['band_stack']);
  // After: the figures on the page's own surface: the header, the photo, one black page.
  const after = [band(0, 84, 'rgb(0,0,0)'), band(84, 348, 'photo'), band(432, 1100, 'rgb(0,0,0)')];
  assert.equal(stackedStrips(after, vh), 1);
  // Strips a screen apart are not one stack.
  assert.equal(stackedStrips([band(0, 80, 'a'), band(80, 900, 'b'), band(980, 60, 'c'), band(1040, 60, 'd')], vh), 1);
  // A photo wall's 20px margins are slivers, not bars.
  assert.equal(stackedStrips([band(0, 84, 'rgb(0,0,0)'), band(84, 420, 'photo'), band(504, 456, 'rgb(0,0,0)'), band(960, 20, 'rgb(255,255,255)'), band(980, 292, 'photo'), band(1272, 20, 'rgb(255,255,255)')], vh), 1);
  assert.equal(BAND_STACK_MAX, 3);
});

test("the home page's opening photo on another page fails; two pages of one type sharing one is a warning; different types pass", () => {
  assert.equal(photoName('/media/photos/general-hero-1-960.webp?x=1'), 'general-hero-1');
  const found = heroShareProblems([
    { route: '/', pageType: 'home', heroSrc: '/media/photos/general-hero-1-960.webp' },
    { route: '/faq/', pageType: 'general', heroSrc: '/media/photos/general-hero-1-1440.webp' },
    { route: '/cleaning/', pageType: 'solution', heroSrc: '/media/photos/general-hero-2-960.webp' },
    { route: '/case-studies/', pageType: 'general', heroSrc: '/media/photos/general-hero-2-960.webp' },
    { route: '/a/', pageType: 'place', heroSrc: '/media/photos/general-hero-3-960.webp' },
    { route: '/b/', pageType: 'place', heroSrc: '/media/photos/general-hero-3-960.webp' },
  ]);
  assert.deepEqual(found.map((problem) => `${problem.route} ${problem.level}`).sort(), ['/a/ warning', '/b/ warning', '/faq/ failure']);
  assert.match(found.find((problem) => problem.route === '/faq/').detail, /home page's photo/);
});

test('the checks run in the layout audit, their failures go to the site repair, their thresholds are listed', async () => {
  const audit = await readFile(new URL('../audit-authoring-layout.mjs', import.meta.url), 'utf8');
  assert.match(audit, /const usability = await page\.evaluate\(measureUsability\);/);
  assert.match(audit, /usabilityProblems\(result\.usability, \{ page: definition, components \}\)/);
  assert.match(audit, /heroShareProblems\(/);
  for (const issue of ['hero_form', 'faq_unfolded', 'band_stack']) assert.equal(ownerOf(issue), 'site-css', issue);
  const ids = THRESHOLDS.map((entry) => entry.id);
  for (const id of ['HERO_FORM_FIELDS', 'FAQ_OPEN_MAX', 'BAND_STACK_MAX', 'STRIP_MAX_SHARE']) assert.ok(ids.includes(id), id);
});
