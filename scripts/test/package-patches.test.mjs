import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { freezeSiteFactory } from '../freeze-site-factory.mjs';
import { patchProject, readPackagePatches } from '../lib/package-patches.mjs';

// Strandmill swim_1117d_fix4 (owner 2026-11-18): the toddler and teen pages merged into the children's page.
const link = (page_id, url, role) => ({ page_id, url, anchor: page_id, role });
const project = () => ({
  authoringPackage: {
    schema_version: 'sf/authoring/v1',
    pages: [
      { page_id: 'kids', url: '/kids/', breadcrumb: [{ page_id: 'home', url: '/' }, { page_id: 'kids', url: '/kids/' }],
        structural_links: [link('home', '/', 'parent'), link('teen', '/teen/', 'child'), link('baby', '/baby/', 'child')],
        links: [{ link_id: 'teen', url: '/teen/', anchor_text: 'teen' }, { link_id: 'baby', url: '/baby/', anchor_text: 'baby' }],
        sections: [
          { section_id: 'm4', kind: 'customization', presentation: 'list', heading: 'Sizes', body: 'See our [teen range](/teen/#sizes) and [baby range](/baby/).' },
          { section_id: 'm4~2', continuation_of: 'm4', kind: 'customization', presentation: 'list', heading: '', body: 'More sizes.' },
          { section_id: 'm5', kind: 'customization', presentation: 'cards', heading: 'Prints', body: '' },
          { section_id: 'faq', kind: 'faq', presentation: 'qa', heading: 'FAQ', qa: [{ question: 'Sizes?', answer: 'Infant to 14.' }] },
        ],
        structured_data: [{ '@type': 'FAQPage', mainEntity: [{ '@type': 'Question', name: 'Sizes?', acceptedAnswer: { '@type': 'Answer', text: 'Infant to 14.' } }] }] },
      { page_id: 'baby', url: '/baby/', structural_links: [link('kids', '/kids/', 'parent'), link('teen', '/teen/', 'sibling')], sections: [] },
      { page_id: 'teen', url: '/teen/', structural_links: [link('kids', '/kids/', 'parent')], sections: [] },
    ],
    visual_density: { pages: { kids: { words: 900 }, teen: { words: 1500 } } },
  },
  tree: { pages: [{ id: 'home', type: 'home', parent: null }, { id: 'kids', type: 'product', parent: 'home' }, { id: 'baby', type: 'product', parent: 'kids' }, { id: 'teen', type: 'product', parent: 'kids' }, { id: 'swim', type: 'product', parent: 'home', also_parents: ['teen'] }] },
  sitePlan: {
    routes: { home: { url: '/' }, kids: { url: '/kids/' }, baby: { url: '/baby/' }, teen: { url: '/teen/' }, swim: { url: '/swim/' } },
    home_product_navigation: [{ id: 'kids', url: '/kids/', children: [{ id: 'baby', url: '/baby/', children: [] }, { id: 'teen', url: '/teen/', children: [] }] }],
    link_plan: { children: { kids: [{ id: 'baby', url: '/baby/' }, { id: 'teen', url: '/teen/' }] } },
  },
});
const merge = {
  name: '01-merge.json',
  removePages: [{ page_id: 'teen', url: '/teen/', merged_into: 'kids' }],
  insertSections: [{ page_id: 'kids', after: 'm4', sections: [{ section_id: 'm4_3', kind: 'customization', presentation: 'list', heading: 'Teen sizes', body: '', items: [], visuals: [{ id: 'teen_photo', type: 'photo' }] }] }],
  addQuestions: [{ page_id: 'kids', section: 'faq', qa: [{ question: 'Teen [fits](/kids/)?', answer: 'Yes, on a teen block.' }] }],
};

test('a page merged away leaves the package, the tree and the site plan, with every entry and link that points at it', () => {
  const given = project();
  const { authoringPackage, tree, sitePlan, applied } = patchProject(given, [merge]);
  assert.deepEqual(authoringPackage.pages.map((page) => page.page_id), ['kids', 'baby']);
  const kids = authoringPackage.pages[0];
  assert.deepEqual(kids.structural_links.map((item) => item.page_id), ['home', 'baby']);
  assert.deepEqual(kids.links.map((item) => item.link_id), ['baby']);
  assert.equal(kids.sections[0].body, 'See our teen range and [baby range](/baby/).', 'a link in copy is left as its words');
  assert.deepEqual(authoringPackage.pages[1].structural_links.map((item) => item.page_id), ['kids']);
  assert.deepEqual(Object.keys(authoringPackage.visual_density.pages), ['kids']);
  assert.deepEqual(tree.pages.map((page) => page.id), ['home', 'kids', 'baby', 'swim']);
  assert.deepEqual(tree.pages.find((page) => page.id === 'swim').also_parents, []);
  assert.deepEqual(Object.keys(sitePlan.routes), ['home', 'kids', 'baby', 'swim']);
  assert.deepEqual(sitePlan.home_product_navigation[0].children.map((item) => item.id), ['baby']);
  assert.deepEqual(sitePlan.link_plan.children.kids.map((item) => item.id), ['baby']);
  assert.doesNotMatch(JSON.stringify([authoringPackage, tree, sitePlan]), /\/teen\/|"teen"/);
  assert.deepEqual(applied[0].removed, [{ page_id: 'teen', url: '/teen/', merged_into: 'kids', inPackage: true, inTree: true }]);
  // What was given is not changed.
  assert.deepEqual(given, project());
});

