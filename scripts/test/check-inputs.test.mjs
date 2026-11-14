import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { inputProblems } from '../check-inputs.mjs';

const SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), '../check-inputs.mjs');

const put = async (path, value) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, typeof value === 'string' ? value : JSON.stringify(value, null, 2));
};

const FACTS = '- fact_id: f1\n  text: "We run 12 motels."\n  verification_status: verified\n  approved_public: true\n';
const PACKAGE = { schema_version: 'sf/authoring/v1', project: 'demo', pages: [{ page_id: 'home', url: '/', release_status: 'ready_for_template', sections: [] }] };
const PLAN = {
  pages: [
    { page_id: 'home', page_type: 'home', label: 'Home', url: '/', parent_page_id: null },
    { page_id: 'site:contact', page_type: 'contact', label: 'Contact', url: '/contact/', parent_page_id: 'home' },
  ],
  header_nav: [{ label: 'Contact', page_id: 'site:contact', children: [] }],
  footer_nav: [],
};

// A site that passes every check: a frozen snapshot, an identity with project.yaml, the trade's config files.
async function goodSite({ trade = 'service' } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'check-inputs-'));
  await put(join(root, 'sf/authoring_package.json'), PACKAGE);
  await put(join(root, 'sf/pages.json'), PLAN);
  await put(join(root, 'sf/facts.yaml'), FACTS);
  await put(join(root, 'identity/project.yaml'), 'site_name: Demo Motels\nweb_domain: demo-motels.com\n');
  for (const name of ['wording', 'image-briefs', 'demo-proof', 'blueprint-wording']) {
    const file = trade === 'apparel' ? `${name}.json` : `${name}.${trade}.json`;
    await put(join(root, 'config', file), name === 'wording' ? { relatedHeading: 'Related', caseHeading: 'Cases', caseLink: 'Read' } : {});
  }
  const site = { reference: { origin: 'https://www.example.com', pages: { home: '/', about: '/about/', contact: '/contact/', product_manufacturer: '/made/' } }, siteFactory: 'sf', identity: 'identity', line: 'motel', trade, port: 4343, images: 'generate' };
  await put(join(root, 'site.json'), site);
  return { root, site };
}

const checks = (problems) => problems.map((problem) => problem.check);

test('a complete site has no input problems', async () => {
  const { root, site } = await goodSite();
  assert.deepEqual(await inputProblems({ root, site }), []);
});

test('rm r1/r2 and motel run1: a page type the capture folder cannot be named for, and a project.yaml without web_domain', async () => {
  const { root, site } = await goodSite();
  site.reference.pages.blog_hub = '/press';
  site.reference.pages.elsewhere = 'https://other.example.org/x/';
  await put(join(root, 'identity/project.yaml'), 'site_name: Demo Motels\n');
  const problems = await inputProblems({ root, site });
  assert.ok(problems.some((problem) => problem.check === 'reference-pages' && problem.detail.includes('expected <type>=/path/, got: blog_hub=/press')), JSON.stringify(problems));
  assert.ok(problems.some((problem) => problem.check === 'reference-pages' && problem.detail.includes('elsewhere')));
  assert.ok(problems.some((problem) => problem.check === 'identity' && problem.detail.includes('project.yaml needs site_name and web_domain')));
});

test('site-run steps() configuration: images, port, line, the freeze folder, the trade files', async () => {
  const { root, site } = await goodSite();
  Object.assign(site, { images: 'reference', port: undefined, line: '', siteFactoryProject: 'nowhere', trade: 'spa' });
  const found = checks(await inputProblems({ root, site }));
  for (const check of ['images', 'port', 'line', 'site-factory', 'trade-config']) assert.ok(found.includes(check), `${check} in ${found}`);
});

test('a snapshot without its package, plan or facts is reported, and nothing else is guessed from it', async () => {
  const { root, site } = await goodSite();
  site.siteFactory = 'missing-snapshot';
  const problems = await inputProblems({ root, site });
  const detail = problems.filter((problem) => problem.check === 'site-factory').map((problem) => problem.detail).join('\n');
  for (const name of ['authoring_package.json', 'pages.json', 'facts.yaml']) assert.match(detail, new RegExp(name.replace('.', '\\.')));
});

test('the site plan: a contact page, menus on planned pages, a route for every page the package builds', async () => {
  const { root, site } = await goodSite();
  await put(join(root, 'sf/pages.json'), { pages: [PLAN.pages[0]], header_nav: [{ label: 'Gone', page_id: 'gone', children: [] }], footer_nav: [] });
  await put(join(root, 'sf/authoring_package.json'), { ...PACKAGE, pages: [...PACKAGE.pages, { page_id: 'svc', url: '/svc/', release_status: 'ready_for_template', sections: [] }, { page_id: 'old', url: '/old/', release_status: 'draft', sections: [] }] });
  const problems = await inputProblems({ root, site });
  assert.ok(problems.some((problem) => problem.check === 'contact-page'));
  assert.ok(problems.some((problem) => problem.check === 'navigation' && problem.detail.includes('gone')));
  const routes = problems.filter((problem) => problem.check === 'package-routes');
  assert.deepEqual(routes.map((problem) => problem.detail), ['svc: url /svc/ is not in the site plan']);
});

