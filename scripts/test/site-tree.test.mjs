import assert from 'node:assert/strict';
import test from 'node:test';

import { relatedPages, siteNavFromPlan } from '../lib/site-plan.mjs';
import { sitePlanFromTree } from '../lib/site-tree.mjs';

const tree = { pages: [
  { id: 'home', name: 'Swimwear', type: 'home', parent: null },
  { id: 'products', name: 'Products', type: 'hub', parent: 'home' },
  { id: 'women', name: 'Women Swimwear', type: 'product', parent: 'products' },
  { id: 'bikini', name: 'Bikini', type: 'product', parent: 'women' },
  { id: 'one-piece', name: 'One Piece', type: 'product', parent: 'women' },
  { id: 'men', name: 'Men Swimwear', type: 'product', parent: 'products' },
  { id: 'solutions', name: 'Solutions', type: 'hub', parent: 'home' },
  { id: 'printing', name: 'Custom Printing', type: 'service', parent: 'solutions' },
  { id: 'site:about', name: 'About Us', type: 'general', parent: 'home' },
  { id: 'site:contact', name: 'Contact Us', type: 'general', parent: 'home' },
  { id: 'site:faq', name: 'FAQ', type: 'general', parent: 'home' },
  { id: 'site:privacy', name: 'Privacy Policy', type: 'general', parent: 'home' },
  { id: 'site:blog', name: 'Blog', type: 'general', parent: 'home' },
] };
const url = (name) => `/${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}/`;
const routes = Object.fromEntries(tree.pages.map((page) => [page.id, { url: page.type === 'home' ? '/' : url(page.name), page_name: page.name }]));

test('the site tree and its routes make the whole site\'s plan: every page, its type, its parent and the menus', () => {
  const plan = sitePlanFromTree({ tree, sitePlan: { routes }, keywords: { pages: [{ id: 'bikini', primary: { query: 'bikini manufacturer' } }] } });
  assert.equal(plan.pages.length, tree.pages.length);
  assert.deepEqual(Object.fromEntries(plan.pages.map((page) => [page.page_id, page.page_type])), {
    home: 'home', products: 'products_hub', women: 'product_manufacturer', bikini: 'product_manufacturer', 'one-piece': 'product_manufacturer', men: 'product_manufacturer',
    solutions: 'solutions_hub', printing: 'solution', 'site:about': 'about', 'site:contact': 'contact', 'site:faq': 'general', 'site:privacy': 'privacy', 'site:blog': 'blog_hub',
  });
  assert.equal(plan.pages.find((page) => page.page_id === 'bikini').primary_query, 'bikini manufacturer');
  // The header follows the tree: the product tree under Products, the services under Solutions, then the general pages.
  const nav = siteNavFromPlan(plan);
  assert.deepEqual(nav.header.map((node) => node.route), ['/products/', '/solutions/', '/about-us/', '/blog/', '/contact-us/']);
  assert.deepEqual(nav.header[0].children.map((node) => [node.route, node.children.map((child) => child.route)]), [['/women-swimwear/', ['/bikini/', '/one-piece/']], ['/men-swimwear/', []]]);
  assert.deepEqual(nav.footer.map((node) => node.route), ['/faq/', '/privacy-policy/']);
  // Structural links come from the tree: a child's related pages are its parent, then its siblings.
  const bikini = plan.pages.find((page) => page.page_id === 'bikini');
  assert.deepEqual(relatedPages(bikini, plan).map((page) => page.url), ['/women-swimwear/', '/one-piece/']);
  const women = plan.pages.find((page) => page.page_id === 'women');
  assert.deepEqual(relatedPages(women, plan).map((page) => page.url), ['/products/', '/bikini/', '/one-piece/', '/men-swimwear/']);
});

test('a tree page without a route, or a route without a tree page, is refused', () => {
  const withoutFaq = Object.fromEntries(Object.entries(routes).filter(([id]) => id !== 'site:faq'));
  assert.throws(() => sitePlanFromTree({ tree, sitePlan: { routes: withoutFaq } }), /no route for site:faq/);
  assert.throws(() => sitePlanFromTree({ tree, sitePlan: { routes: { ...routes, ghost: { url: '/ghost/' } } } }), /does not have: ghost/);
  // A page the site plan does not build (unbuilt_pages: the owner held it back) needs no route and is in no menu.
  const held = sitePlanFromTree({ tree, sitePlan: { routes: withoutFaq, unbuilt_pages: [{ id: 'site:faq', page_name: 'FAQ', build_reason: 'owner_held_back' }] } });
  assert.ok(!held.pages.some((page) => page.page_id === 'site:faq'));
  assert.ok(!JSON.stringify([held.header_nav, held.footer_nav]).includes('site:faq'));
  assert.throws(() => sitePlanFromTree({ tree, sitePlan: { routes, unbuilt_pages: [{ id: 'solutions' }] } }), /printing sits under a page the site plan does not build/);
});

