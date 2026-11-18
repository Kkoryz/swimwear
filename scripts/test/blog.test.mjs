import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { blogPages, heldHubRoutes, inlineParts, validatePost } from '../lib/blog.mjs';
import { blogGates } from '../lib/blog-gates.mjs';
import { pageSchemas } from '../lib/seo-head.mjs';
import { publishQueued } from '../blog-publish.mjs';
import { draftArticle, nextQuestion } from '../blog-draft.mjs';

const post = (extra = {}) => ({
  slug: 'moq-for-custom-sportswear',
  status: 'published',
  seo: { title: 'MOQ for custom sportswear: what small brands can order', description: 'How minimum order quantities work for custom sportswear, per style and colour, and how a small brand can start with samples.' },
  title: 'What MOQ can a small sportswear brand start with?',
  lead: ['Most factories set the minimum per style and colour; ours is 50 pieces, and [samples](/solutions/samples/) come first.'],
  datePublished: '2026-09-01T09:00:00Z',
  dateModified: '2026-09-01T09:00:00Z',
  author: { type: 'Organization' },
  sections: [
    { heading: 'How is MOQ counted?', paragraphs: ['Per style and colour: see our [leggings manufacturing](/leggings-manufacturer/) page.'] },
    { heading: 'Can I mix sizes?', paragraphs: ['Yes, sizes can be mixed within a colour, as on the [wholesale leggings](/wholesale-leggings/) page.'] },
  ],
  review: { by: 'Owner', at: '2026-09-01' },
  ...extra,
});
const page = (route, title = route) => ({ route, pageType: 'solution', status: 'authored', seo: { title, description: `${title} description`, canonical: route }, hero: { heading: title }, blocks: [] });
const sitePages = ['/', '/solutions/samples/', '/leggings-manufacturer/', '/wholesale-leggings/'].map((route) => page(route));
const facts = new Map([['moq', { text: 'Our minimum order quantity is 50 pieces per style per colour.', approved: true }]]);

test('inline links are split from the text', () => {
  assert.deepEqual(inlineParts('See [our page](/a/) now'), [{ text: 'See ' }, { text: 'our page', href: '/a/' }, { text: ' now' }]);
});

test('posts become a hub and article pages; the article carries BlogPosting and sits under the blog', () => {
  const pages = blogPages([post()], { heading: 'Insights', title: 'Insights', description: 'd' });
  assert.deepEqual(pages.map((item) => [item.route, item.pageType, item.status]), [['/blog/', 'blog_hub', 'authored'], ['/blog/moq-for-custom-sportswear/', 'blog_post', 'authored']]);
  const schemas = pageSchemas({ page: pages[1], identity: { origin: 'https://example.com', siteName: 'Ex', schemaLogo: { src: '/l.png' } }, nav: {}, builtRoutes: new Set(['/blog/']) });
  const posting = schemas.find((item) => item['@type'] === 'BlogPosting');
  assert.equal(posting.author['@id'], 'https://example.com/#organization');
  assert.deepEqual(schemas.find((item) => item['@type'] === 'BreadcrumbList').itemListElement.map((item) => item.name), ['Home', 'Insights', 'What MOQ can a small sportswear brand start with?']);
  assert.throws(() => blogPages([{ ...post(), slug: 'Bad Slug' }]), /slug/);
});

test('the hub pages after 12 posts, each page its own URL', () => {
  const posts = Array.from({ length: 13 }, (_, index) => post({ slug: `post-${index + 1}`, datePublished: `2026-08-${String(index + 1).padStart(2, '0')}T09:00:00Z`, dateModified: `2026-08-${String(index + 1).padStart(2, '0')}T09:00:00Z` }));
  const hubs = blogPages(posts, { heading: 'Blog' }).filter((item) => item.pageType === 'blog_hub');
  assert.deepEqual(hubs.map((item) => [item.route, item.seo.canonical, item.blocks[0].items.length]), [['/blog/', '/blog/', 12], ['/blog/page/2/', '/blog/page/2/', 1]]);
  assert.equal(hubs[0].blocks[0].items[0].href, '/blog/post-13/', 'newest first');
});

