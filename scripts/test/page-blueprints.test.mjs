import assert from 'node:assert/strict';
import test from 'node:test';

import { validateAuthoringPages } from '../lib/authoring-contract.mjs';
import { BLUEPRINTS, blueprintPage, blueprintsFrom, slotManifest, TEMPLATE_PAGE_TYPES } from '../lib/page-blueprints.mjs';
import { childPages } from '../lib/site-plan.mjs';

const plan = {
  pages: [
    { page_id: 'home', page_type: 'home', label: 'Home', url: '/' },
    { page_id: 'about', page_type: 'about', label: 'About', url: '/about/' },
    { page_id: 'contact', page_type: 'contact', label: 'Contact', url: '/contact/' },
    { page_id: 'products_hub', page_type: 'products_hub', label: 'Products', url: '/products/', parent_page_id: 'home' },
    { page_id: 'solutions_hub', page_type: 'solutions_hub', label: 'Solutions', url: '/solutions/', parent_page_id: 'home' },
    ...[1, 2, 3, 4, 5].map((n) => ({ page_id: `p${n}`, page_type: 'product_manufacturer', label: `Product ${n}`, url: `/p${n}/`, parent_page_id: 'products_hub' })),
    ...[1, 2].map((n) => ({ page_id: `s${n}`, page_type: 'solution', label: `Service ${n}`, url: `/solutions/s${n}/`, parent_page_id: 'solutions_hub' })),
  ],
  header_nav: [],
};

test('every page type has a blueprint whose slots name a fill source and a size', () => {
  for (const [pageType, slots] of Object.entries(BLUEPRINTS)) {
    // A template-owned legal page is one text slot, a general page (FAQ, terms ...) its text and the closing call to
    // action; every other page type has at least three sections.
    assert.ok(slots.length >= (TEMPLATE_PAGE_TYPES.includes(pageType) ? 1 : pageType === 'general' ? 2 : 3), pageType);
    for (const slot of slots) assert.ok(['copy', 'plan', 'structured', 'site'].includes(slot.fill) && slot.block && slot.purpose, `${pageType}.${slot.id}`);
  }
  const manifest = slotManifest({ components: { featureGrid: 'outlined', heroByPageType: { home: 'media-split' }, pageTypes: { product_manufacturer: { featureGrid: 'media' } } } });
  assert.equal(manifest.pageTypes.home.hero.variant, 'media-split');
  assert.equal(manifest.pageTypes.product_manufacturer.slots.find((slot) => slot.id === 'options').module, 'featureGrid:media');
});

test('placeholder pages follow our blueprint, pass the contract and link real child pages', () => {
  const pages = plan.pages.filter((page) => ['home', 'about', 'contact', 'products_hub'].includes(page.page_type)).map((page) => blueprintPage({ page, pagesPlan: plan, contactRoute: '/contact/' }));
  assert.deepEqual(validateAuthoringPages(pages), []);
  const home = pages.find((page) => page.route === '/');
  assert.deepEqual(home.blocks.find((block) => block.id === 'categories').items.map((item) => item.href), ['/p1/', '/p2/', '/p3/', '/p4/', '/p5/']);
  assert.deepEqual(childPages(plan, 'solutions_hub').map((page) => page.label), ['Service 1', 'Service 2']);
  // The page's name heads it; its copy is marked placeholder (and the page is noindex).
  assert.ok(pages.every((page) => page.status === 'placeholder' && page.hero.heading === plan.pages.find((planned) => planned.url === page.route).label && page.hero.lead[0].startsWith('[Placeholder]')));
});

test('blueprints read back from a slot manifest (Site Factory 06 owns them)', () => {
  const manifest = slotManifest({ components: { featureGrid: 'outlined' } });
  const blueprints = blueprintsFrom(JSON.parse(JSON.stringify(manifest)));
  assert.deepEqual(blueprints, JSON.parse(JSON.stringify(BLUEPRINTS)));
  assert.throws(() => blueprintsFrom({ schemaVersion: 'other' }), /unsupported slot manifest/);
});

