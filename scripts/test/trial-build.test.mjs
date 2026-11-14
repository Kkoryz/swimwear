import assert from 'node:assert/strict';
import test from 'node:test';

import { GREY_FRAME, isTrialBuild, trialFramed, trialHero } from '../lib/trial-build.mjs';

test('a trial build only where asked and never in a release', () => {
  assert.equal(isTrialBuild({}), false);
  assert.equal(isTrialBuild({ SITE_TRIAL: '1' }), true);
  // A release never shows a grey frame (Fable's plan, risk 4): its empty positions stay text as they do today.
  assert.equal(isTrialBuild({ SITE_TRIAL: '1', SITE_RELEASE: '1' }), false);
});

test("a trial build shows a grey frame in every planned photo position no photo fills yet, so the page is measured as the plan counts it", () => {
  const photo = { src: '/media/a.webp', alt: 'A', width: 1200, height: 800 };
  // Fable's plan Q8: an empty position was dropped (a split row set as text), and the quick density was off.
  const lists = [[photo, { src: '', alt: '', slot: 'process' }], [null], []];
  assert.deepEqual(trialFramed(lists), [[photo, GREY_FRAME], [null], []]);
  // A grey frame is an image, as the density measure counts pictures (lib/density.mjs: img, video, background photos).
  assert.match(GREY_FRAME.src, /^data:image\/svg\+xml,/);
  assert.ok(GREY_FRAME.width > 0 && GREY_FRAME.height > 0);
});

test('a hero the plan shows with a photo shows a grey one in a trial build when it has none yet', () => {
  assert.equal(trialHero(null, true), GREY_FRAME);
  assert.equal(trialHero(null, false), null);
  const own = { src: '/media/hero.webp', alt: '' };
  assert.equal(trialHero(own, true), own);
});

test("the layout audit checks the built page keeps the plan's picture area: more than the trial build's tolerance off is the template's to see", async () => {
  const { densityOffPlan } = await import('../audit-authoring-layout.mjs');
  const { TRIAL_TOLERANCE } = await import('../lib/trial-build.mjs');
  const plan = { pages: [{ route: '/a/', estimate: { visualAreaPct: 40 } }, { route: '/b/', estimate: { visualAreaPct: 40 } }] };
  const results = [
    { route: '/a/', viewport: 'desktop', density: { visualAreaPct: 41 } },
    // The photos made for the plan cover less than its grey frames did (a crop, a frame left empty).
    { route: '/b/', viewport: 'desktop', density: { visualAreaPct: 33 } },
    { route: '/c/', viewport: 'desktop', density: { visualAreaPct: 10 } },
    { route: '/b/', viewport: 'mobile', density: null },
  ];
  assert.deepEqual(densityOffPlan(results, plan), [{ route: '/b/', viewport: 'desktop', issue: 'density_off_plan', value: 33, planned: 40, tolerance: TRIAL_TOLERANCE.visualPts }]);
  assert.deepEqual(densityOffPlan(results, null), [], 'a site with no plan (the template itself) has nothing to keep');
  const { ownerOf } = await import('../lib/issue-owners.mjs');
  assert.equal(ownerOf('density_off_plan'), 'template');
});
