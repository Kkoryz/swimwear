import assert from 'node:assert/strict';
import test from 'node:test';

import { importSiteFactory } from '../import-site-factory.mjs';
import { homeCategoryGroups, homeCategoryProblems, homeCategoryTargets, placeHomeCategories } from '../lib/home-categories.mjs';
import { isIndexable } from '../lib/seo-head.mjs';

// site13 blind audit M8: the home body linked no category page. Products and Solutions are menu headings there
// (site.json navOnly): their children are the categories.
const nav = { header: [
  { label: 'Products', route: null, children: [{ label: "Women's Swimwear", route: '/women/', children: [{ label: 'Bikinis', route: '/bikini/', children: [] }] }, { label: "Men's Swimwear", route: '/men/', children: [] }] },
  { label: 'Solutions', route: '/solutions/', children: [{ label: 'Printing', route: '/printing/', children: [] }, { label: 'Launch', route: '/launch/', children: [] }] },
  { label: 'About Us', route: '/about/', children: [] },
] };
const types = { '/solutions/': 'solutions_hub', '/women/': 'product_manufacturer', '/about/': 'about' };
const linkable = (route) => route !== '/launch/';

test('the categories are the hubs\' children, a built hub with them; a menu heading and a held page are not linked', () => {
  const groups = homeCategoryGroups(nav, (route) => types[route], linkable);
  assert.deepEqual(groups.map((group) => [group.label, group.route, group.links.map((link) => link.href)]), [['Products', null, ['/women/', '/men/']], ['Solutions', '/solutions/', ['/printing/']]]);
  assert.deepEqual(homeCategoryTargets(groups), ['/women/', '/men/', '/solutions/', '/printing/']);
});

test('the home page gets a category module when its own links miss one, before its related pages; none when they reach all', () => {
  const groups = homeCategoryGroups(nav, (route) => types[route], linkable);
  const blocks = [{ id: 'intro', type: 'intro', paragraphs: ['We sew [women\'s swimwear](/women/).'] }, { id: 'related', type: 'relatedPages', links: [{ label: 'Blog', href: '/blog/' }] }, { id: 'cta', type: 'cta' }];
  const added = placeHomeCategories(blocks, { groups });
  assert.deepEqual(blocks.map((block) => block.id), ['intro', 'categories', 'related', 'cta']);
  assert.equal(added.heading, 'Products and Solutions');
  assert.deepEqual(added.links.map((link) => link.href), ['/women/', '/men/', '/solutions/', '/printing/']);
  const all = [{ id: 'grid', type: 'featureGrid', items: ['/women/', '/men/', '/solutions/', '/printing/'].map((href) => ({ href })) }];
  assert.equal(placeHomeCategories(all, { groups }), null);
  assert.equal(all.length, 1);
});

test('the SEO audit fails a home page whose body misses a category; the header menu does not count', () => {
  const page = (route, pageType, status = 'authored') => ({ route, pageType, status });
  const pages = [page('/', 'home'), page('/women/', 'product_manufacturer'), page('/men/', 'product_manufacturer'), page('/solutions/', 'solutions_hub'), page('/printing/', 'solution'), page('/launch/', 'solution', 'hold'), page('/about/', 'about')];
  const menu = '<header><a href="/women/">W</a><a href="/men/">M</a><a href="/solutions/">S</a><a href="/printing/">P</a></header>';
  const built = (main) => new Map([...pages.map((item) => [item.route, '<html></html>']), ['/', `<html><body>${menu}<main>${main}</main></body></html>`]]);
  const [problem] = homeCategoryProblems(pages, built('<a href="/women/">W</a>'), nav, isIndexable);
  assert.equal(problem.issue, 'home_categories_unlinked');
  assert.match(problem.detail, /\/men\/ \/solutions\/ \/printing\/$/);
  assert.deepEqual(homeCategoryProblems(pages, built('<a href="/women/">W</a><a class="card" href="/men/">M</a><a href="/solutions/">S</a><a href="/printing/">P</a>'), nav, isIndexable), []);
});

test('the importer adds the module to an authored home page whose copy links no category', () => {
  const section = (id, body) => ({ section_id: id, heading: `Heading ${id}`, body, fact_ids: [] });
  const source = (pageId, url) => ({ page_id: pageId, url, title: `${pageId} title for the page`, meta_description: 'A description.', h1: pageId, sections: [section('s1', 'Intro words about the factory and what it makes for brands.'), section('s2', 'More words.')], links: [], cta: { target_url: '/contact/', label: 'Request a Quote' }, structured_data: [], release_status: 'ready_for_template', hold_reasons: [] });
  const pagesPlan = {
    pages: [
      { page_id: 'home', page_type: 'home', label: 'Home', url: '/' },
      { page_id: 'products', page_type: 'products_hub', label: 'Products', url: '/products/', nav_only: true },
      { page_id: 'women', page_type: 'product_manufacturer', label: "Women's Swimwear", url: '/women/', parent_page_id: 'products' },
      { page_id: 'men', page_type: 'product_manufacturer', label: "Men's Swimwear", url: '/men/', parent_page_id: 'products' },
      { page_id: 'contact', page_type: 'contact', label: 'Contact', url: '/contact/' },
    ],
    header_nav: [{ label: 'Products', page_id: 'products', children: [{ label: "Women's Swimwear", page_id: 'women', children: [] }, { label: "Men's Swimwear", page_id: 'men', children: [] }] }, { label: 'Contact', page_id: 'contact', children: [] }],
    footer_nav: [],
  };
  const { pages, report } = importSiteFactory({ authoringPackage: { schema_version: 'sf/authoring/v1', project: 't', pages: [source('home', '/'), source('women', '/women/'), source('men', '/men/')] }, pagesPlan });
  const home = pages.find((page) => page.route === '/');
  const module = home.blocks.find((block) => block.id === 'categories');
  assert.ok(module, home.blocks.map((block) => block.id).join(' '));
  assert.deepEqual([module.type, module.heading, module.links.map((link) => link.href)], ['relatedPages', 'Products', ['/women/', '/men/']]);
  assert.ok(report.pages.find((item) => item.route === '/').mapping.some((entry) => entry.sectionId === 'site.categories'));
  assert.equal(pages.find((page) => page.route === '/women/').blocks.some((block) => block.id === 'categories'), false, 'the home page only');
});
