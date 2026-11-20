import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import { prelaunch } from '../prelaunch.mjs';
import { cannibalFindings } from '../lib/prelaunch/cannibal.mjs';
import { blogCannibalMode, prelaunchModes } from '../lib/prelaunch/config.mjs';
import { conflictFindings, contentKey, sfConflictFindings, SOURCE_PATH, SOURCE_SCHEMA } from '../lib/prelaunch/conflicts.mjs';
import { externalProblem, linkFindings } from '../lib/prelaunch/links.mjs';
import { nearFindings, paragraphsOf } from '../lib/prelaunch/near.mjs';
import { ownerListRows, signoffCategory } from '../lib/prelaunch/owner-list.mjs';
import { htmlFindings } from '../lib/prelaunch/html.mjs';
import { formFindings, launchFindings, phoneFindings, structuredDataFindings } from '../lib/prelaunch/tech.mjs';
import { mainText } from '../lib/content-fingerprint.mjs';
import { RELEASE_CHECKS } from '../lib/preflight/release-checks.mjs';
import { runChecks } from '../preflight.mjs';
import { steps } from '../site-run.mjs';

const page = (route, extra = {}) => ({ route, pageType: 'solution', status: 'authored', seo: { title: route, description: route, canonical: route }, hero: { heading: route }, blocks: [], ...extra });
const html = ({ main = '', header = '', footer = '', head = '' } = {}) => `<html lang="en"><head>${head}</head><body><header data-site-header>${header}</header><main>${main}</main><footer data-site-footer>${footer}</footer></body></html>`;

test('switches: each check off, report (the default) or block; the owner list never blocks; the conflict check reports by default', () => {
  assert.deepEqual(prelaunchModes({}).modes, { links: 'report', cannibal: 'report', near: 'report', owner_list: 'report', tech: 'report', html: 'report', conflicts: 'report' });
  const { modes, notes } = prelaunchModes({ prelaunch: { links: 'block', cannibal: false, near: true, owner_list: 'block', conflicts: 'report' } });
  assert.deepEqual(modes, { links: 'block', cannibal: 'off', near: 'report', owner_list: 'report', tech: 'report', html: 'report', conflicts: 'report' });
  assert.match(notes.join(), /owner_list: "block" is read as "report"/);
  assert.throws(() => prelaunchModes({ prelaunch: { link: true } }), /unknown check/);
  assert.throws(() => prelaunchModes({ prelaunch: { links: 'hold' } }), /not a mode/);
  assert.equal(blogCannibalMode({}), 'block', 'the publish gate blocks by default');
  assert.equal(blogCannibalMode({ blogPublish: { cannibal: false } }), 'off');
  assert.equal(blogCannibalMode({ blogPublish: { cannibal: 'report' } }), 'report');
});

