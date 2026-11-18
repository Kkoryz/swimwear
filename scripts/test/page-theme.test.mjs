import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import apparel from '../../config/image-briefs.json' with { type: 'json' };
import service from '../../config/image-briefs.service.json' with { type: 'json' };
import { planLibrary } from '../lib/image-plan.mjs';
import { imagePrompt } from '../lib/image-prompt.mjs';
import { libraryMedia } from '../lib/library-media.mjs';
import { allocateSite } from '../lib/media-allocation.mjs';
import { markFirstViewportImage } from '../lib/media-slots.mjs';
import { fitsTheme, pageTheme, routeThemes, themeById } from '../lib/page-theme.mjs';
import { firstImageOnScreen, offscreenEagerProblems } from '../lib/seo-site-checks.mjs';

// site13 claude-seo audit 2026-11-17, M-13 (photos off their page's theme), site12's I-1 (service pages of scenes and
// 1536px photos over 400 KB) and site13's L-5 (a closing photo loaded eagerly).
const briefs = { ...apparel, placeholderKinds: [] };
const split = (id) => ({ id, type: 'splitMedia', heading: `Row ${id}`, paragraphs: ['P'], media: null });
const page = (route, pageType = 'product_manufacturer', blocks = [split('a')]) => ({ route, pageType, status: 'authored', hero: { heading: route }, blocks });
const nav = { header: [{ label: 'Products', route: null, children: [
  { label: "Men's Swimwear", route: '/men-s-swimwear-manufacturer/', children: [{ label: 'Boardshorts', route: '/boardshorts-manufacturer/', children: [] }] },
  { label: "Children's Swimwear", route: '/children-s-swimwear-manufacturer/', children: [{ label: 'Rash Suits', route: '/rash-suit-manufacturer/', children: [] }] },
  { label: 'Watersports Apparel', route: '/watersports-apparel-manufacturer/', children: [] },
] }] };
const components = { hero: 'media-overlay', heroByPageType: { contact: 'plain' }, pageTypes: { product_manufacturer: { splitSequence: ['single'] }, solution: { splitSequence: ['single'] } } };
const styleRefs = { hero: [{ path: 'h.jpg', subject: 'a beach' }], product: [{ path: 'p.jpg', subject: '' }], lifestyle: [{ path: 'l.jpg', subject: '' }], process: [{ path: 'f.jpg', subject: 'factory' }] };

test("a page's theme comes from its category, else from the menu items above it; children first", () => {
  assert.equal(pageTheme({ category: 'boardshorts', trail: ["Men's Swimwear"] }, briefs).id, 'men');
  assert.equal(pageTheme({ category: "men's swimwear" }, briefs).id, 'men');
  assert.equal(pageTheme({ category: 'couples matching swimsuit' }, briefs).id, 'couples');
  assert.equal(pageTheme({ category: 'rash suit', trail: ["Children's Swimwear"] }, briefs).id, 'children');
  assert.equal(pageTheme({ category: 'burkini', trail: ['Modest Swimwear'] }, briefs).id, 'modest');
  const rash = pageTheme({ category: "women's rash guard" }, briefs);
  assert.equal(rash.id, 'women');
  assert.ok(rash.placeWords.includes('water'), 'a women\'s rash guard is still shown where rash guards are worn');
  assert.equal(pageTheme({ category: 'bikini' }, briefs), null);
  const routes = { '/boardshorts-manufacturer/': 'boardshorts', '/': 'general' };
  assert.deepEqual(routeThemes([page('/boardshorts-manufacturer/'), page('/', 'home')], routes, briefs, nav), { '/boardshorts-manufacturer/': 'men' });
});