test("a hub with Site Factory's copy is a page before any post: its blocks whole; with posts, the posts come first and a featured one leads", () => {
  const own = [{ id: 'overview', type: 'text', heading: 'Guides', paragraphs: ['p'] }, { id: 'overview-2', type: 'text', paragraphs: ['q'], continues: 'overview' }, { id: 'cta', type: 'cta', heading: 'Ask us', paragraphs: [], cta: { label: 'Contact', href: '/contact/' }, links: [] }];
  const [empty] = blogPages([], { heading: 'Blog', blocks: own });
  assert.deepEqual([empty.route, empty.status, empty.blocks.map((block) => block.id)], ['/blog/', 'hold', ['overview', 'overview-2', 'cta']], 'no posts: no empty list, and held');
  const [hub] = blogPages([post()], { heading: 'Blog', blocks: own });
  assert.equal(hub.status, 'authored');
  assert.deepEqual(hub.blocks.map((block) => block.id), ['posts', 'overview', 'overview-2', 'cta'], 'the posts right under the heading');
  const featured = blogPages([post({ slug: 'newer', datePublished: '2026-10-02T09:00:00Z', dateModified: '2026-10-02T09:00:00Z' }), post({ slug: 'key', featured: true })], { heading: 'Blog' });
  assert.deepEqual(featured.find((item) => item.route === '/blog/').blocks.find((block) => block.type === 'postList').items.map((item) => item.href), ['/blog/key/', '/blog/newer/'], 'a featured post leads, newer or not');
  assert.deepEqual(blogPages([], { heading: 'Blog' }), [], 'a hub without copy waits for posts');
});