test('links: dead, nav_only and held-back targets, placeholder pages, orphans by content links, link-out forms', () => {
  const pages = [page('/'), page('/a/'), page('/b/'), page('/orphan/'), page('/privacy/', { pageType: 'privacy' }), page('/soon/', { status: 'placeholder' })];
  const built = new Map([
    ['/', html({ header: '<a href="/orphan/">Menu</a><a href="/services/">Services</a>', main: '<nav class="breadcrumbs"><a href="/b/">B</a></nav><p><a href="/a/">A</a> <a href="/gone/">x</a> <a href="/held/">h</a> <a href="/soon/">s</a> <a href="http://shop.oldsite.org/">old</a> <a href="https://partner.com/" target="_blank">p</a> <a href="mailto:info@site.com">mail</a> <a href="tel:12">t</a> <a href="#top">top</a> <a href="/media/a.pdf">pdf</a></p>', footer: '<a href="/privacy/">Privacy</a>' })],
    ['/a/', html({ main: '<p><a href="/b/?x=1#y">B</a> <a href="/">Home</a></p>' })],
    ['/b/', html({ main: '<p>B</p>' })],
    ['/orphan/', html({ main: '<p>O</p>' })],
    ['/privacy/', html({ main: '<p>P</p>' })],
    ['/soon/', html({ main: '<p>S</p>' })],
  ]);
  const files = new Set(['/', '/a/', '/b/', '/orphan/', '/privacy/', '/soon/', '/media/a.pdf']);
  const findings = linkFindings({ pages, built, distHas: (route) => files.has(route), navOnly: new Set(['/services/']), unbuilt: new Map([['/held/', 'Held, owner_held_back']]) });
  const by = (kind) => findings.filter((finding) => finding.kind === kind).map((finding) => [finding.level, finding.problem ?? null, finding.target]);
  assert.deepEqual(by('dead'), [['issue', null, '/gone/']]);
  assert.deepEqual(by('nav_only'), [['issue', null, '/services/']]);
  assert.deepEqual(by('unbuilt'), [['issue', null, '/held/']]);
  assert.deepEqual(by('placeholder'), [['info', null, '/soon/']]);
  assert.deepEqual(by('external'), [['issue', 'http', 'http://shop.oldsite.org/'], ['info', 'blank_without_noopener', 'https://partner.com/'], ['issue', 'tel', 'tel:12']]);
  // The menus and the breadcrumb do not count: /orphan/ (header only) is an orphan, /b/ is linked from /a/'s content;
  // the privacy page only the footer links is information.
  assert.deepEqual(by('orphan'), [['issue', null, '/orphan/'], ['info', null, '/privacy/']]);
  assert.equal(externalProblem('https://ok.com/a b').problem, 'space');
  assert.equal(externalProblem('javascript:void(0)').problem, 'javascript');
  assert.equal(externalProblem('#').problem, 'empty');
  assert.equal(externalProblem('https://example.com/').problem, 'host');
});

test('cannibalisation: two primaries once, a primary that is another page\'s secondary, never a page\'s own', () => {
  const findings = cannibalFindings([
    { route: '/a/', role: 'primary', query: 'airbnb co host service' },
    { route: '/a/', role: 'secondary', query: 'airbnb management company' },
    { route: '/b/', role: 'primary', query: 'Airbnb Co-Host Services' },
    { route: '/c/', role: 'primary', query: 'airbnb management companies' },
    { route: '/c/', role: 'secondary', query: 'airbnb management companies' },
    { route: '/blog/x/', role: 'primary', query: 'vacation rental fees' },
  ]);
  assert.deepEqual(findings.map((finding) => [finding.kind, finding.route, finding.other.route]), [['primary_primary', '/a/', '/b/'], ['primary_secondary', '/c/', '/a/']]);
});

test('near-duplicates: pages of one type compared by text and by paragraph; template lines left out', () => {
  const words = (seed, count) => Array.from({ length: count }, (_, index) => `${seed}${index}`).join(' ');
  const shared = words('shared', 40);
  const pages = [page('/a/'), page('/b/'), page('/c/'), page('/d/', { pageType: 'place' })];
  const body = (own) => html({ main: `<p>${shared}</p><p>${own}</p><p class="container page-updated">Reviewed by someone on the team · Last updated 17 November 2026 for this page</p><aside><p>${words('bio', 15)}</p></aside><ul><li><a href="/x/">${words('title', 14)}</a></li></ul>` });
  const built = new Map([['/a/', body(words('a', 20))], ['/b/', body(words('b', 20))], ['/c/', html({ main: `<p>${words('c', 60)}</p><p>${shared.split(' ').slice(0, 30).join(' ')} and more words of its own here</p>` })], ['/d/', body(words('d', 20))]]);
  assert.equal(paragraphsOf(built.get('/a/')).length, 2, 'the reviewed-by line, the author card and a link card are no copy');
  const findings = nearFindings(pages, built, mainText);
  assert.deepEqual([findings[0].level, findings[0].route, findings[0].other], ['issue', '/a/', '/b/']);
  assert.deepEqual(findings.slice(1).map((finding) => [finding.level, finding.route, finding.other]).sort(), [['info', '/a/', '/c/'], ['info', '/b/', '/c/']], 'a pair under the page limit whose paragraphs repeat');
  assert.equal(findings[0].paragraphs[0].similarity, 1);
  assert.ok(!findings.some((finding) => [finding.route, finding.other].includes('/d/')), 'another page type is not compared');
});