test('the package: its schema, two pages on one route, a list item citing a fact the facts do not have', async () => {
  const { root, site } = await goodSite();
  await put(join(root, 'sf/authoring_package.json'), { schema_version: 'sf/authoring/v0', pages: [] });
  assert.ok(checks(await inputProblems({ root, site })).includes('package'));
  const cites = { page_id: 'home', url: '/', release_status: 'ready_for_template', sections: [{ section_id: 's1', heading: 'H', body: 'b', items: [{ text: 'x', fact_ids: ['f9'] }] }] };
  await put(join(root, 'sf/authoring_package.json'), { ...PACKAGE, pages: [cites, { ...cites, page_id: 'home2' }] });
  const problems = await inputProblems({ root, site });
  assert.ok(problems.some((problem) => problem.check === 'package' && problem.detail.includes('two pages with url /')));
  assert.ok(problems.some((problem) => problem.check === 'facts' && problem.detail.includes('unknown fact f9')));
});

test('a handoff beside the package is checked as the import step checks it', async () => {
  const { root, site } = await goodSite();
  await put(join(root, 'sf/handoff.json'), { schema_version: 'sf/handoff/v0' });
  const problems = await inputProblems({ root, site });
  assert.deepEqual(problems, [{ check: 'handoff', detail: 'handoff.json schema_version is sf/handoff/v0, not sf/handoff/v1' }]);
});

test('motel full-run6: a Site Factory project whose tree has a page its site plan gives no route', async () => {
  const { root, site } = await goodSite();
  const project = join(root, 'project/package');
  await put(join(project, 'artifacts/07_1_draft/authoring_package.json'), PACKAGE);
  await put(join(project, 'facts.yaml'), FACTS);
  await put(join(project, 'artifacts/04_1_site_tree/tree.json'), { pages: [{ id: 'home', type: 'home', name: 'Home', parent: null }, { id: 'site:contact', type: 'general', name: 'Contact', parent: 'home' }, { id: 'c-c48d984954c3:service', type: 'service', name: 'Service', parent: 'home' }] });
  await put(join(project, 'artifacts/06_1_plan/site_plan.json'), { routes: { home: { url: '/' }, 'site:contact': { url: '/contact/' } } });
  Object.assign(site, { siteFactoryProject: 'project/package', siteFactoryFreeze: 'freeze', siteFactory: 'stale-or-absent' });
  const problems = await inputProblems({ root, site });
  assert.deepEqual(problems, [{ check: 'site-plan', detail: 'site plan has no route for c-c48d984954c3:service' }]);
});

test('a project without the tree or its routes is reported as freeze reports it', async () => {
  const { root, site } = await goodSite();
  Object.assign(site, { siteFactoryProject: 'empty-project', siteFactoryFreeze: 'freeze' });
  const problems = await inputProblems({ root, site });
  assert.equal(problems.length, 1);
  assert.equal(problems[0].check, 'site-factory');
  assert.match(problems[0].detail, /lacks artifacts\/07_1_draft\/authoring_package\.json/);
});

test('a supplied brand kit that lacks what the importer needs, and site photos the media import refuses', async () => {
  const { root, site } = await goodSite();
  await put(join(root, 'identity/brand/logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="60"></svg>');
  await put(join(root, 'identity/media/media.json'), { schema_version: 'sf/media/v1', photos: [{ file: 'a.jpg', kind: 'drone', alt: 'A motel from above' }, { file: 'b.jpg', kind: 'hero', alt: '' }] });
  const problems = await inputProblems({ root, site });
  assert.ok(problems.some((problem) => problem.check === 'brand-kit' && problem.detail.includes('schemaLogo')), JSON.stringify(problems));
  const media = problems.filter((problem) => problem.check === 'site-media').map((problem) => problem.detail).join('\n');
  assert.match(media, /unknown photo kind drone/);
  assert.match(media, /alt text is required/);
  assert.match(media, /a\.jpg.*missing|missing.*a\.jpg/);
});

test('the command line: one line per problem and exit 1, or one OK line', async () => {
  const { root } = await goodSite();
  const ok = spawnSync(process.execPath, [SCRIPT, root], { encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout.trim(), /^check-inputs: OK/);
  await put(join(root, 'identity/project.yaml'), 'site_name: Demo\n');
  const bad = spawnSync(process.execPath, [SCRIPT, root], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /identity: .*project\.yaml needs site_name and web_domain/);
});

test('a site whose template is not where template-core.json says runs its own old copy: reported', async () => {
  const { root, site } = await goodSite();
  // A site made by hand or by the template itself has no manifest: nothing to check.
  assert.deepEqual(checks(await inputProblems({ root, site })), []);
  // site-run.mjs adds the core step only where the manifest's source holds scripts/sync-template-core.mjs; without it
  // the whole run used the site's last copy of the template and said nothing.
  await put(join(root, 'template-core.json'), { schemaVersion: 'seo-site-template-core-v1', source: '../gone-template', commit: 'abc123', files: {} });
  const problems = await inputProblems({ root, site });
  assert.deepEqual(checks(problems), ['template-core']);
  assert.match(problems[0].detail, /gone-template.*abc123/);
  const template = join(root, 'template');
  await put(join(template, 'scripts/sync-template-core.mjs'), '');
  await put(join(root, 'template-core.json'), { schemaVersion: 'seo-site-template-core-v1', source: 'template', commit: 'abc123', files: {} });
  assert.deepEqual(checks(await inputProblems({ root, site })), []);
});
