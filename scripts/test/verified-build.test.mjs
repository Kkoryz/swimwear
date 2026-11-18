import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { recordVerifiedBuild, verificationProblems, verificationState, verifiedNow } from '../lib/verified-build.mjs';
import { VERIFICATION_CHECKS } from '../lib/preflight/verification-checks.mjs';
import { publishPreview, rewriteForBase } from '../publish-preview.mjs';
import { runChecks } from '../preflight.mjs';

const json = (root, path, value) => mkdir(join(root, path, '..'), { recursive: true }).then(() => writeFile(join(root, path), JSON.stringify(value)));
async function site({ layout = [], review = 'passed', shots = 'b1', board = 'passed' } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'verified-'));
  await mkdir(join(root, 'src/data'), { recursive: true });
  await writeFile(join(root, 'src/data/page.json'), '{"copy":"one"}');
  await mkdir(join(root, 'dist/about'), { recursive: true });
  await writeFile(join(root, 'dist/index.html'), '<html><head><meta name="robots" content="index"></head><body><a href="/about/">A</a><img src="/media/a.webp" srcset="/media/a-480.webp 480w, /media/a-960.webp 960w"></body></html>');
  await writeFile(join(root, 'dist/about/index.html'), '<html><head></head><body class="x">About</body></html>');
  await json(root, 'docs/research/authoring-layout-audit.json', { failures: layout });
  await json(root, 'docs/research/navigation-shell-audit.json', { failures: [] });
  await json(root, 'docs/research/design-review.json', { shots, status: review, findings: [] });
  await json(root, 'docs/research/design-review/manifest.json', { id: 'b1', pages: [{ route: '/' }] });
  await json(root, 'docs/research/style-board-review.json', { status: board });
  return root;
}

test('a build is verified only with its audits passed and the review of its current shots passed', async () => {
  assert.deepEqual(verificationProblems(await verificationState(await site())), []);
  assert.deepEqual(verificationProblems(await verificationState(await site({ layout: [{ issue: 'x' }] }))).map((problem) => problem.code), ['layout_audit_not_passed']);
  assert.deepEqual(verificationProblems(await verificationState(await site({ shots: 'old' }))).map((problem) => problem.code), ['design_review_not_current']);
  assert.deepEqual(verificationProblems(await verificationState(await site({ review: 'open', board: 'open' }))).map((problem) => problem.code), ['design_review_not_current', 'design_review_not_current']);
  await assert.rejects(recordVerifiedBuild(await site({ review: 'stale' }), ['/']), /not a verified build: the page design review is stale/);
});

test('the preflight holds a build never verified, one changed since, and lists the pages only audited', async () => {
  const root = await site();
  assert.deepEqual((await verifiedNow(root)).problems.map((problem) => problem.code), ['verified_build_missing']);
  const record = await recordVerifiedBuild(root, ['/', '/about/']);
  assert.deepEqual([record.reviewed, record.auditedOnly], [['/'], ['/about/']]);
  const now = await verifiedNow(root);
  assert.equal(now.current, true);
  const gate = runChecks({ verification: now }, VERIFICATION_CHECKS);
  assert.deepEqual([gate.holds, gate.notices.map((notice) => notice.code)], [[], ['pages_audited_only']]);
  await writeFile(join(root, 'src/data/page.json'), '{"copy":"two"}');
  const changed = runChecks({ verification: await verifiedNow(root) }, VERIFICATION_CHECKS);
  assert.deepEqual(changed.holds.map((hold) => hold.code), ['verified_build_mismatch']);
});

test('a preview needs the audits passed; an open design review puts its findings in the log, not the pages; unaudited only when marked so', async () => {
  // Audits failing: refused, unless marked unreviewed (the red banner).
  const failing = await site({ layout: [{ issue: 'low_contrast' }] });
  await assert.rejects(publishPreview({ root: failing, out: join(failing, 'out'), base: '/motelpilot' }), /not publishing a build whose audits have not passed[\s\S]*layout_audit_not_passed/);
  const unreviewed = await publishPreview({ root: failing, out: join(failing, 'out'), base: '/motelpilot', unreviewed: true });
  assert.deepEqual([unreviewed.verified, unreviewed.audited], [false, false]);
  assert.match(await readFile(join(failing, 'out/about/index.html'), 'utf8'), /<body class="x"><div data-preview-banner/);
  // Audits passed, the design review open (owner 2026-11-14: a preview needs the audits only; 2026-11-18: no banner):
  // published clean, its open findings in the preview log.
  const reviewing = await site({ review: 'open' });
  await json(reviewing, 'docs/research/design-review.json', { shots: 'b1', status: 'open', findings: [{ severity: 'P1', route: '/about-us/', viewport: 'desktop', block: 'hero', issue: 'overlay too wide' }, { severity: 'P2', route: '/', block: 'cta', issue: 'small' }] });
  const audited = await publishPreview({ root: reviewing, out: join(reviewing, 'out'), base: '/motelpilot' });
  assert.deepEqual([audited.verified, audited.audited, audited.openFindings, audited.findings], [false, true, 1, ['P1 /about-us/ desktop hero: overlay too wide']]);
  assert.ok(!(await readFile(join(reviewing, 'out/index.html'), 'utf8')).includes('data-preview-banner'));
  assert.deepEqual(JSON.parse(await readFile(join(reviewing, 'docs/research/preview-log.json'), 'utf8')).entries.at(-1).findings, ['P1 /about-us/ desktop hero: overlay too wide']);
  const root = await site();
  const out = join(root, 'out');
  await recordVerifiedBuild(root, ['/', '/about/']);
  await mkdir(join(out, '.git'), { recursive: true });
  const verified = await publishPreview({ root, out, base: '/motelpilot' });
  assert.equal(verified.verified, true);
  const home = await readFile(join(out, 'index.html'), 'utf8');
  assert.ok(!home.includes('data-preview-banner'));
  assert.match(home, /href="\/motelpilot\/about\/"/);
  assert.match(home, /srcset="\/motelpilot\/media\/a-480.webp 480w, \/motelpilot\/media\/a-960.webp 960w"/);
  assert.match(home, /<meta name="robots" content="noindex, nofollow">/);
  assert.ok(existsSync(join(out, '.git')), 'the preview repository is kept');
  const log = JSON.parse(await readFile(join(root, 'docs/research/preview-log.json'), 'utf8'));
  assert.deepEqual(log.entries.map((entry) => entry.verified), [true]);
  assert.equal(rewriteForBase('a{background:url(/media/x.png)}', '.css', '/p'), 'a{background:url(/p/media/x.png)}');
});
