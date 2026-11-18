import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { CALIBRATION_TOLERANCE, calibratePlan, compareToPlan } from '../calibrate-plan.mjs';

const BAND = { visualAreaPct: { min: 26, max: 50 } };

test("a page's estimate meets the trial build's measure within 5% of its height and 3 points of its picture area", () => {
  const plans = [
    { route: '/', pageType: 'home', band: BAND, estimate: { heightPx: 13000, visualAreaPct: 54 } },
    { route: '/a/', pageType: 'service', band: BAND, estimate: { heightPx: 5100, visualAreaPct: 41 } },
    // Not measured (a utility page has no band; a page the build lacks): not compared.
    { route: '/contact/', pageType: 'contact', band: null, estimate: { heightPx: 2000, visualAreaPct: 10 } },
  ];
  const measured = [{ route: '/', density: { contentHeight: 13897, visualAreaPct: 45 } }, { route: '/a/', density: { contentHeight: 5000, visualAreaPct: 42 } }];
  const rows = compareToPlan(plans, measured);
  assert.deepEqual(rows.map((row) => [row.route, row.heightOffPct, row.visualOffPts, row.within]), [['/', -6.5, 9, false], ['/a/', 2, -1, true]]);
  assert.deepEqual(CALIBRATION_TOLERANCE, { heightPct: 5, visualPts: 3 });
});

async function site(components = {}) {
  const root = await mkdtemp(join(tmpdir(), 'calibrate-'));
  await mkdir(join(root, 'src/data'), { recursive: true });
  await writeFile(join(root, 'src/data/template-variants.json'), JSON.stringify({ hero: 'media-overlay', components }));
  return root;
}
const variantsOf = async (root) => JSON.parse(await readFile(join(root, 'src/data/template-variants.json'), 'utf8'));

// The trial build's blocks: the hero and a text section, taller than the default model has them (rm 2026-11-14: the
// model measured on the motel site read hotel-rm's pages 0-12 points too full of pictures).
const SAMPLES = [
  { key: 'hero:media-overlay', height: 900, words: 30, visualShare: 1, before: 0, after: 0, pageType: 'home' },
  ...[80, 160, 240].map((words) => ({ key: 'text:', height: 200 + 4 * words, words, visualShare: 0, before: 1, after: 1, pageType: 'home' })),
];

test('the block model is fitted from the trial build until the plan meets the measure: no model call, no photo', async () => {
  const root = await site();
  let builds = 0;
  // The plan reads the model the calibration wrote: the default one estimates too much picture, the fitted one right.
  const plan = async () => ({ pages: [{ route: '/', pageType: 'home', band: BAND, estimate: (await variantsOf(root)).components.blockModel ? { heightPx: 13800, visualAreaPct: 45 } : { heightPx: 12000, visualAreaPct: 54 } }] });
  const build = async () => { builds += 1; return join(root, '.pipeline/trial/dist'); };
  const measure = async () => [{ route: '/', pageType: 'home', density: { contentHeight: 13897, visualAreaPct: 45 }, blocks: SAMPLES }];
  const result = await calibratePlan({ root, plan, build, measure, log: () => {} });
  assert.equal(result.converged, true);
  assert.equal(builds, 2);
  assert.deepEqual(result.rounds.map((round) => round.within), [false, true]);
  const fitted = (await variantsOf(root)).components.blockModel;
  assert.equal(fitted['hero:media-overlay'].base, 900);
  assert.equal(fitted['text:'].perWord, 4);
  // The other settings of the site stay as they were.
  assert.equal((await variantsOf(root)).hero, 'media-overlay');
});

test('a plan the measured model cannot bring to the measure stops at once, with the pages and by how much', async () => {
  const root = await site();
  let builds = 0;
  // The estimate stays off whatever the model (a part the plan does not hold: a trust bar, charts after a section).
  const plan = async () => ({ pages: [{ route: '/', pageType: 'home', band: BAND, estimate: { heightPx: 12000, visualAreaPct: 54 } }] });
  const build = async () => { builds += 1; return 'dist'; };
  const measure = async () => [{ route: '/', pageType: 'home', density: { contentHeight: 13897, visualAreaPct: 45 }, blocks: SAMPLES }];
  const result = await calibratePlan({ root, plan, build, measure, log: () => {} });
  assert.equal(result.converged, false);
  // Round 2 measured with the fitted model; a third fit would not move it: no third build.
  assert.equal(builds, 2);
  assert.equal(result.stopped, 'model_settled');
  // Off by 9 points but both inside the band: the plan's call stands, the run goes on (calibration.md reports it).
  assert.deepEqual(result.wrongCalls, []);
  assert.deepEqual(result.rounds.at(-1).pages.filter((row) => !row.within).map((row) => row.route), ['/']);
});

test('the rounds are capped: a model still moving after three builds is not converged', async () => {
  const root = await site();
  let builds = 0;
  const plan = async () => ({ pages: [{ route: '/', pageType: 'home', band: BAND, estimate: { heightPx: 12000, visualAreaPct: 54 } }] });
  const build = async () => { builds += 1; return 'dist'; };
  // Each build measures the hero taller: the model moves every time.
  const measure = async () => [{ route: '/', pageType: 'home', density: { contentHeight: 13897, visualAreaPct: 45 }, blocks: SAMPLES.map((sample) => (sample.key.startsWith('hero') ? { ...sample, height: 900 * 2 ** builds } : sample)) }];
  const result = await calibratePlan({ root, plan, build, measure, log: () => {} });
  assert.equal(result.converged, false);
  assert.equal(builds, 3);
  assert.equal(result.stopped, 'rounds');
});

test("the trial build fails the plan only where it calls a page inside its band and the measure puts it outside: a model's few points are reported", () => {
  const plans = [
    // Off by 5 points, both inside 26-50: reported, the plan's call stands.
    { route: '/a/', pageType: 'solution', band: BAND, estimate: { heightPx: 5000, visualAreaPct: 40 } },
    // Called inside, measured under the floor less 30% (18.2%): the photos would be made for a page the audit finds short.
    { route: '/b/', pageType: 'solution', band: BAND, estimate: { heightPx: 5000, visualAreaPct: 28 } },
    // Known not to fit (the owner's): under the floor in the plan and the measure, reported, not held.
    { route: '/c/', pageType: 'solution', band: BAND, estimate: { heightPx: 5000, visualAreaPct: 17 } },
    // An about page is held to the ceiling only.
    { route: '/about/', pageType: 'about', band: BAND, floorExempt: true, estimate: { heightPx: 5000, visualAreaPct: 30 } },
  ];
  const measured = [['/a/', 35], ['/b/', 16], ['/c/', 15], ['/about/', 20]].map(([route, pct]) => ({ route, density: { contentHeight: 5000, visualAreaPct: pct } }));
  const rows = compareToPlan(plans, measured);
  assert.deepEqual(rows.map((row) => [row.route, row.within, row.wrongCall]), [['/a/', false, false], ['/b/', false, true], ['/c/', true, false], ['/about/', false, false]]);
});
