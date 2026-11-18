import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { HEADER_LOGO_MAX_BYTES, PHONE_CROP_MAX_BYTES, imageBudgetProblems, imagePriorityProblems, phoneCropBudget } from '../lib/image-budgets.mjs';
import { pageProblems } from '../lib/seo-audit.mjs';

test('MWG image rules on a built page: at most two images fetched first, every srcset with width candidates carries sizes', () => {
  const hero = '<img src="/h.webp" srcset="/h-480.webp 480w, /h-960.webp 960w" sizes="100vw" fetchpriority="high" alt="">';
  assert.deepEqual(imagePriorityProblems(`<header><img src="/logo-header.webp" alt="Brand"></header><main>${hero}<img src="/b.webp" fetchpriority="high" alt=""></main>`), []);
  const three = imagePriorityProblems(`${hero}<img src="/b.webp" fetchpriority="high" alt=""><img src="/c.webp" fetchpriority="high" alt="">`);
  assert.deepEqual(three.map((problem) => problem.issue), ['fetchpriority_overused']);
  assert.match(three[0].detail, /3 images .*\/h\.webp, \/b\.webp, \/c\.webp/);
  // An art-directed phone source with width candidates but no sizes, and an image without; one URL needs none.
  const missing = imagePriorityProblems('<picture><source media="(max-width: 767px)" srcset="/p-480.webp 480w, /p-900.webp 900w"><source media="(min-width: 2000px)" srcset="/wide.webp"><img src="/x.webp" srcset="/x-480.webp 480w,/x-960.webp 960w" alt=""></picture>');
  assert.deepEqual(missing, [{ issue: 'srcset_without_sizes', detail: '/p-480.webp' }, { issue: 'srcset_without_sizes', detail: '/x.webp' }]);
  // The SEO audit reports them as failures.
  const page = { route: '/', status: 'authored', seo: { canonical: '/' } };
  const issues = pageProblems({ html: `<html lang="en"><head><title>A title long enough for the check here</title><meta name="description" content="d"><link rel="canonical" href="/"></head><body><main><h1>H</h1><img src="/x.webp" srcset="/x-480.webp 480w" alt="x" width="1" height="1"></main></body></html>`, page, identity: null, nav: { header: [], footer: [] } }).map((problem) => problem.issue);
  assert.ok(issues.includes('srcset_without_sizes'));
});

test("the header logo over 20 KB and a phone crop heavier than its desktop file or 150 KB fail the built site's audit", async () => {
  assert.equal(phoneCropBudget(80 * 1024), 80 * 1024);
  assert.equal(phoneCropBudget(400 * 1024), PHONE_CROP_MAX_BYTES);
  const root = await mkdtemp(join(tmpdir(), 'image-budgets-'));
  await mkdir(join(root, 'dist/media/photos'), { recursive: true });
  await mkdir(join(root, 'src/data'), { recursive: true });
  const file = (path, bytes) => writeFile(join(root, 'dist', path), Buffer.alloc(bytes));
  await file('logo-header.webp', 9 * 1024);
  await file('logo.png', 175 * 1024);
  const identity = (src) => ({ logo: { src, width: 384, height: 33 } });
  // Site13's crops: one heavier than its 103 KB desktop file, one within; one of a 300 KB photo over 150 KB.
  await file('media/photos/a-960.webp', 103 * 1024);
  await file('media/photos/a-960-phone-70.webp', 195 * 1024);
  await file('media/photos/a-960-phone-45.webp', 90 * 1024);
  await file('media/photos/b-960.webp', 300 * 1024);
  await file('media/photos/b-960-phone-70.webp', 160 * 1024);
  await writeFile(join(root, 'src/data/phone-heroes.json'), JSON.stringify({ crops: {
    '/media/photos/a-960.webp': { '0.70': { src: '/media/photos/a-960-phone-70.webp' }, '0.45': { src: '/media/photos/a-960-phone-45.webp' } },
    '/media/photos/b-960.webp': { '0.70': { src: '/media/photos/b-960-phone-70.webp' } },
  } }));
  const problems = await imageBudgetProblems(root, identity('/logo-header.webp'));
  assert.deepEqual(problems.map((problem) => [problem.route, problem.issue]), [['/media/photos/a-960-phone-70.webp', 'phone_crop_heavy'], ['/media/photos/b-960-phone-70.webp', 'phone_crop_heavy']]);
  assert.match(problems[0].detail, /195 KB, its desktop file \/media\/photos\/a-960\.webp 103 KB/);
  const heavy = await imageBudgetProblems(root, identity('/logo.png'));
  assert.deepEqual(heavy[0], { route: '/logo.png', issue: 'header_logo_heavy', detail: `175 KB, at most ${HEADER_LOGO_MAX_BYTES / 1024} KB (scripts/fit-header-logo.mjs makes it)` });
  // No identity, no phone crops: nothing to weigh.
  assert.deepEqual(await imageBudgetProblems(await mkdtemp(join(tmpdir(), 'image-budgets-empty-')), null), []);
});