test('the owner list: every stand-in as a row, to be supplied, by category; confirmed items say so', () => {
  assert.equal(signoffCategory({ id: 'sf-OT-replace-1', description: 'facts.yaml: our team runs listings, pricing and reviews' }), 'facts');
  assert.equal(signoffCategory({ id: 'sf-OT-supply-2', description: 'contact.phone:' }), 'phone');
  assert.equal(signoffCategory({ id: 'placeholder-testimonials', description: 'Replace the borrowed testimonials' }), 'reviews');
  assert.equal(signoffCategory({ id: 'sf-OT-confirm-3', description: '硬信息总表里的事实（价格、资质）' }), 'figures');
  const rows = ownerListRows({
    signoff: { items: [{ id: 'company-address', description: 'Replace the stand-in company address', status: 'pending' }, { id: 'placeholder-testimonials', description: 'Replace the testimonials', status: 'confirmed' }] },
    contact: { phone: '+1 617 235 0462', placeholder: true, standIns: ['phone'] },
    proof: { standIn: true, factory: [{ value: '110', label: 'clients served' }], certifications: [{ name: 'Licence', issuer: 'City' }] },
    posts: [{ slug: 'p', status: 'published', placeholders: [{ id: 'R1', kind: 'number', needed: 'the fee' }] }],
    imagePlan: { entries: [{ kind: 'hero', status: 'generated' }] },
  });
  assert.deepEqual(rows.map((row) => [row.label, row.status]), [['电话', '待业主提供'], ['地址', '待业主提供'], ['评价', '已确认'], ['证书', '待业主提供'], ['占位数字', '待业主提供'], ['占位数字', '待业主提供'], ['占位图', '待业主提供']]);
});

test('the owner list asks to confirm a certificate is held and current, never for its number (owner 2026-11-19)', () => {
  const certs = (certifications) => ownerListRows({ proof: { certifications } }).filter((row) => row.category === 'certificates');
  const [asked] = certs([{ name: 'GRS', issuer: 'Control Union', scope: 'Recycled fabrics', validUntil: '2027-03' }]);
  assert.equal(asked.item, 'GRS：确认确实持有且在有效期内（发证机构、范围、有效期）');
  assert.equal(asked.value, '发证机构 Control Union；范围 Recycled fabrics；有效期至 2027-03');
  assert.ok(!/编号/.test(asked.item + asked.label));
  assert.deepEqual(certs([{ name: 'GRS', confirmed: true }]), []);                      // confirmed: off the list
  assert.deepEqual(certs([{ name: 'GRS', number: 'CU-1' }]), []);                        // given with its number, as before
  assert.equal(certs([{ name: 'OEKO-TEX Standard 100' }])[0].value, '');                 // nothing given yet: still asked
});

