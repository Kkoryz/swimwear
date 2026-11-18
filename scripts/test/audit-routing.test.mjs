import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { checkSiteData } from '../check-site-data.mjs';
import { byOwner, checklistGroupOf, ownerOf } from '../lib/issue-owners.mjs';
import { checklistMarkdown } from '../lib/launch-checklist.mjs';
import { formLandingProblems, pageProblems } from '../lib/seo-audit.mjs';
import { smallTargets, TARGET_MIN } from '../lib/visual-checks.mjs';
import { renderWebp, WEB_IMAGE_MAX_BYTES } from '../lib/web-image.mjs';
import { siteFactoryIssues } from '../sf-report.mjs';
import { steps } from '../site-run.mjs';

// The four-site audit 2026-11-17: each new check names who clears it, and the launch checklist and Site Factory's
// report route by it; the data checks run right after the import (Fable's plan V-5).

test('every new check has its owner: the template, Site Factory or the owner', () => {
  for (const issue of ['nav_links_noindex', 'image_weight', 'lcp_fetchpriority_missing', 'control_without_name', 'lastmod_uniform', 'unreferenced_assets', 'form_slot_missing']) assert.equal(ownerOf(issue), 'template', issue);
  for (const issue of ['description_templated', 'trust_value_malformed', 'promise_without_asset', 'inbound_links_low', 'thin_vs_siblings', 'stand_in_lexicon']) assert.equal(ownerOf(issue), 'site-factory', issue);
  assert.equal(ownerOf('nap_mismatch'), 'owner');
  assert.equal(ownerOf('tap_target'), 'site-css');
  assert.deepEqual(['nap_mismatch', 'thin_vs_siblings', 'tap_target', 'image_weight'].map(checklistGroupOf), ['owner', 'site-factory', 'template', 'template']);
  assert.match(byOwner(['nap_mismatch']).join(), /the site's owner/);
});

test('the launch checklist routes the SEO audit\'s failures to their owner\'s group and lists its warnings as notices', () => {
  const gate = { status: 'blocked', checkedAt: 'now', holds: [{ code: 'seo_audit_failed', detail: 'SEO audit failed with 3 issue(s)' }], notices: [] };
  const seo = {
    failures: [{ route: '/resources/', issue: 'promise_without_asset', detail: 'the resources page with no file link' }, { route: '/', issue: 'nap_mismatch', detail: 'phone' }, { route: '/launch/', issue: 'nav_links_noindex', detail: 'header' }],
    warnings: [{ route: '/c/', issue: 'inbound_links_low', detail: '2 pages' }, { route: '/d/', issue: 'inbound_links_low', detail: '1 page' }],
  };
  const text = checklistMarkdown(gate, { seo });
  assert.match(text, /## 站长（你来提供或确认）（1）\n\n- \[ \] 页面上的电话、邮箱、地址或服务地区/);
  assert.match(text, /## Site Factory（内容和规划）（1）\n\n- \[ \] 文案承诺可下载的指南.*（SEO 审计 promise_without_asset，1 处：\/resources\/）/);
  assert.match(text, /## 模板流程（我来处理）（2）/);
  assert.match(text, /## 提示（不拦截上线）（1）\n\n- Site Factory（内容和规划）：可收录页面.*inbound_links_low，2 处：\/c\/、\/d\/）/);
});

test("Site Factory's report takes the SEO audit's findings of the copy, failures and warnings alike", () => {
  const issues = siteFactoryIssues({ seo: { failures: [{ route: '/x/', issue: 'trust_value_malformed', detail: '"65 that"' }, { route: '/y/', issue: 'image_weight', detail: '400 KB' }], warnings: [{ route: '/z/', issue: 'thin_vs_siblings', detail: '700 words' }] } });
  assert.deepEqual(issues.map((issue) => [issue.source, issue.route, issue.kind]), [['seo-audit', '/x/', 'trust_value_malformed'], ['seo-audit', '/z/', 'thin_vs_siblings']]);
});

test('the data checks run right after the import, before any photo or model call; a failure stops the run with its owner', async () => {
  const site = { reference: { origin: 'https://example.com', pages: { home: '/' } }, siteFactory: 'snap', identity: 'brand', line: 'activewear', port: 4999 };
  const list = steps(site);
  const ids = list.map((step) => step.id);
  assert.equal(ids.indexOf('data-checks'), ids.indexOf('import') + 1);
  for (const later of ['site-media', 'feasibility', 'style-board', 'images', 'page-figures', 'build']) assert.ok(ids.indexOf('data-checks') < ids.indexOf(later), later);
  const step = list.find((item) => item.id === 'data-checks');
  assert.deepEqual(step.run, [['node', 'scripts/check-site-data.mjs', '.']]);
  assert.ok(step.inputs.includes('src/data/authoring-pages.json') && step.inputs.includes('src/data/site-trust.json'));
  const root = await mkdtemp(join(tmpdir(), 'data-checks-'));
  try {
    await mkdir(join(root, 'src/data'), { recursive: true });
    const page = (route, id) => ({ id, route, pageType: 'general', status: 'authored', seo: { title: 'T', description: 'D', canonical: route }, hero: { heading: 'H' }, blocks: [] });
    await writeFile(join(root, 'src/data/authoring-pages.json'), JSON.stringify([page('/resources/', 'site:resources_guides')]));
    await writeFile(join(root, 'src/data/site-trust.json'), JSON.stringify({ items: [{ value: '65 that', label: 'Sampling team' }] }));
    const report = await checkSiteData({ root });
    assert.deepEqual(report.errors.map((item) => [item.issue, item.owner]), [['trust_value_malformed', 'site-factory'], ['promise_without_asset', 'site-factory']]);
    assert.ok(existsSync(join(root, 'docs/research/data-checks.json')));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('a control under 24px fails unless spaced apart, as WCAG 2.5.8 allows', () => {
  assert.equal(TARGET_MIN, 24);
  // Footer links 23px high, one under the other with no gap: their 24px circles meet.
  const tight = [{ block: 'footer', text: 'FAQ', width: 60, height: 23, x: 0, y: 0 }, { block: 'footer', text: 'Blog', width: 60, height: 23, x: 0, y: 23 }];
  assert.deepEqual(smallTargets(tight).map((target) => target.text), ['FAQ']);
  // The same links 30px apart, a lone 20px logo: spaced apart.
  const spaced = [{ block: 'footer', text: 'FAQ', width: 60, height: 23, x: 0, y: 0 }, { block: 'footer', text: 'Blog', width: 60, height: 23, x: 0, y: 53 }, { block: 'header', text: 'Logo', width: 190, height: 20, x: 0, y: 200 }, { block: 'header', text: 'Menu', width: 44, height: 44, x: 300, y: 190 }];
  assert.deepEqual(smallTargets(spaced), []);
  // A small target beside a full-size one, within 12px of its centre.
  assert.deepEqual(smallTargets([{ block: 'hero', text: 'x', width: 16, height: 16, x: 0, y: 0 }, { block: 'hero', text: 'Get a quote', width: 160, height: 48, x: 18, y: 0 }]).map((target) => target.text), ['x']);
});

test('the layout audit fails a small target on phones (no longer a warning)', async () => {
  const source = await readFile(new URL('../audit-authoring-layout.mjs', import.meta.url), 'utf8');
  assert.match(source, /smallTargets\(result\.visual\.targets\)\) failures\.push\(\{ \.\.\.at, issue: "tap_target"/);
});

test('a published photo is encoded within the image budget: a quality step lower, then a little narrower', async () => {
  const { default: sharp } = await import('sharp');
  const root = await mkdtemp(join(tmpdir(), 'webp-'));
  try {
    const noise = Buffer.alloc(1600 * 1000 * 3);
    for (let n = 0; n < noise.length; n += 1) noise[n] = (n * 2654435761) % 251;
    const source = join(root, 'master.png');
    await sharp(noise, { raw: { width: 1600, height: 1000, channels: 3 } }).png().toFile(source);
    // Noise no quality step brings within: the file comes out narrower, within the budget all the same (site12
    // claude-seo audit 2026-11-17, I-1: 1536-wide photos of 400-525 KB).
    const info = await renderWebp(sharp, source, 1536, join(root, 'a-1536.webp'));
    assert.ok(info.size <= WEB_IMAGE_MAX_BYTES, `${info.size} bytes at ${info.width}px`);
    assert.ok(info.width < 1536);
    assert.equal((await stat(join(root, 'a-1536.webp'))).size, info.size);
    const narrowed = await renderWebp(sharp, source, 1536, join(root, 'b-1536.webp'), { keepWidth: true });
    assert.ok(narrowed.size <= WEB_IMAGE_MAX_BYTES && narrowed.width < 1536, 'in place too, the budget before the width');
    // A photo a quality step brings within keeps the width the page names.
    const smooth = join(root, 'smooth.png');
    await sharp({ create: { width: 1600, height: 1000, channels: 3, background: { r: 200, g: 160, b: 120 } } }).png().toFile(smooth);
    const kept = await renderWebp(sharp, smooth, 1536, join(root, 'c-1536.webp'), { keepWidth: true });
    assert.equal(kept.width, 1536, 'a file re-rendered in place keeps its width');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('the SEO audit fails a control without a name and lands a quote button only on an enquiry form', () => {
  const page = { route: '/a/', status: 'authored', pageType: 'general', hero: { heading: 'A' }, seo: { title: 'T', description: 'D', canonical: '/a/' }, jsonLd: [] };
  const html = '<html lang="en"><head><title>T</title><meta name="description" content="D"><link rel="canonical" href="/a/"></head><body><main><h1>A</h1><a href="/b/"><img src="/b.webp" alt=""></a></main></body></html>';
  assert.ok(pageProblems({ html, page, identity: null, nav: { header: [], footer: [] } }).some((problem) => problem.issue === 'control_without_name' && problem.level === undefined));
  const pages = [{ ...page, id: 'site:inquiry', route: '/request-a-quote/' }];
  assert.deepEqual(formLandingProblems(pages, new Map([['/request-a-quote/', '<main><form class="form-block__form" data-request="resource"></form></main>']])).map((problem) => problem.issue), ['cta_target_without_form']);
  assert.deepEqual(formLandingProblems(pages, new Map([['/request-a-quote/', '<main><form class="form-block__form" data-request="resource"></form><form class="form-block__form"></form></main>']])), []);
});