test('a hub with no published post is held (noindex, out of the sitemap and the menus) and comes back with its first one', async () => {
  const { isIndexable, sitemapXml } = await import('../lib/seo-head.mjs');
  const own = [{ id: 'overview', type: 'text', heading: 'Guides', paragraphs: ['p'] }];
  const hub = (pages) => pages.find((item) => item.route === '/blog/');
  const inReview = post({ slug: 'in-review', status: 'review' });
  // No post at all, or only posts in review (listed on a review build, never on a release build): held either way.
  assert.equal(hub(blogPages([], { heading: 'Blog', blocks: own })).status, 'hold');
  for (const release of [false, true]) assert.equal(hub(blogPages([inReview], { heading: 'Blog', blocks: own }, { release })).status, 'hold');
  const held = blogPages([inReview], { heading: 'Blog', blocks: own }, { release: true });
  assert.equal(isIndexable(hub(held)), false);
  assert.deepEqual([...heldHubRoutes(held)], ['/blog/'], 'out of the menus');
  assert.doesNotMatch(sitemapXml(held, { origin: 'https://x.test' }), /\/blog\//, 'out of the sitemap');
  // Template canaries stay placeholders; the first published post releases the hub.
  assert.equal(hub(blogPages([post({ status: 'placeholder' })], { heading: 'Blog' })).status, 'placeholder');
  const released = blogPages([inReview, post({ slug: 'published' })], { heading: 'Blog', blocks: own }, { release: true });
  assert.equal(hub(released).status, 'authored');
  assert.equal(heldHubRoutes(released).size, 0, 'back in the menus');
  assert.match(sitemapXml(released, { origin: 'https://x.test' }), /https:\/\/x\.test\/blog\/<\/loc>/);
});

test('the hub lists posts in review on every build but a release build, which lists only reviewed ones', async () => {
  const { isReleaseBuild } = await import('../lib/blog.mjs');
  const posts = [post({ slug: 'reviewed' }), post({ slug: 'in-review', status: 'review', datePublished: '2026-09-02T09:00:00Z', dateModified: '2026-09-02T09:00:00Z' })];
  const listed = (pages) => pages.find((item) => item.route === '/blog/').blocks.find((block) => block.type === 'postList').items.map((item) => item.href);
  assert.deepEqual(listed(blogPages(posts, { heading: 'Blog' }, { release: false })), ['/blog/in-review/', '/blog/reviewed/']);
  assert.deepEqual(listed(blogPages(posts, { heading: 'Blog' }, { release: true })), ['/blog/reviewed/']);
  // Either way the post in review is built, held (noindex, out of the sitemap): the launch preflight holds on it.
  for (const release of [false, true]) assert.equal(blogPages(posts, { heading: 'Blog' }, { release }).find((item) => item.route === '/blog/in-review/').status, 'hold');
  // Only review posts and no hub copy: a release build has no hub; any other build lists them.
  assert.deepEqual(blogPages([posts[1]], { heading: 'Blog' }, { release: true }).map((item) => item.pageType), ['blog_post']);
  assert.deepEqual(listed(blogPages([posts[1]], { heading: 'Blog' }, { release: false })), ['/blog/in-review/']);
  // The mode is SITE_RELEASE, as pnpm build:release sets it.
  assert.equal(isReleaseBuild({ SITE_RELEASE: '1' }), true);
  assert.equal(isReleaseBuild({}), false);
});

test('the site pages and the launch preflight read the blog the way their build has it', async () => {
  const { loadSitePages } = await import('../lib/site-pages.mjs');
  const root = await mkdtemp(join(tmpdir(), 'blog-release-'));
  await mkdir(join(root, 'src/data'), { recursive: true });
  await writeFile(join(root, 'src/data/blog-posts.json'), JSON.stringify([post({ slug: 'reviewed' }), post({ slug: 'in-review', status: 'review' })]));
  await writeFile(join(root, 'src/data/blog.json'), JSON.stringify({ heading: 'Blog' }));
  const hubLinks = async (options) => (await loadSitePages(root, { photoBriefs: false, ...options })).find((item) => item.route === '/blog/').blocks[0].items.map((item) => item.href).sort();
  assert.deepEqual(await hubLinks({ release: false }), ['/blog/in-review/', '/blog/reviewed/']);
  assert.deepEqual(await hubLinks({ release: true }), ['/blog/reviewed/']);
  const context = await readFile(new URL('../lib/preflight/context.mjs', import.meta.url), 'utf8');
  assert.match(context, /loadSitePages\(root, \{ release: true \}\)/, 'the preflight checks the release build');
});

test('publish gates: reviewed, linked to the site, figures from facts or a source', () => {
  assert.deepEqual(blogGates(post(), { facts, pages: sitePages }).failures, []);
  const failures = (extra) => blogGates(post(extra), { facts, pages: sitePages }).failures.join('\n');
  assert.match(failures({ review: undefined }), /no review recorded/);
  assert.match(failures({ lead: ['We ship 3000 pieces a day.'] }), /"3000".*neither a company fact nor linked/);
  // A GEO article's figures were checked while it was written; its placeholders are reported, not blocking (owner
  // 2026-11-18).
  assert.doesNotMatch(failures({ geo: { run: 'r' }, lead: ['Picture $3000 in rent: [a](/solutions/samples/).'] }), /"3000"/);
  const standIns = blogGates(post({ placeholders: [{ id: 'R5', kind: 'case' }, { id: 'R6', kind: 'number' }] }), { facts, pages: sitePages });
  assert.deepEqual(standIns.failures, []);
  assert.match(standIns.warnings.join('\n'), /2 placeholder\(s\).*R5 \(case\), R6 \(number\)/);
  assert.doesNotMatch(failures({ lead: ['Freight rose 12% ([source](https://example.org/)).', '[a](/solutions/samples/) [b](/leggings-manufacturer/)'] }), /"12"/);
  assert.match(failures({ sections: [{ heading: 'H', paragraphs: ['[x](/nowhere/)'] }] }), /does not exist: \/nowhere\//);
  assert.match(failures({ slug: 'moq-guide-2026' }), /year/);
  assert.equal(validatePost({ ...post(), dateModified: '2026-08-01' }).length, 1);
});

test('publish gate: an article whose main search is a page\'s primary or secondary, or a published article\'s, is held (owner 2026-11-18)', () => {
  const searches = [
    { route: '/leggings-manufacturer/', role: 'primary', query: 'leggings manufacturer' },
    { route: '/leggings-manufacturer/', role: 'secondary', query: 'custom leggings manufacturers' },
    { route: '/blog/older/', role: 'primary', query: 'moq for sportswear' },
  ];
  const gate = (keyword, cannibal) => blogGates(post({ geo: { run: 'r', keyword } }), { facts, pages: sitePages, searches, ...(cannibal ? { cannibal } : {}) });
  assert.match(gate('Leggings Manufacturers').failures.join('\n'), /main search "Leggings Manufacturers" is taken: the same search as \/leggings-manufacturer\/'s primary "leggings manufacturer"/);
  assert.match(gate('manufacturer of custom leggings').failures.join('\n'), /secondary "custom leggings manufacturers"/, 'any word order, plural, function words aside');
  assert.match(gate('MOQ for sportswear').failures.join('\n'), /\/blog\/older\/'s primary/);
  assert.deepEqual(gate('leggings fabric weight').failures, [], 'a search no page or article has');
  assert.deepEqual(gate('leggings manufacturer', 'report').failures, [], '"report": a warning');
  assert.match(gate('leggings manufacturer', 'report').warnings.join('\n'), /is taken/);
  assert.deepEqual(gate('leggings manufacturer', 'off').failures, []);
  // The same article published again (an update) is not its own clash; no searches given, no gate.
  assert.deepEqual(blogGates(post({ geo: { run: 'r', keyword: 'moq for sportswear' } }), { facts, pages: sitePages, searches: [{ route: '/blog/moq-for-custom-sportswear/', role: 'primary', query: 'moq for sportswear' }] }).failures, []);
  assert.deepEqual(blogGates(post({ geo: { run: 'r', keyword: 'leggings manufacturer' } }), { facts, pages: sitePages }).failures, []);
  assert.match(blogGates(post({ geo: { run: 'r' } }), { facts, pages: sitePages, searches }).warnings.join(), /no main search recorded/, 'an article without one is said to be unchecked');
});

test('the queue holds an article whose main search is taken, with its reason, and publishes the rest; site.json switches it', async () => {
  const root = await mkdtemp(join(tmpdir(), 'blog-cannibal-'));
  await mkdir(join(root, 'src/data'), { recursive: true });
  await mkdir(join(root, 'content/blog-queue/approved'), { recursive: true });
  await writeFile(join(root, 'src/data/authoring-pages.json'), JSON.stringify(sitePages.map((item) => ({ ...item, id: item.route, jsonLd: [], blocks: [{ id: 'i', type: 'intro', heading: 'H', paragraphs: ['P'] }] }))));
  // The Site Factory snapshot, committed under inputs/ and named by another machine's path (the publishing workflow's
  // checkout): found inside the site.
  await mkdir(join(root, 'inputs/freeze/s07-x'), { recursive: true });
  await writeFile(join(root, 'inputs/freeze/s07-x/pages.json'), JSON.stringify({ pages: [{ page_id: 'leg', url: '/leggings-manufacturer/', primary_query: 'leggings manufacturer' }] }));
  await writeFile(join(root, 'inputs/freeze/s07-x/keywords.json'), JSON.stringify({ pages: [{ id: 'leg', primary: { query: 'leggings manufacturer' }, secondaries: [{ query: 'wholesale leggings supplier' }] }] }));
  await writeFile(join(root, 'site.json'), JSON.stringify({ siteFactory: 'C:/elsewhere/site/inputs/freeze/s07-x' }));
  const queued = { 'a-taken': ['wholesale leggings suppliers', 'cotton fleece hoodies dyed indigo'], 'b-free': ['how to start a sportswear brand', 'nylon swim shorts printed coral'], 'c-twin': ['How to start a sportswear brand', 'merino base layers knitted grey'] };
  for (const [slug, [keyword, topic]] of Object.entries(queued)) {
    const [a, b, c, d, e] = topic.split(' ');
    await writeFile(join(root, `content/blog-queue/approved/${slug}.json`), JSON.stringify(post({
      slug, geo: { run: slug, keyword }, title: `How are ${a} ${b} ${c} made?`, seo: { title: `${a} ${b} ${c} guide`, description: `${post().seo.description} ${topic}` },
      lead: [`${a} ${b} ${c} start as ${e} ${d} samples: see [samples](/solutions/samples/).`],
      sections: [{ heading: `Which ${a} works?`, paragraphs: [`The ${a} ${c} line at [leggings](/leggings-manufacturer/) shows ${d} ${e}.`] }, { heading: `Can ${b} vary?`, paragraphs: [`${b} ${c} vary by ${e}, as [wholesale](/wholesale-leggings/) lists.`] }],
      datePublished: undefined, dateModified: undefined,
    })));
  }
  const { published, report } = await publishQueued({ root, limit: 5, now: new Date('2026-11-18T10:00:00Z') });
  assert.equal(published, 1, JSON.stringify(report));
  assert.match(report.find((item) => item.slug === 'a-taken').failures.join(), /\/leggings-manufacturer\/'s secondary "wholesale leggings supplier"/);
  assert.match(report.find((item) => item.slug === 'c-twin').failures.join(), /\/blog\/b-free\/'s primary/, 'an article published earlier in the same run counts');
  assert.deepEqual((await readdir(join(root, 'content/blog-queue/approved'))).sort(), ['a-taken.json', 'c-twin.json']);
  assert.match(JSON.stringify(JSON.parse(await readFile(join(root, 'content/blog-queue/report.json'), 'utf8')).report), /is taken/);
  // "report": published with a warning.
  await writeFile(join(root, 'site.json'), JSON.stringify({ siteFactory: 'C:/elsewhere/site/inputs/freeze/s07-x', blogPublish: { cannibal: 'report' } }));
  const reported = await publishQueued({ root, limit: 5, now: new Date('2026-11-18T11:00:00Z') });
  assert.equal(reported.published, 2);
  assert.match(reported.report.map((item) => item.warnings.join()).join(), /is taken/);
});

test('the queue publishes a reviewed article that passes and holds one that fails', async () => {
  const root = await mkdtemp(join(tmpdir(), 'blog-'));
  await mkdir(join(root, 'src/data'), { recursive: true });
  await mkdir(join(root, 'content/blog-queue/approved'), { recursive: true });
  await writeFile(join(root, 'src/data/authoring-pages.json'), JSON.stringify(sitePages.map((item) => ({ ...item, id: item.route, jsonLd: [], blocks: [{ id: 'i', type: 'intro', heading: 'H', paragraphs: ['P'] }] }))));
  await writeFile(join(root, 'src/data/blog-posts.json'), JSON.stringify([{ ...post({ slug: 'placeholder-article-1', status: 'placeholder' }) }]));
  // The company facts the importer recorded.
  await mkdir(join(root, 'docs/research'), { recursive: true });
  await writeFile(join(root, 'facts.yaml'), 'facts:\n  - fact_id: moq\n    text: "Our minimum order quantity is 50 pieces per style per colour."\n    approved_public: true\n');
  await writeFile(join(root, 'docs/research/site-factory-import.json'), JSON.stringify({ inputs: { facts: [join(root, 'facts.yaml')] } }));
  await writeFile(join(root, 'content/blog-queue/approved/a.json'), JSON.stringify(post({ datePublished: undefined, dateModified: undefined, lead: ['Our MOQ is 50 pieces; start with [samples](/solutions/samples/).'] })));
  await writeFile(join(root, 'content/blog-queue/approved/b.json'), JSON.stringify(post({ slug: 'unreviewed', review: undefined })));
  const { published, report } = await publishQueued({ root, limit: 5, now: new Date('2026-09-25T10:00:00Z') });
  assert.equal(published, 1);
  assert.match(report.find((item) => item.slug === 'unreviewed').failures.join(), /no review recorded/);
  const posts = JSON.parse(await readFile(join(root, 'src/data/blog-posts.json'), 'utf8'));
  assert.deepEqual(posts.map((item) => [item.slug, item.datePublished]), [['moq-for-custom-sportswear', '2026-09-25T10:00:00Z']], 'placeholders leave with the first real article');
  assert.deepEqual(await readdir(join(root, 'content/blog-queue/approved')), ['b.json']);
});

test('the schedule publishes on the site\'s days only, as many as it says a day; a run by hand publishes now', async () => {
  const { publishDue } = await import('../blog-publish.mjs');
  const root = await mkdtemp(join(tmpdir(), 'blog-due-'));
  await mkdir(join(root, 'src/data'), { recursive: true });
  await mkdir(join(root, 'content/blog-queue/approved'), { recursive: true });
  await writeFile(join(root, 'src/data/authoring-pages.json'), JSON.stringify(sitePages.map((item) => ({ ...item, id: item.route, jsonLd: [], blocks: [{ id: 'i', type: 'intro', heading: 'H', paragraphs: ['P'] }] }))));
  await writeFile(join(root, 'site.json'), JSON.stringify({ blogPublish: { days: ['tue'], perDay: 1 } }));
  const words = { 'first-article': 'cotton fleece hoodies dyed indigo', 'second-article': 'nylon swim shorts printed coral', 'third-article': 'merino base layers knitted grey' };
  for (const [slug, topic] of Object.entries(words)) {
    const [a, b, c, d, e] = topic.split(' ');
    await writeFile(join(root, `content/blog-queue/approved/${slug}.json`), JSON.stringify(post({
      slug, geo: { run: slug }, title: `How are ${a} ${b} ${c} made?`, seo: { title: `${a} ${b} ${c} guide`, description: `${post().seo.description} ${topic}` },
      lead: [`${a} ${b} ${c} start as ${e} ${d} samples: see [samples](/solutions/samples/).`],
      sections: [{ heading: `Which ${a} works?`, paragraphs: [`The ${a} ${c} line at [leggings](/leggings-manufacturer/) shows ${d} ${e}.`] }, { heading: `Can ${b} vary?`, paragraphs: [`${b} ${c} vary by ${e}, as [wholesale](/wholesale-leggings/) lists.`] }],
      datePublished: undefined, dateModified: undefined,
    })));
  }
  const monday = await publishDue({ root, scheduled: true, now: new Date('2026-11-16T02:00:00Z') });
  assert.deepEqual([monday.published, monday.skipped], [0, 'not a publishing day (tue)']);
  const tuesday = await publishDue({ root, scheduled: true, now: new Date('2026-11-17T02:00:00Z') });
  assert.equal(tuesday.published, 1, 'one a day');
  const byHand = await publishDue({ root, now: new Date('2026-11-18T09:00:00Z'), limit: 2 });
  assert.equal(byHand.published, 2);
  // Monday, Wednesday and Friday, one each (README "Blog publishing"); the queue empty, a publishing day passes quietly;
  // a published article is not published again.
  await writeFile(join(root, 'site.json'), JSON.stringify({ blogPublish: { days: ['mon', 'wed', 'fri'], perDay: 1 } }));
  const before = await readFile(join(root, 'src/data/blog-posts.json'), 'utf8');
  for (const day of ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-27']) {
    const run = await publishDue({ root, scheduled: true, now: new Date(`${day}T02:00:00Z`) });
    assert.equal(run.published, 0);
    assert.equal(run.skipped ?? null, day === '2026-11-24' ? 'not a publishing day (mon, wed, fri)' : null);
  }
  assert.equal(await readFile(join(root, 'src/data/blog-posts.json'), 'utf8'), before);
  assert.deepEqual((await readdir(join(root, 'content/blog-queue/published'))).sort(), Object.keys(words).map((slug) => `${slug}.json`).sort());
});

test('a run of the blog flow publishes only what it wrote; the rest wait for their day', async () => {
  const root = await mkdtemp(join(tmpdir(), 'blog-only-'));
  await mkdir(join(root, 'src/data'), { recursive: true });
  await mkdir(join(root, 'content/blog-queue/approved'), { recursive: true });
  await writeFile(join(root, 'src/data/authoring-pages.json'), JSON.stringify(sitePages.map((item) => ({ ...item, id: item.route, jsonLd: [], blocks: [{ id: 'i', type: 'intro', heading: 'H', paragraphs: ['P'] }] }))));
  await mkdir(join(root, 'docs/research'), { recursive: true });
  await writeFile(join(root, 'facts.yaml'), 'facts:\n  - fact_id: moq\n    text: "Our minimum order quantity is 50 pieces per style per colour."\n    approved_public: true\n');
  await writeFile(join(root, 'docs/research/site-factory-import.json'), JSON.stringify({ inputs: { facts: [join(root, 'facts.yaml')] } }));
  await writeFile(join(root, 'content/blog-queue/approved/a-first.json'), JSON.stringify(post({ slug: 'a-first', datePublished: undefined, dateModified: undefined })));
  await writeFile(join(root, 'content/blog-queue/approved/moq-for-custom-sportswear.json'), JSON.stringify(post({ datePublished: undefined, dateModified: undefined })));
  const { published, report } = await publishQueued({ root, limit: 1, only: ['moq-for-custom-sportswear'], now: new Date('2026-11-18T10:00:00Z') });
  assert.equal(published, 1, JSON.stringify(report));
  assert.deepEqual(await readdir(join(root, 'content/blog-queue/approved')), ['a-first.json']);
});

test('a draft answers the highest-priority question no page answers, and waits for review', async () => {
  const map = { questions: [
    { cluster_id: 'q1', page_id: '/x/', priority: 'high', canonical_question: 'Answered?', pain_point: 'p', evidence: ['e'], ai_prompts: ['a'] },
    { cluster_id: 'q2', page_id: null, priority: 'low', canonical_question: 'Low?', pain_point: 'p', evidence: ['e'], ai_prompts: ['a'] },
    { cluster_id: 'q3', page_id: null, priority: 'high', canonical_question: 'How much funding do I need for a first run?', pain_point: 'p', evidence: ['e'], ai_prompts: ['a'] },
  ] };
  assert.equal(nextQuestion(map, new Set()).cluster_id, 'q3');
  assert.equal(nextQuestion(map, new Set(['q3'])).cluster_id, 'q2');
  const root = await mkdtemp(join(tmpdir(), 'draft-'));
  await mkdir(join(root, 'src/data'), { recursive: true });
  await writeFile(join(root, 'src/data/authoring-pages.json'), JSON.stringify(sitePages.map((item) => ({ ...item, id: item.route, jsonLd: [], blocks: [{ id: 'i', type: 'intro', heading: 'H', paragraphs: ['P'] }] }))));
  await writeFile(join(root, 'questions.json'), JSON.stringify(map));
  let prompt = '';
  let file = '';
  const run = async (input) => {
    prompt = input.prompt;
    file = prompt.match(/Save the article as JSON to (\S+) /)[1];
    await writeFile(join(root, file), JSON.stringify(post({ slug: 'first-run-funding', review: undefined })));
    return { code: 0, stderr: '' };
  };
  const result = await draftArticle({ root, questionsPath: join(root, 'questions.json'), run });
  assert.equal(result.question, 'q3');
  assert.match(prompt, /^OUTPUT LANGUAGE: English/);
  assert.match(prompt, /- \/leggings-manufacturer\/ — /);
  assert.ok(JSON.parse(await readFile(join(root, file.replace(/\.json$/, '.checks.json')), 'utf8')).failures);
  const drafted = JSON.parse(await readFile(join(root, 'content/blog-queue/drafted.json'), 'utf8'));
  assert.equal(nextQuestion(map, new Set(Object.keys(drafted))).cluster_id, 'q2', 'a drafted question is not drafted twice');
});