test('each competitor gets its own blueprint: its section order and modules, our purposes, the closing CTA last', async () => {
  const { competitorBlueprint, competitorBlueprints, blueprintChoices } = await import('../lib/page-blueprints.mjs');
  const defaults = [
    { id: 'intro', block: 'intro', fill: 'copy' },
    { id: 'categories', block: 'gallery', fill: 'plan' },
    { id: 'capabilities', block: 'featureGrid', fill: 'copy' },
    { id: 'story', block: 'splitMedia', fill: 'copy', repeat: [1, 2] },
    { id: 'faq', block: 'faq', fill: 'copy' },
    { id: 'cta', block: 'cta', fill: 'copy' },
  ];
  const sections = [
    { index: 2, decision: 'splitMedia:tinted (tab panels collapse)' },
    { index: 3, decision: 'splitMedia:single' },
    { index: 4, decision: 'logos' },
    { index: 5, decision: 'band' },
    { index: 6, decision: 'iconList:icons' },
    { index: 7, decision: 'gallery:mosaic' },
  ];
  const slots = competitorBlueprint(defaults, sections);
  assert.deepEqual(slots.map((slot) => `${slot.id}${slot.variant ? `:${slot.variant}` : ''}`), ['intro', 'story:tinted', 'logos', 'capabilities:columns', 'categories:mosaic', 'faq', 'cta:image-band']);
  assert.equal(slots.find((slot) => slot.id === 'logos').fill, 'owner', 'logos only from the owner, never written');
  // Choices apply only when turned on.
  const inventory = { pages: [{ pageType: 'home', sections: [{ index: 1, decision: 'hero:media-split' }, ...sections] }] };
  const choices = blueprintChoices(inventory);
  assert.equal(choices.enabled, false);
  choices.pageTypes.home.find((item) => item.index === 4).include = false;
  assert.ok(competitorBlueprints(inventory, { choices }).home.some((slot) => slot.id === 'logos'));
  assert.ok(!competitorBlueprints(inventory, { choices: { ...choices, enabled: true } }).home.some((slot) => slot.id === 'logos'));
});

test('an imported page follows its blueprint order, each block in its slot module', async () => {
  const { orderBySlots } = await import('../lib/page-assembly.mjs');
  const slots = [{ id: 'intro', block: 'intro' }, { id: 'categories', block: 'gallery', fill: 'plan', variant: 'mosaic' }, { id: 'key-figures', block: 'stats', fill: 'structured' }, { id: 'story', block: 'splitMedia', variant: 'tinted' }, { id: 'cta', block: 'cta' }];
  const blocks = [
    { id: 's1', type: 'intro', sourceSectionIds: ['s1'] },
    { id: 'key-figures', type: 'stats', sourceSectionIds: [] },
    { id: 's2', type: 'splitMedia', sourceSectionIds: ['s2'], variant: 'tinted' },
    { id: 'plan-categories', type: 'gallery', sourceSectionIds: [] },
    { id: 'sources', type: 'sources' },
    { id: 'cta', type: 'cta' },
  ];
  const mapping = [{ sectionId: 's1', slotId: 'intro', rule: 'slot intro' }, { sectionId: 's2', slotId: 'story', rule: 'slot story' }];
  const ordered = orderBySlots(blocks, mapping, slots);
  assert.deepEqual(ordered.map((block) => block.id), ['s1', 'plan-categories', 'key-figures', 's2', 'sources', 'cta']);
  assert.equal(ordered[1].variant, 'mosaic');
});

test('the closing call to action follows the competitor page\'s last closing section', async () => {
  const { competitorBlueprint } = await import('../lib/page-blueprints.mjs');
  const defaults = [{ id: 'intro', block: 'intro', fill: 'copy' }, { id: 'cta', block: 'cta', fill: 'copy' }];
  const slots = competitorBlueprint(defaults, [{ index: 2, decision: 'cta:inline' }, { index: 3, decision: 'intro/proof' }, { index: 4, decision: 'cta:form' }]);
  assert.deepEqual(slots.map((slot) => `${slot.id}${slot.variant ? `:${slot.variant}` : ''}`), ['intro', 'cta:form']);
});