test("a made photo stays while its alt shows its theme's audience and place", () => {
  const men = pageTheme({ category: "men's swimwear" }, briefs);
  assert.equal(fitsTheme({ alt: 'A man in blue boardshorts sits on a stool.' }, men, briefs), true);
  assert.equal(fitsTheme({ alt: 'A woman in cobalt boardshorts sits on stone steps.' }, men, briefs), false);
  assert.equal(fitsTheme({ alt: 'A man and a woman in matching swimwear.' }, men, briefs), false);
  assert.equal(fitsTheme({ alt: 'Navy boardshorts laid flat on linen.' }, men, briefs), true, 'nobody shown: nothing to contradict');
  const couples = pageTheme({ category: 'couples matching swimsuit' }, briefs);
  assert.equal(fitsTheme({ alt: 'A woman holding a fan and a man wear lemon-print swimwear.' }, couples, briefs), true);
  assert.equal(fitsTheme({ alt: 'A woman in coral swimwear on a terrace.' }, couples, briefs), false);
  const kids = pageTheme({ category: "children's swimwear" }, briefs);
  assert.equal(fitsTheme({ alt: 'A woman holds a child\'s swimsuit.' }, kids, briefs), false, 'no adult on a children\'s page');
  const water = pageTheme({ category: 'watersports apparel' }, briefs);
  assert.equal(fitsTheme({ alt: 'A woman in a striped swimsuit sits on a garden patio.' }, water, briefs), false);
  assert.equal(fitsTheme({ alt: 'A woman in a rash guard kneels on grass above the sea.' }, water, briefs), true);
  assert.equal(fitsTheme({ alt: 'A woman in a garden.', productOnly: true }, water, briefs), true);
  assert.equal(fitsTheme({ alt: 'A woman sewing.' }, men, briefs, { person: false }), true, 'a class with no model');
});