test('technical: structured data parses and has its required fields; the form posts to the endpoint; phone LCP', () => {
  const pages = [page('/'), page('/contact/'), page('/soon/', { status: 'placeholder' })];
  const built = new Map([
    ['/', html({ main: '<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization"}</script><script type="application/ld+json">{broken</script>' })],
    ['/contact/', html({ main: '<form data-lead-form data-form-status="ready" method="post" action="/api/leads"></form><form data-form-status="ready" method="get" action="/other"></form>' })],
    ['/soon/', html({ main: '<script type="application/ld+json">{"@context":"https://schema.org","@type":"Service","name":"[Placeholder]","provider":{"@type":"Organization","name":"X"}}</script>' })],
  ]);
  const structured = structuredDataFindings(pages, built);
  assert.ok(structured.some((finding) => finding.problem === 'json_ld_invalid' && finding.route === '/'));
  assert.ok(!structured.some((finding) => finding.route === '/soon/' && finding.problem === 'json_ld_placeholder'), 'a placeholder on a noindex page is not reported');
  const form = { endpoint: '/api/leads', status: 'ready' };
  const forms = formFindings(pages, built, form, 'location /api/ {');
  assert.deepEqual(forms.map((finding) => [finding.level, finding.problem]), [['issue', 'action_not_endpoint'], ['issue', 'not_post'], ['info', 'post_untested']]);
  assert.deepEqual(formFindings(pages, built, { ...form, status: 'not-connected' }, null).map((finding) => [finding.problem, finding.level]).slice(-2), [['not_connected', 'issue'], ['server_config_missing', 'info']], 'the release step writes the server config: missing before it is information');
  assert.equal(formFindings(pages, built, form, null, { launch: true }).at(-1).level, 'issue');
  const phone = phoneFindings({ results: [{ route: '/', viewport: 'mobile', lcp: { ms: 4200, element: 'img' } }, { route: '/', viewport: 'desktop', lcp: { ms: 9000 } }, { route: '/b/', viewport: 'mobile', lcp: { ms: 2000 } }] });
  assert.deepEqual(phone.map((finding) => [finding.level, finding.problem]), [['issue', 'lcp_slow'], ['info', 'lcp_good'], ['info', 'cls_not_measured']]);
  assert.equal(phoneFindings(null)[0].problem, 'not_measured');
  // The claude-seo audit's phone measurements give the CLS.
  const shifts = phoneFindings(null, { dir: 'docs/research/seo-audit-3', render: [{ route: '/', viewport: 'mobile', cls: 0.3 }, { route: '/b/', viewport: 'mobile', cls: 0.05 }, { route: '/', viewport: 'desktop', cls: 0.9 }] });
  assert.deepEqual(shifts.slice(1).map((finding) => [finding.level, finding.problem, finding.route]), [['issue', 'cls_poor', '/'], ['info', 'cls_good', '/b/']]);
});

test('the launch switch: noindex, robots.txt and the sitemap on a build for launch', () => {
  const pages = [page('/'), page('/a/'), page('/soon/', { status: 'placeholder' })];
  const built = new Map([['/', html({ head: '<meta name="robots" content="noindex, nofollow">' })], ['/a/', html()], ['/soon/', html({ head: '<meta name="robots" content="noindex, follow">' })]]);
  const identity = { origin: 'https://site.com' };
  const files = new Set(['/', '/a/', '/soon/']);
  const preview = launchFindings(pages, built, identity, { robots: 'User-agent: *\nDisallow: /\n', sitemap: null, headers: 'add_header X-Robots-Tag "noindex" always;', distHas: (route) => files.has(route) });
  assert.deepEqual(preview.map((finding) => [finding.problem, finding.route ?? null]), [['indexable_noindex', '/'], ['server_noindex', null], ['robots_disallow_all', null], ['robots_no_sitemap', null], ['sitemap_missing', null]]);
  const live = launchFindings([page('/'), page('/a/')], new Map([['/', html()], ['/a/', html()]]), identity, { robots: 'User-agent: Googlebot\nAllow: /\n\nUser-agent: *\nAllow: /\n\nSitemap: https://site.com/sitemap.xml\n', sitemap: '<urlset><url><loc>https://site.com/</loc></url><url><loc>https://site.com/a/</loc></url></urlset>', headers: '', distHas: (route) => files.has(route) });
  assert.deepEqual(live, []);
});