test('a built site is checked against its tree: missing pages, broken links, H1s, 07 meta, noindex, sitemap, menus, breadcrumbs, child links', async () => {
  const { treeChecks } = await import('../verify-site-tree.mjs');
  const { siteNavFromPlan } = await import('../lib/site-plan.mjs');
  const part = tree.pages.slice(0, 5);
  const plan = sitePlanFromTree({ tree: { pages: part }, sitePlan: { routes: Object.fromEntries(part.map((page) => [page.id, routes[page.id]])) } });
  const crumbs = (...items) => `<script type="application/ld+json">${JSON.stringify({ '@type': 'BreadcrumbList', itemListElement: items.map((item, index) => ({ position: index + 1, item: `https://x.test${item}` })) })}</script>`;
  const page = ({ title = 'T', description = 'D', robots = '', h1 = 1, links = [], crumb = '' }) => `<html><head><title>${title}</title><meta name="description" content="${description}">${robots ? `<meta name="robots" content="${robots}">` : ''}${crumb}</head><body><main>${'<h1>H</h1>'.repeat(h1)}${links.map((href) => `<a href="${href}">x</a>`).join('')}</main></body></html>`;
  const built = new Map([
    ['/', page({ title: 'Home | S', description: 'Home meta', links: ['/products/'] })],
    ['/products/', page({ robots: 'noindex', links: ['/women-swimwear/'], crumb: crumbs('/', '/products/') })],
    ['/women-swimwear/', page({ robots: 'noindex', links: ['/bikini/'], crumb: crumbs('/', '/products/', '/women-swimwear/') })],
    ['/bikini/', page({ title: 'Bikini | S', description: 'Bikini meta', links: ['/gone/'], h1: 2, crumb: crumbs('/', '/bikini/') })],
    ['/one-piece/', null],
  ]);
  const authored = { pages: [{ url: '/', title: 'Home | S', meta_description: 'Home meta', release_status: 'ready_for_template' }, { url: '/bikini/', title: 'Bikini | S', meta_description: 'Other meta', release_status: 'ready_for_template' }] };
  const sitemap = '<loc>https://x.test/</loc><loc>https://x.test/products/</loc>';
  const checks = treeChecks({ plan, authored, nav: siteNavFromPlan(plan), built, sitemap, exists: (href) => built.get(href) != null });
  const failures = Object.fromEntries(checks.map((check) => [check.check, check.failures]));
  assert.deepEqual(failures['every planned page is built'], ['/one-piece/']);
  assert.deepEqual(failures['no broken internal link'], ['/bikini/ -> /gone/']);
  assert.deepEqual(failures['one H1 a page'], ['/bikini/ (2)']);
  assert.deepEqual(failures['written and held pages carry 07\'s title and description'], ['/bikini/ description']);
  assert.deepEqual(failures['placeholders and held pages are noindex and out of the sitemap; written pages are in it'], ['/products/ in sitemap', '/bikini/ missing from sitemap']);
  assert.deepEqual(failures['the menus are the site tree\'s'], []);
  assert.deepEqual(failures['breadcrumbs follow the line of parents'], ['/bikini/: / > /bikini/ (tree: / > /products/ > /women-swimwear/ > /bikini/)']);
  assert.deepEqual(failures['a parent page links its children'], []);
});

test('Site Factory\'s structural links and breadcrumb are checked against the tree, which stays the source', async () => {
  const { structuralDisagreements } = await import('../verify-site-tree.mjs');
  const plan = sitePlanFromTree({ tree, sitePlan: { routes } });
  const byId = new Map(plan.pages.map((page) => [page.page_id, page]));
  const ancestors = (page) => { const line = []; for (let at = byId.get(page.parent_page_id); at && at.page_type !== 'home'; at = byId.get(at.parent_page_id)) line.unshift(at.url); return line; };
  const link = (role, url) => ({ role, url, page_id: 'x', anchor: 'x' });
  const agreeing = { page_id: 'bikini', breadcrumb: ['/', '/products/', '/women-swimwear/', '/bikini/'].map((url) => ({ url })), structural_links: [link('parent', '/women-swimwear/'), link('sibling', '/one-piece/')] };
  assert.deepEqual(structuralDisagreements(plan, [agreeing, { page_id: 'home', breadcrumb: [] }], ancestors), []);
  const wrong = { page_id: 'women', breadcrumb: [{ url: '/' }, { url: '/women-swimwear/' }], structural_links: [link('parent', '/products/'), link('child', '/bikini/')] };
  assert.deepEqual(structuralDisagreements(plan, [wrong], ancestors), [
    '/women-swimwear/ breadcrumb: / > /women-swimwear/ (tree: / > /products/ > /women-swimwear/)',
    '/women-swimwear/ child links: /bikini/ (tree: /bikini/, /one-piece/)',
    '/women-swimwear/ sibling links: none (tree: /men-swimwear/)',
  ]);
});

test('the placeholder blog posts lead to the contact page the site plan names', async () => {
  const { scaffoldBlog } = await import('../scaffold-blog.mjs');
  const { mkdtemp, mkdir, readFile, writeFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const root = await mkdtemp(join(tmpdir(), 'blog-'));
  await mkdir(join(root, 'src/data'), { recursive: true });
  await writeFile(join(root, 'src/data/placeholder-pages.json'), JSON.stringify([{ route: '/contact-us/', pageType: 'contact' }]));
  await scaffoldBlog({ root, count: 2 });
  const posts = JSON.parse(await readFile(join(root, 'src/data/blog-posts.json'), 'utf8'));
  assert.deepEqual(posts.map((post) => post.cta.href), ['/contact-us/', '/contact-us/']);
});

test("a page type the authoring package declares (a legal page: page_type privacy) is the page's type in the plan; one the template does not know fails", () => {
  const plan = sitePlanFromTree({ tree, sitePlan: { routes }, pageTypes: new Map([['site:faq', 'privacy']]) });
  assert.equal(plan.pages.find((page) => page.page_id === 'site:faq').page_type, 'privacy');
  assert.equal(plan.pages.find((page) => page.page_id === 'site:about').page_type, 'about', 'a page that declares none keeps the tree\'s');
  assert.throws(() => sitePlanFromTree({ tree, sitePlan: { routes }, pageTypes: new Map([['site:faq', 'legal']]) }), /site:faq declares page type legal, which the template does not have/);
});