test('sections go in after the named section and its continuations, and questions join the FAQ and its FAQPage, once', () => {
  const { authoringPackage, applied } = patchProject(project(), [merge]);
  const kids = authoringPackage.pages[0];
  assert.deepEqual(kids.sections.map((section) => section.section_id), ['m4', 'm4~2', 'm4_3', 'm5', 'faq']);
  assert.deepEqual(kids.sections[2].visuals, [{ id: 'teen_photo', type: 'photo' }], 'its photo candidates go with it');
  assert.deepEqual(kids.sections[4].qa.map((item) => item.question), ['Sizes?', 'Teen [fits](/kids/)?']);
  assert.deepEqual(kids.structured_data[0].mainEntity.at(-1), { '@type': 'Question', name: 'Teen fits?', acceptedAnswer: { '@type': 'Answer', text: 'Yes, on a teen block.' } });
  assert.deepEqual(applied[0].inserted, [{ page_id: 'kids', section_id: 'm4_3', after: 'm4~2' }]);
  // A package that has them already (Site Factory sent them in a later one) keeps its own: nothing is added twice.
  const again = patchProject({ ...project(), authoringPackage }, [merge]);
  assert.deepEqual(again.authoringPackage.pages[0].sections.map((section) => section.section_id), ['m4', 'm4~2', 'm4_3', 'm5', 'faq']);
  assert.equal(again.authoringPackage.pages[0].structured_data[0].mainEntity.length, 2);
  assert.deepEqual(again.applied[0].already, ['kids m4_3', 'kids faq: Teen [fits](/kids/)?']);
});

test('a patch that cannot apply stops: a page left under a removed one, a section or page not there', () => {
  assert.throws(() => patchProject(project(), [{ name: 'p.json', removePages: [{ page_id: 'kids' }] }]), /baby, teen sits under a page the patch removes/);
  assert.throws(() => patchProject(project(), [{ name: 'p.json', insertSections: [{ page_id: 'kids', after: 'm9', sections: [] }] }]), /kids has no section m9/);
  assert.throws(() => patchProject(project(), [{ name: 'p.json', removePages: [{ page_id: 'teen' }], addQuestions: [{ page_id: 'teen', section: 'faq', qa: [] }] }]), /adds questions to teen, which the package does not have/);
  assert.throws(() => patchProject(project(), [{ name: 'p.json', removePages: [{ page_id: 'baby', url: '/teen/' }] }]), /\/teen\/ is teen in the package, not baby/);
});

test('a site\'s patches are frozen into a snapshot of their own: the package, tree and plan patched, what they did recorded', async () => {
  const root = await mkdtemp(join(tmpdir(), 'package-patches-'));
  const sf = join(root, 'sf');
  for (const dir of ['artifacts/07_1_draft', 'artifacts/04_1_site_tree', 'artifacts/06_1_plan']) await mkdir(join(sf, dir), { recursive: true });
  const given = project();
  await writeFile(join(sf, 'artifacts/07_1_draft/authoring_package.json'), JSON.stringify(given.authoringPackage));
  await writeFile(join(sf, 'artifacts/04_1_site_tree/tree.json'), JSON.stringify({ pages: [...given.tree.pages.slice(0, 4), { id: 'site:contact', type: 'general', parent: 'home' }] }));
  await writeFile(join(sf, 'artifacts/06_1_plan/site_plan.json'), JSON.stringify({ ...given.sitePlan, routes: { ...given.sitePlan.routes, swim: undefined, 'site:contact': { url: '/contact/' } } }));
  await writeFile(join(sf, 'facts.yaml'), 'facts: []\n');
  const site = join(root, 'site');
  assert.deepEqual(await readPackagePatches(site), []);
  await mkdir(join(site, 'content/package-patches'), { recursive: true });
  const { name, ...patch } = merge;
  await writeFile(join(site, 'content/package-patches', name), JSON.stringify(patch));
  const patches = await readPackagePatches(site);
  assert.deepEqual(patches.map((item) => item.name), [name]);
  const out = join(root, 'freeze');
  const plain = await freezeSiteFactory({ project: sf, out });
  const patched = await freezeSiteFactory({ project: sf, out, patches });
  assert.notEqual(patched.folder, plain.folder);
  assert.equal(await readFile(join(plain.folder, 'authoring_package.json'), 'utf8'), JSON.stringify(given.authoringPackage), 'no patch: copied byte for byte');
  assert.equal((await readdir(plain.folder)).includes('package-patches.json'), false);
  const read = async (file) => JSON.parse(await readFile(join(patched.folder, file), 'utf8'));
  assert.deepEqual((await read('pages.json')).pages.map((page) => page.page_id), ['home', 'kids', 'baby', 'site:contact']);
  assert.deepEqual((await read('authoring_package.json')).pages.map((page) => page.page_id), ['kids', 'baby']);
  assert.deepEqual((await read('tree.json')).pages.map((page) => page.id), ['home', 'kids', 'baby', 'site:contact']);
  assert.equal((await read('site_plan.json')).routes.teen, undefined);
  assert.deepEqual((await read('package-patches.json')).map((item) => [item.patch, item.removed.length, item.inserted.length, item.questions.length]), [[name, 1, 1, 1]]);
  assert.deepEqual(await freezeSiteFactory({ project: sf, out, patches }), { folder: patched.folder, version: patched.version, existed: true });
});