test('conflicts: Site Factory\'s result of this content stands; none, or one of other content, needs a run on this machine', async () => {
  const root = await mkdtemp(join(tmpdir(), 'prelaunch-conflicts-'));
  await mkdir(join(root, 'src/data'), { recursive: true });
  await writeFile(join(root, 'src/data/authoring-pages.json'), JSON.stringify([{ id: 'home', route: '/' }]));
  const none = await conflictFindings({ root, env: {} });
  assert.deepEqual([none.status, none.findings[0].kind], ['needs_local', 'needs_local']);
  assert.match((await conflictFindings({ root, env: { GITHUB_ACTIONS: 'true' } })).notes[0], /GitHub Actions/);
  await mkdir(join(root, 'docs/research/prelaunch'), { recursive: true });
  const findings = [{ level: 'issue', kind: 'page', route: '/', detail: 'x' }];
  await writeFile(join(root, SOURCE_PATH), JSON.stringify({ schemaVersion: SOURCE_SCHEMA, checkedAt: 't', results: 'out', content: await contentKey(root), findings }));
  assert.deepEqual((await conflictFindings({ root, env: { GITHUB_ACTIONS: 'true' } })).findings, findings, 'a result of this machine for this content stands in GitHub Actions too');
  // The same data written another way (a checkout's line endings, indentation) is the same content.
  await writeFile(join(root, 'src/data/authoring-pages.json'), '[\r\n  { "id": "home", "route": "/" }\r\n]\r\n');
  assert.equal((await conflictFindings({ root, env: {} })).status, undefined);
  await writeFile(join(root, 'src/data/authoring-pages.json'), JSON.stringify([{ id: 'home', route: '/', seo: { title: 'changed' } }]));
  assert.match((await conflictFindings({ root, env: {} })).findings[0].detail, /changed since it ran/);
  // Site Factory's results: the library's own contradictions, and each sentence that contradicts a row, by route.
  const sf = sfConflictFindings({ library: { confirmed: [[{ id: 'F1', topic: 'fees', text: 'A' }, { id: 'F2', topic: 'fees', text: 'B' }]] }, pages: [{ sentence: 'S', docs: ['home'], label: 'conflicts:F3', row: { id: 'F3', text: 'T', condition: 'C' } }, { sentence: 'ok', docs: ['home'], label: 'consistent' }], blogs: [{ sentence: 'P', docs: ['fees-guide'], label: 'conflicts:F4', row: { id: 'F4', text: 'U' } }] }, new Map([['home', '/']]));
  assert.deepEqual(sf.map((finding) => [finding.kind, finding.route ?? null]), [['library', null], ['page', '/'], ['blog', '/blog/fees-guide/']]);
  assert.match(sf[1].detail, /"S" contradicts F3: T \(C\)/);
});

const site = async (files) => {
  const root = await mkdtemp(join(tmpdir(), 'prelaunch-'));
  for (const [path, content] of Object.entries(files)) { await mkdir(dirname(join(root, path)), { recursive: true }); await writeFile(join(root, path), typeof content === 'string' ? content : JSON.stringify(content)); }
  return root;
};