test('the privacy page is legal text without photos or calls to action; the contact page does not ask to contact us', () => {
  const privacy = blueprintPage({ page: { page_id: 'privacy', page_type: 'privacy', label: 'Privacy Policy', url: '/privacy/' }, pagesPlan: plan, contactRoute: '/contact/' });
  assert.equal(privacy.hero.cta, undefined);
  assert.deepEqual(privacy.blocks.map((block) => [block.type, block.variant]), [['intro', 'text']]);
  const contact = blueprintPage({ page: plan.pages.find((page) => page.page_type === 'contact'), pagesPlan: plan, contactRoute: '/contact/' });
  assert.ok(!contact.blocks.some((block) => block.type === 'cta'));
  const about = blueprintPage({ page: plan.pages.find((page) => page.page_type === 'about'), pagesPlan: plan, contactRoute: '/contact/' });
  assert.ok(about.blocks.find((block) => block.type === 'cta')?.heading, 'a placeholder closing band has a placeholder heading');
});

test('a specialist site\'s product hub is a menu heading only (nav_only): no link, no page, no breadcrumb step', async () => {
  const { siteNavFromPlan, relatedPages } = await import('../lib/site-plan.mjs');
  const { breadcrumbTrail } = await import('../lib/seo-head.mjs');
  const plan = { header_nav: [{ page_id: null, label: 'Products', children: [{ page_id: 'bikini', label: 'Bikinis' }] }, { page_id: 'hub', label: 'Hub', children: [] }], footer_nav: [], pages: [
    { page_id: 'home', page_type: 'home', url: '/', label: 'Home' },
    { page_id: 'hub', page_type: 'products_hub', url: '/products/', label: 'Products', nav_only: true, parent_page_id: 'home' },
    { page_id: 'bikini', page_type: 'product_manufacturer', url: '/bikini/', label: 'Bikinis', parent_page_id: 'hub' },
  ] };
  const nav = siteNavFromPlan(plan);
  assert.deepEqual(nav.header.map((node) => node.route), [null, null]);
  assert.equal(nav.header[0].children[0].route, '/bikini/');
  assert.deepEqual(relatedPages(plan.pages[2], plan).map((page) => page.url), []);
  assert.deepEqual(breadcrumbTrail({ route: '/bikini/', hero: { heading: 'Bikinis' } }, nav).map((crumb) => crumb.route), ['/', '/bikini/']);
});

test('the contact page shows the company\'s own ways to be reached (a contactChannels block, no copy), as the footer does', async () => {
  const { contactChannels } = await import('../lib/site-contact.mjs');
  const { PATTERN_DECISIONS } = await import('../lib/pattern-map.mjs');
  const contact = blueprintPage({ page: plan.pages.find((page) => page.page_type === 'contact'), pagesPlan: plan, contactRoute: '/contact/' });
  assert.deepEqual(contact.blocks.filter((block) => block.type === 'contactChannels').map((block) => block.id), ['channels']);
  assert.equal(PATTERN_DECISIONS['contact-cards'], 'contactChannels:cards');
  assert.deepEqual(validateAuthoringPages([{ ...contact, status: 'placeholder' }]).filter((error) => /contactChannels|channels/.test(error)), []);
  // The list the footer and the contact page share: own details first, then the chat lines; links where they work.
  assert.deepEqual(contactChannels({ contact: { email: 'sales@x.com', phone: '+86 (20) 1234-5678', address: 'Guangzhou', hours: 'Mon-Sat' }, chat: { whatsapp: [{ number: '+86 138 0000 0000' }] } }).map((channel) => [channel.kind, channel.label, channel.href ?? null]), [
    ['email', 'sales@x.com', 'mailto:sales@x.com'],
    ['phone', '+86 (20) 1234-5678', 'tel:+862012345678'],
    ['whatsapp', 'WhatsApp +86 138 0000 0000', 'https://wa.me/8613800000000'],
    ['address', 'Guangzhou', null],
    ['hours', 'Mon-Sat', null],
  ]);
  assert.deepEqual(contactChannels({ chat: { email: 'chat@x.com' } }).map((channel) => channel.href), ['mailto:chat@x.com'], 'the chat email when the company has none');
});