test("the plan names the theme's wearer, makes again a photo off its theme and gives a themed page its theme's process photos", () => {
  const pages = [page('/men-s-swimwear-manufacturer/'), page('/boardshorts-manufacturer/'), page('/', 'home'), page('/rash-suit-manufacturer/')];
  const planned = planLibrary({ pages, components, line: 'swimwear', briefs, styleRefs, nav });
  const hero = planned.entries.find((entry) => entry.id === 'boardshorts-hero-1');
  assert.equal(hero.wearer, 'one adult man');
  assert.match(hero.subject, /men's boardshorts/);
  assert.equal(planned.themes['/boardshorts-manufacturer/'], 'men');
  // The rash suits sit under Children's Swimwear: shown on their own though their name says no age.
  assert.ok(planned.entries.filter((entry) => entry.category === 'rash suit' && entry.kind !== 'process').every((entry) => entry.productOnly && !entry.wearer));
  // Process photos are the theme's set, not the line's, on a themed page; the home page keeps the line's.
  const process = planned.entries.filter((entry) => entry.kind === 'process').map((entry) => entry.category);
  assert.ok(process.includes('theme:men') && process.includes('theme:children'));
  assert.ok(planned.entries.find((entry) => entry.category === 'theme:men').subject.includes("men's swimwear"));
  // A photo made before the theme: the woman is made again, the man stays.
  const made = (entry, alt) => ({ ...entry, status: 'generated', alt, master: `m/${entry.id}.png`, web: { src: `/${entry.id}.webp`, srcset: '', width: 1, height: 1 } });
  const previous = { ...planned, entries: planned.entries.map((entry) => (entry.id === 'boardshorts-hero-1' ? made({ ...entry, wearer: undefined }, 'A woman in cobalt boardshorts on stone steps.') : entry.id === 'men-s-swimwear-hero-1' ? made(entry, 'A man in black swim trunks on a rock.') : entry)) };
  const again = planLibrary({ pages, components, line: 'swimwear', briefs, styleRefs, nav, previous });
  assert.equal(again.entries.find((entry) => entry.id === 'boardshorts-hero-1').status, 'planned');
  assert.equal(again.entries.find((entry) => entry.id === 'men-s-swimwear-hero-1').status, 'generated');
});

test("a themed page's factory position takes its theme's photo and never the line's", () => {
  const photo = (src, category) => ({ src, alt: src, width: 10, height: 10, category });
  const media = { routeCategories: { '/boardshorts-manufacturer/': 'boardshorts', '/': 'general' }, routeThemes: { '/boardshorts-manufacturer/': 'men' }, pools: { process: [photo('general-process-1', 'general')] }, placeholders: [] };
  // A single split row asks for a process photo (media-slots.mjs).
  const pages = [page('/boardshorts-manufacturer/'), page('/', 'home')];
  const kinds = { ...components, hero: 'plain', pageTypes: { product_manufacturer: { splitSequence: ['single'], mediaModules: [] }, home: { splitSequence: ['single'], mediaModules: [] } } };
  const shown = (alloc, route) => alloc.byRoute[route][0][0];
  const none = allocateSite({ pages, components: { ...kinds, media } });
  assert.equal(shown(none, '/').src, 'general-process-1');
  assert.equal(shown(none, '/boardshorts-manufacturer/').slot, 'process', "the line's set stays off the men's page: a slot the plan fills");
  assert.deepEqual(none.unfilled.map((request) => [request.route, request.category]), [['/boardshorts-manufacturer/', 'theme:men']]);
  const own = allocateSite({ pages, components: { ...kinds, media: { ...media, themePools: { 'theme:men': { process: [photo('men-process-1', 'theme:men')] } } } } });
  assert.equal(shown(own, '/boardshorts-manufacturer/').src, 'men-process-1');
});

test('a service page opens on a photo of its service, planned as its hero\'s own ask', () => {
  const pages = [page('/swimwear-embroidery/', 'solution'), page('/swimwear-packaging/', 'solution'), page('/', 'home')];
  const plan = planLibrary({ pages, components, line: 'swimwear', briefs, styleRefs, ownRoutes: new Set(['/swimwear-packaging/']) });
  const asked = plan.entries.filter((entry) => entry.intent?.id === 'service-hero');
  assert.deepEqual(asked.map((entry) => [entry.id, entry.category, entry.kind]), [['swimwear-embroidery-service-hero', 'swimwear embroidery', 'hero']], 'a page with photos of its own keeps them');
  assert.match(asked[0].subject, /the work of swimwear embroidery itself/);
  assert.equal(asked[0].intent.caption, '/swimwear-embroidery/', "the page's title goes with it");
  assert.equal(plan.routes['/swimwear-embroidery/'], 'general', 'its other photos stay the line\'s');
  const made = { ...plan, entries: plan.entries.map((entry) => ({ ...entry, status: 'generated', alt: entry.id, web: { src: `/${entry.id}.webp`, srcset: '', width: 1, height: 1 } })) };
  const { heroByRoute } = libraryMedia(made);
  assert.equal(heroByRoute['/swimwear-embroidery/'].src, '/swimwear-embroidery-service-hero.webp');
  assert.equal(heroByRoute['/swimwear-embroidery/'].intent, undefined);
  assert.match(heroByRoute['/'].src, /general-hero/);
  // No site-wide hero is asked for the page any more.
  assert.equal(planLibrary({ pages: pages.slice(0, 1), components, line: 'swimwear', briefs, styleRefs }).entries.filter((entry) => entry.kind === 'hero' && entry.category === 'general').length, 0);
});

test("a service business's photos all show what the work delivers; its generic scenes made before stay unless replaced", () => {
  const pages = [page('/ota-optimization/', 'solution', ['a', 'b', 'c', 'd'].map(split)), page('/', 'home', ['e'].map(split))];
  // Rows of a photo and a product photo each, the product photos plain (no topic photos asked for here).
  const scenes = { ...service, placeholderKinds: [], topicCaps: { ...service.topicCaps, product: 0 } };
  const rows = { ...components, pageTypes: { solution: { splitSequence: ['dual'] } } };
  const plan = planLibrary({ pages, components: rows, line: 'hotel-rm', briefs: scenes, styleRefs, ownRoutes: new Set(['/ota-optimization/']) });
  const live = plan.entries.filter((entry) => entry.status !== 'retired');
  assert.ok(live.filter((entry) => entry.category === 'ota optimization' && ['product', 'lifestyle'].includes(entry.kind)).length >= 2);
  // Every photo, the site-wide ones too, is of the online-service class: a report, a working screen, a delivered file
  // (owner 2026-11-17: no generic scene on a service site).
  assert.deepEqual([...new Set(live.map((entry) => entry.photoClass))], ['service']);
  for (const entry of live) assert.match(entry.subject, /unreadable|blurred/, entry.id);
  // A site's own subjects that are generic scenes are left out; a class left with none takes the trade's, one left
  // with fewer than its photos is topped up with them, its own first (site14 2026-11-17: the heroes on one subject).
  const motel = { ...scenes, subjects: { ...scenes.subjects, hero: ['a motel at dusk', 'a front desk clerk with a printed weekly report'], lifestyle: ['guests arriving at a motel'] }, tradeSubjects: service.subjects };
  const own = planLibrary({ pages, components: rows, line: 'motel', briefs: motel, styleRefs, ownRoutes: new Set(['/ota-optimization/']) }).entries;
  const heroes = own.filter((entry) => entry.kind === 'hero' && entry.category === 'general');
  assert.equal(heroes[0].subject, 'a front desk clerk with a printed weekly report');
  assert.ok(own.filter((entry) => entry.kind === 'hero').every((entry) => entry.subject === 'a front desk clerk with a printed weekly report' || service.subjects.hero.some((subject) => subject.replaceAll('{category}', entry.category === 'general' ? 'motel' : entry.category) === entry.subject)));
  assert.ok(own.filter((entry) => entry.kind === 'lifestyle').every((entry) => service.subjects.lifestyle.some((subject) => subject.replaceAll('{category}', entry.category === 'general' ? 'motel' : entry.category) === entry.subject)));
  // A generic scene made before stays (no batch remake: RateHarbor's 20, MotelPilot's 30), classed a scene for the
  // report; --replace-scenes plans it again.
  const previous = { ...plan, entries: plan.entries.map((entry) => ({ ...entry, subject: 'a hotel terrace at dusk', photoClass: undefined, status: 'generated', alt: 'A hotel terrace at dusk.', master: 'm.png', sha256: 'x', web: { src: `/${entry.id}.webp`, srcset: '', width: 1, height: 1 } })) };
  const again = planLibrary({ pages, components: rows, line: 'hotel-rm', briefs: scenes, styleRefs, ownRoutes: new Set(['/ota-optimization/']), previous });
  assert.ok(again.entries.every((entry) => entry.status === 'generated' && entry.photoClass === 'scene'));
  const replaced = planLibrary({ pages, components: rows, line: 'hotel-rm', briefs: scenes, styleRefs, ownRoutes: new Set(['/ota-optimization/']), previous, replaceScenes: true });
  assert.ok(replaced.entries.filter((entry) => entry.status !== 'retired').every((entry) => entry.status === 'planned' && entry.photoClass === 'service'));
});

test("a theme's photos take the line's kinds; a service page's own opening photo is read as no kind", async () => {
  const { typeCategory, typedPhoto, typeOf } = await import('../lib/image-types.mjs');
  assert.equal(typeCategory('theme:men'), 'general');
  assert.equal(typeCategory('boardshorts'), 'boardshorts');
  const types = { refs: ['f.jpg'], types: [{ name: 'factory floor', shows: 'making', photos: [1] }], pages: { general: { slots: { 'theme-men-process-1': 0 } } } };
  assert.equal(typeOf(types, { id: 'theme-men-process-1', kind: 'process', category: 'theme:men' })?.name, 'factory floor');
  assert.equal(typedPhoto({ id: 'a', kind: 'hero', intent: { id: 'service-hero' } }), false, 'no model call for it');
  assert.equal(typedPhoto({ id: 'b', kind: 'product', intent: { id: 'brief-m3-1' } }), true, "a section's ask is read as before");
});

test("the model line names who wears it where the page's theme says", () => {
  const profile = { summary: 'S', settings: 's', background: 'b', colour: 'c', lighting: 'l', casting: 'c', poseAndEnergy: 'p', framing: 'f', avoid: 'a' };
  const entry = { id: 'boardshorts-hero-1', kind: 'hero', category: 'boardshorts', index: 1, size: '1536x1024', subject: "a model wearing men's boardshorts", casting: 'in their twenties, Black, with short natural hair', wearer: 'one adult man' };
  assert.match(imagePrompt(entry, { master: 'm.png', profile, briefs, line: 'swimwear' }), /Model: one adult man, in their twenties, Black/);
  assert.match(imagePrompt({ ...entry, wearer: undefined }, { master: 'm.png', profile, briefs, line: 'swimwear' }), /Model: one adult in their twenties, Black, with short natural hair, of the gender that wears it/);
});

test('a page without a hero photo loads only its first section\'s first image at once; the built check reports one further down', () => {
  const cta = { src: '/cta.webp', alt: '' };
  const plan = [[], [null], [cta]];
  assert.equal(markFirstViewportImage(plan), null, 'the closing photo is not in the first viewport');
  assert.equal(plan[2][0].priority, undefined);
  const first = [[{ src: '', alt: '', slot: 'product' }, { src: '/a.webp', alt: '' }], [cta]];
  assert.equal(markFirstViewportImage(first).src, '/a.webp');
  assert.equal(first[0][1].priority, true);
  const html = (body) => `<html><body><main id="main">${body}</main></body></html>`;
  const privacy = html('<section data-authoring-block="hero"><h1>Privacy</h1></section><section data-authoring-block="intro"><p>P</p></section><section data-authoring-block="cta"><img src="/cta.webp" loading="eager" fetchpriority="high" alt=""></section>');
  assert.deepEqual(offscreenEagerProblems(privacy).map((item) => item.issue), ['image_eager_offscreen']);
  assert.equal(firstImageOnScreen(privacy), false, 'its first image may be lazy');
  const lead = html('<section data-authoring-block="hero"><h1>T</h1></section><section data-authoring-block="page-lead"><p>L</p></section><section data-authoring-block="intro"><img src="/a.webp" loading="eager" alt=""></section>');
  assert.deepEqual(offscreenEagerProblems(lead), [], 'the lead band is not a section of its own');
  assert.equal(firstImageOnScreen(lead), true);
});

test('render-web-images --over-budget encodes again only the published files over the budget and names their width', async () => {
  const { default: sharp } = await import('sharp');
  const { renderWebImages } = await import('../render-web-images.mjs');
  const { WEB_IMAGE_MAX_BYTES } = await import('../lib/web-image.mjs');
  const root = await mkdtemp(join(tmpdir(), 'over-budget-'));
  try {
    await mkdir(join(root, 'docs/research/images/masters'), { recursive: true });
    await mkdir(join(root, 'public/media/photos'), { recursive: true });
    const noise = Buffer.alloc(1600 * 1000 * 3);
    for (let n = 0; n < noise.length; n += 1) noise[n] = (n * 2654435761) % 251;
    await sharp(noise, { raw: { width: 1600, height: 1000, channels: 3 } }).png().toFile(join(root, 'docs/research/images/masters/a.png'));
    // As site12's were: published before the budget, 1536 wide and far over it; the 480 file within.
    await writeFile(join(root, 'public/media/photos/a-1536.webp'), Buffer.alloc(WEB_IMAGE_MAX_BYTES * 2));
    await writeFile(join(root, 'public/media/photos/a-480.webp'), Buffer.alloc(1000));
    const plan = { entries: [{ id: 'a', master: 'docs/research/images/masters/a.png', web: { src: '/media/photos/a-480.webp', srcset: '/media/photos/a-480.webp 480w, /media/photos/a-1536.webp 1536w', width: 480, height: 300 } }] };
    await writeFile(join(root, 'docs/research/image-plan.json'), JSON.stringify(plan));
    assert.equal(await renderWebImages({ root, overBudget: true }), 1);
    assert.ok((await stat(join(root, 'public/media/photos/a-1536.webp'))).size <= WEB_IMAGE_MAX_BYTES);
    assert.equal((await stat(join(root, 'public/media/photos/a-480.webp'))).size, 1000, 'a file within the budget is left as it is');
    const { readFile } = await import('node:fs/promises');
    const srcset = JSON.parse(await readFile(join(root, 'docs/research/image-plan.json'), 'utf8')).entries[0].web.srcset;
    const width = Number(srcset.match(/a-1536\.webp (\d+)w/)[1]);
    assert.ok(width < 1536 && width === (await sharp(join(root, 'public/media/photos/a-1536.webp')).metadata()).width, srcset);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('a product family that is not the line\'s takes a factory set of its own; the line\'s families and pages under no menu item keep the line\'s (aloha M-17, 2026-11-18)', () => {
  const familyNav = { header: [{ label: 'Products', route: null, children: [
    { label: 'Big & Tall Aloha Shirts', route: '/big-and-tall-aloha-shirt-manufacturer/', children: [{ label: 'Tall Shirts', route: '/tall-shirt-manufacturer/', children: [] }] },
    { label: 'Swimwear', route: '/swimwear-manufacturer/', children: [{ label: 'Bikinis', route: '/bikini-manufacturer/', children: [] }] },
  ] }, { label: 'Sarongs', route: '/sarong-manufacturer/', children: [] }] };
  const routes = { '/big-and-tall-aloha-shirt-manufacturer/': 'big and tall aloha shirt', '/tall-shirt-manufacturer/': 'tall shirt', '/swimwear-manufacturer/': 'swimwear', '/bikini-manufacturer/': 'bikini', '/sarong-manufacturer/': 'sarong', '/': 'general' };
  const pages = Object.keys(routes).map((route) => page(route, route === '/' ? 'home' : 'product_manufacturer'));
  assert.deepEqual(routeThemes(pages, routes, briefs, familyNav, 'aloha shirts'), { '/swimwear-manufacturer/': 'family-swimwear', '/bikini-manufacturer/': 'family-swimwear' });
  assert.deepEqual(routeThemes(pages, routes, briefs, familyNav), {}, 'without the line no family is told');
  const theme = themeById('family-resort-dresses', briefs);
  assert.deepEqual([theme.product, theme.words], ['resort dresses', ['resort dresses']]);
});

test('an item nobody wears is planned as itself, never a model wearing it (aloha M-17, 2026-11-18)', () => {
  const pages = [page('/packaging/', 'solution', [split('a'), { id: 'g', type: 'gallery', heading: 'Packs', items: [{ title: 'Boxes' }, { title: 'Bags' }] }]), page('/', 'home')];
  const plan = (notWorn) => planLibrary({ pages, components, line: 'aloha shirts', briefs, styleRefs, ownRoutes: new Set(['/packaging/']), notWorn });
  const subjects = (made) => made.entries.filter((entry) => entry.category === 'packaging' && ['hero', 'product', 'lifestyle'].includes(entry.kind)).map((entry) => entry.subject);
  assert.ok(subjects(plan([])).some((subject) => /model wearing packaging/.test(subject)), 'the fixture plans person photos of the category');
  const items = subjects(plan(['packaging']));
  assert.ok(items.length && items.every((subject) => !/model|wearing/.test(subject)), items.join(' | '));
});

test('a service trade\'s photos keep its own subjects though nothing on its pages is worn (RateHarbor 2026-11-18)', () => {
  const pages = [page('/ota-optimization/', 'solution', [split('a')]), page('/', 'home')];
  const own = 'a revenue analyst reviewing a pricing dashboard on a monitor, the figures out of focus';
  const serviceBriefs = { ...service, placeholderKinds: [], subjects: { ...service.subjects, lifestyle: [own], product: [own], hero: [`${own}, with some open space on one side for a headline`] } };
  const plan = planLibrary({ pages, components, line: 'hotel-rm', briefs: serviceBriefs, styleRefs, ownRoutes: new Set(['/ota-optimization/']), notWorn: ['ota optimization', 'general'] });
  const subjects = plan.entries.filter((entry) => ['hero', 'product', 'lifestyle'].includes(entry.kind)).map((entry) => entry.subject);
  assert.ok(subjects.length && subjects.every((subject) => subject.startsWith('a revenue analyst')), subjects.join(' | '));
});

test('a page the site names photos for opens on its own hero and takes its own photo in a named position (coordinator 2026-11-18)', () => {
  const about = { route: '/about-us/', pageType: 'about', status: 'authored', hero: { heading: 'About us' }, blocks: [split('a')] };
  const pages = [about, page('/', 'home')];
  const named = { '/about-us/': { hero: 'a bright swimwear sample room with finished suits on rails and a pattern table, with some open space on one side for a headline', a: 'pattern makers checking a swimsuit sample on a dress form' } };
  const plan = planLibrary({ pages, components, line: 'swimwear', briefs: { ...briefs, pagePhotos: named }, styleRefs });
  const hero = plan.entries.find((entry) => entry.intent?.route === '/about-us/' && entry.kind === 'hero');
  assert.equal(hero?.subject, named['/about-us/'].hero);
  assert.ok(plan.entries.some((entry) => entry.intent?.route === '/about-us/' && entry.subject === named['/about-us/'].a), plan.entries.filter((entry) => entry.intent).map((entry) => entry.id).join(', '));
  assert.deepEqual(plan.pagePhotos, named);
  const made = { ...plan, entries: plan.entries.map((entry) => ({ ...entry, status: 'generated', web: { src: `/media/photos/${entry.id}-960.webp`, srcset: '', width: 960, height: 640 }, alt: entry.id })) };
  const media = libraryMedia(made);
  assert.equal(media.heroByRoute['/about-us/'].src, `/media/photos/${hero.id}-960.webp`);
  assert.ok(!(media.hero?.src ?? '').includes(hero.id), 'not a turn of the site-wide heroes');
});