test('the run: a report per check and a summary; a "block" check with issues blocks, the preflight holds on it', async () => {
  const files = {
    'src/data/authoring-pages.json': [{ ...page('/'), id: 'home', blocks: [] }, { ...page('/a/'), id: 'a', blocks: [] }],
    'dist/index.html': html({ main: '<p><a href="/a/">A</a> <a href="/gone/">x</a></p>' }),
    'dist/a/index.html': html({ main: '<p>A</p>' }),
    'inputs/freeze/s/pages.json': { pages: [{ page_id: 'home', url: '/', primary_query: 'airbnb management' }, { page_id: 'a', url: '/a/', primary_query: 'Airbnb Managements' }, { page_id: 'hub', url: '/services/', nav_only: true }] },
    'inputs/freeze/s/keywords.json': { pages: [] },
    'site.json': { siteFactory: 'inputs/freeze/s' },
  };
  const root = await site(files);
  await assert.rejects(site({ 'site.json': {} }).then((empty) => prelaunch({ root: empty, env: {} })), /no page of the site is built/, 'nothing built is not a pass');
  const summary = await prelaunch({ root, env: {}, now: new Date('2026-11-18T00:00:00Z') });
  assert.equal(summary.status, 'reported', 'report by default');
  assert.deepEqual(summary.checks.map((check) => [check.check, check.status]), [['links', 'reported'], ['cannibal', 'reported'], ['near', 'passed'], ['owner_list', 'passed'], ['tech', 'passed'], ['html', 'reported'], ['conflicts', 'needs_local']], 'the conflict check never run on this machine is not a pass');
  const links = JSON.parse(await readFile(join(root, 'docs/research/prelaunch/links.json'), 'utf8'));
  assert.deepEqual(links.findings.map((finding) => finding.target), ['/gone/']);
  assert.match(await readFile(join(root, 'docs/research/prelaunch/summary.md'), 'utf8'), /\| 链接验收 \| 只报告 \| 有问题（只报告） \| 1 \|/);
  assert.match(await readFile(join(root, 'docs/research/prelaunch/cannibal.md'), 'utf8'), /primary_primary/);
  assert.deepEqual(runChecks({ prelaunch: summary }, RELEASE_CHECKS.filter((check) => check.code === 'prelaunch_blocked')).holds, []);
  await writeFile(join(root, 'site.json'), JSON.stringify({ siteFactory: 'inputs/freeze/s', prelaunch: { cannibal: 'block', links: false } }));
  const blocked = await prelaunch({ root, env: {} });
  assert.deepEqual([blocked.status, blocked.checks[0].status, blocked.checks[1].status], ['blocked', 'off', 'blocked']);
  assert.deepEqual(runChecks({ prelaunch: blocked }, RELEASE_CHECKS.filter((check) => check.code === 'prelaunch_blocked')).holds.map((hold) => hold.items), [['cannibal: 1 issue(s), docs/research/prelaunch/cannibal.md']]);
  // A build for launch is checked for noindex, robots.txt and the sitemap; one that is not, is not.
  assert.equal(JSON.parse(await readFile(join(root, 'docs/research/prelaunch/tech.json'), 'utf8')).findings.some((finding) => finding.kind === 'launch'), false);
  const launch = await prelaunch({ root, env: { SITE_LAUNCH: '1' } });
  assert.equal(launch.launch, true);
  assert.ok(JSON.parse(await readFile(join(root, 'docs/research/prelaunch/tech.json'), 'utf8')).findings.some((finding) => finding.problem === 'robots_missing'));
});

test('site-run checks before the design review and again on the release build, before the preflight', () => {
  const list = steps({ reference: { origin: 'https://example.com', pages: { home: '/' } }, siteFactory: 'snap', identity: 'brand', line: 'activewear', port: 4999 });
  const ids = list.map((step) => step.id);
  assert.equal(ids[ids.indexOf('audits') + 1], 'prelaunch');
  const release = list.find((step) => step.id === 'release').run.map((command) => command.join(' '));
  assert.ok(release.findIndex((command) => command.includes('prelaunch.mjs')) === release.findIndex((command) => command.includes('preflight.mjs')) - 1);
});

test('html: the built pages through html-validate (standard + document), require-sri off; errors are issues (site audit 2026-11-19)', async () => {
  const doc = (body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>T</title><link rel="stylesheet" href="/_astro/a.css"></head><body>${body}</body></html>`;
  const pages = [page('/'), page('/fixed/'), page('/unbuilt/')];
  const built = new Map([
    ['/', doc('<main><h1>T</h1><div class="chart-shares" aria-label="Shares"><span>Direct 60%</span></div><p id="x">a</p><p id="x">b</p></main>')],
    ['/fixed/', doc('<main><h1>T</h1><div class="chart-shares" role="group" aria-label="Shares"><span>Direct 60%</span></div></main>')],
    ['/unbuilt/', null],
  ]);
  const findings = await htmlFindings(pages, built);
  assert.deepEqual(findings.filter((finding) => finding.level === 'issue').map((finding) => [finding.route, finding.problem]).sort(), [['/', 'aria-label-misuse'], ['/', 'no-dup-id']]);
  assert.ok(findings.every((finding) => finding.kind === 'html' && finding.problem !== 'require-sri'), 'same-origin stylesheets need no SRI');
  assert.match(findings.find((finding) => finding.problem === 'aria-label-misuse').detail, /line 1/);
});
