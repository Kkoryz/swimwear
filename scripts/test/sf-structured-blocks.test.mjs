import assert from 'node:assert/strict';
import test from 'node:test';

import { importSiteFactory } from '../import-site-factory.mjs';
import { validateAuthoringPages } from '../lib/authoring-contract.mjs';
import { mediaSlots } from '../lib/media-slots.mjs';
import { planKindBlocks, verifyKindFacts, withSiteModules } from '../lib/sf-kinds.mjs';
import { pageCopy } from '../lib/site-pages.mjs';

// Owner 2026-11-10 via Site Factory: figures, price cards, colour swatches, a photo group, and flows written once for
// the site (site_modules, used by pages) or on a page of their own.
const facts = new Map([
  ['f-moq', { text: 'Orders start at 50 pieces per style.', approved: true }],
  ['f-sample', { text: 'A sample takes 10–15 days and costs USD 50.', approved: true }],
  ['f-bulk', { text: 'Bulk production takes 35-40 days after sample approval.', approved: true }],
  ['f-draft', { text: 'We ship in 2 days.', approved: false }],
]);
const order = {
  heading: 'How an order runs',
  steps: [
    { name: 'Quote', we_do: 'We price your styles within a day.', client_provides: 'Your styles and quantities', duration: null, fact_ids: [] },
    { name: 'Sample', we_do: 'We make a sample to your spec.', client_provides: 'Your tech pack', duration: { min: 10, max: 15, unit: 'days' }, fact_ids: ['f-sample'] },
    { name: 'Approval', we_do: 'You approve the sample and pay the deposit.', duration: null, fact_ids: [] },
    { name: 'Bulk', we_do: 'We make the order.', duration: { min: 35, max: 40, unit: 'days' }, fact_ids: ['f-bulk'] },
  ],
};
const page = (sections) => ({ page_id: 'bikini', url: '/bikini/', title: 'T', meta_description: 'D', h1: 'Bikini maker', release_status: 'ready_for_template', hold_reasons: [], links: [], cta: { target_url: '/contact/', label: 'Request a quote' }, structured_data: [], sections: [{ section_id: 'a', kind: 'intro', heading: 'Bikinis for your brand', body: 'We make bikinis for brands. '.repeat(8) }, ...sections] });
const pkg = (sections, site_modules = { order_process: order }) => ({ schema_version: 'sf/authoring/v1', project: 't', site_modules, pages: [page(sections)] });
const plan = { pages: [{ page_id: 'bikini', page_type: 'product_manufacturer', label: 'Bikini', url: '/bikini/' }], header_nav: [], footer_nav: [] };
const blocksOf = (sections, modules) => importSiteFactory({ authoringPackage: pkg(sections, modules), pagesPlan: plan, facts, blueprints: {} }).pages[0].blocks;

test('a page uses a site-wide flow: its steps and heading, its own sentence first; drawn as steps or as a table', () => {
  const [steps] = blocksOf([{ section_id: 'p', kind: 'process_steps', uses: 'order_process', note: 'Bikinis add a fit sample.' }]).filter((block) => block.type === 'process');
  assert.equal(steps.heading, 'How an order runs');
  assert.deepEqual(steps.paragraphs, ['Bikinis add a fit sample.']);
  assert.deepEqual(steps.steps[1], { heading: 'Sample', text: 'We make a sample to your spec.', provides: 'Your tech pack', duration: '10–15 days' });
  assert.deepEqual(steps.steps[2], { heading: 'Approval', text: 'You approve the sample and pay the deposit.' });
  const [table] = blocksOf([{ section_id: 'p', kind: 'process_steps', presentation: 'table', uses: 'order_process', heading: 'Your order' }]).filter((block) => block.type === 'table');
  assert.equal(table.heading, 'Your order');
  assert.deepEqual(table.columns, ['Step', 'What we do', 'What you provide', 'Time']);
  assert.deepEqual(table.rows[2], ['Approval', 'You approve the sample and pay the deposit.', '', '']);
  // A page's own flow, no client column: the column no step fills is left out.
  const own = { section_id: 'q', kind: 'development', presentation: 'table', heading: 'Developing a print', steps: order.steps.map(({ client_provides: _, ...step }) => step) };
  assert.deepEqual(blocksOf([own]).find((block) => block.type === 'table').columns, ['Step', 'What we do', 'Time']);
  // Every word is page copy the audit looks for.
  const copy = pageCopy({ hero: { heading: 'H' }, blocks: [steps] });
  for (const text of ['Your tech pack', '10–15 days', 'Bikinis add a fit sample.']) assert.ok(copy.includes(text), text);
});

test('a flow that uses an unknown module, has steps of its own beside it, or has too few or too many steps fails the import', () => {
  assert.throws(() => blocksOf([{ section_id: 'p', kind: 'process_steps', uses: 'sampling' }]), /uses sampling, which is not in the package's site_modules \(order_process\)/);
  assert.throws(() => blocksOf([{ section_id: 'p', kind: 'process_steps', uses: 'order_process', steps: order.steps }]), /one or the other/);
  assert.throws(() => blocksOf([{ section_id: 'p', kind: 'process_steps', steps: order.steps.slice(0, 2) }]), /needs 3 to 6 steps, has 2/);
  assert.throws(() => blocksOf([{ section_id: 'p', kind: 'process_steps', steps: [...order.steps, ...order.steps.slice(0, 3)] }]), /needs 3 to 6 steps, has 7/);
  assert.throws(() => blocksOf([{ section_id: 'p', kind: 'process_steps', steps: [{ ...order.steps[0], we_do: '' }, ...order.steps.slice(1)] }]), /step 1 needs a name and what we do/);
  // Expanding twice changes nothing (the import and its input key both expand).
  const once = withSiteModules(pkg([{ section_id: 'p', kind: 'process_steps', uses: 'order_process' }]));
  assert.deepEqual(withSiteModules(once), once);
});

test('a duration, a figure and a price are stated in a fact they cite; the cited facts exist and are approved', () => {
  const check = (sections) => verifyKindFacts(withSiteModules(pkg(sections)).pages[0], facts);
  check([{ section_id: 'p', kind: 'process_steps', uses: 'order_process' }]);
  const step = (duration, fact_ids) => [{ section_id: 'p', kind: 'process_steps', steps: [order.steps[0], order.steps[2], { ...order.steps[3], duration, fact_ids }] }];
  assert.throws(() => check(step({ min: 30, max: 40, unit: 'days' }, ['f-bulk'])), /the duration 30–40 is not stated in f-bulk/);
  assert.throws(() => check(step({ min: 35, max: 40, unit: 'days' }, [])), /a duration cites no fact/);
  assert.throws(() => check(step({ min: 2, max: 2, unit: 'days' }, ['f-draft'])), /not approved for public use/);
  const figures = (value, fact_ids) => [{ section_id: 'n', kind: 'why_us', presentation: 'figures', heading: 'In numbers', items: [{ value, unit: 'pieces', label: 'Minimum per style', fact_ids }, { value: '10–15', unit: 'days', label: 'Sample time', fact_ids: ['f-sample'] }] }];
  check(figures('50', ['f-moq']));
  assert.throws(() => check(figures('100', ['f-moq'])), /the value "100" is not stated in f-moq/);
  const prices = (amount) => [{ section_id: 'c', kind: 'terms', presentation: 'prices', heading: 'Prices', items: [{ title: 'Sample', price: { amount, unit: 'per style' }, text: 'Credited against your first bulk order.', fact_ids: ['f-sample'] }, { title: 'Bulk', price: { amount: 'USD 50', note: 'per 50 pieces' }, text: 'Priced per style and quantity on your quote.', fact_ids: ['f-sample'] }] }];
  check(prices('USD 50'));
  assert.throws(() => check(prices('USD 45')), /the price "USD 45" is not stated in f-sample/);
  // Without facts to check them against, the import stops.
  assert.throws(() => verifyKindFacts(withSiteModules(pkg(figures('50', ['f-moq']))).pages[0], null), /--facts is needed/);
});

test('figures, price cards, swatches and a photo group become valid blocks, every word on the page', () => {
  const blocks = blocksOf([
    { section_id: 'n', kind: 'why_us', presentation: 'figures', heading: 'In numbers', body: 'What a first order looks like.', items: [{ value: '50', unit: 'pieces', label: 'Minimum per style', fact_ids: ['f-moq'] }, { value: '10–15', unit: 'days', label: 'Sample time', fact_ids: ['f-sample'] }] },
    { section_id: 'c', kind: 'terms', presentation: 'prices', heading: 'Prices', items: [{ title: 'Sample', price: { amount: 'USD 50', unit: 'per style', note: 'credited on bulk' }, text: 'Credited against your first bulk order.', fact_ids: ['f-sample'] }, { title: 'Second sample', price: { amount: 'USD 50' }, text: 'Each further round of the same style.', fact_ids: ['f-sample'] }] },
    { section_id: 's', kind: 'materials', presentation: 'swatches', heading: 'Colours in stock', items: [{ name: 'Black', colour: '#111111', composition: '80% nylon, 20% spandex' }, { name: 'Coral', colour: '#ff7f50' }, { name: 'Sand' }] },
    { section_id: 't', kind: 'materials', presentation: 'photos', heading: 'Trims', items: [{ title: 'Gold rings' }, { title: 'Sliders' }, { title: 'Clasps' }] },
  ]);
  const [stats, pricing, swatches, gallery] = ['stats', 'pricing', 'swatches', 'gallery'].map((type) => blocks.find((block) => block.type === type));
  assert.deepEqual(stats.items[0], { value: '50', unit: 'pieces', label: 'Minimum per style' });
  assert.deepEqual(stats.paragraphs, ['What a first order looks like.']);
  assert.deepEqual(pricing.items[0], { heading: 'Sample', price: { amount: 'USD 50', unit: 'per style', note: 'credited on bulk' }, text: 'Credited against your first bulk order.' });
  assert.deepEqual(swatches.items.map((item) => item.name), ['Black', 'Coral', 'Sand']);
  assert.deepEqual([gallery.items, gallery.mediaKind], [[{ caption: 'Gold rings' }, { caption: 'Sliders' }, { caption: 'Clasps' }], 'material']);
  // The photo group asks for a trims photo per caption (the kind's photography class).
  assert.deepEqual(mediaSlots(gallery, 'grid', {}), ['material', 'material', 'material']);
  const built = { id: 'p', route: '/p/', pageType: 'product_manufacturer', status: 'authored', seo: { title: 'T', description: 'D', canonical: '/p/' }, jsonLd: [], hero: { heading: 'H' }, blocks };
  assert.deepEqual(validateAuthoringPages([built]), []);
  const copy = pageCopy(built);
  for (const text of ['pieces', 'USD 50', 'per style', 'credited on bulk', '80% nylon, 20% spandex', 'Gold rings']) assert.ok(copy.includes(text), text);
  // What a variant leaves out by design is not copy to place: a table as cards shows no first column heading, a
  // closing form band no button.
  const table = { id: 't', type: 'table', heading: 'Plans', columns: ['Plan', 'Calls'], rows: [['Base', 'One a month']] };
  const closing = { id: 'cta', type: 'cta', heading: 'Talk to us', cta: { label: 'Request a Quote', href: '/quote/' }, links: [] };
  const variants = { table: 'cards', cta: 'form' };
  assert.deepEqual(pageCopy({ blocks: [table, closing] }, null, (block) => variants[block.type]), ['Plans', 'Calls', 'Base', 'One a month', 'Talk to us']);
  assert.deepEqual(pageCopy({ blocks: [table, closing] }), ['Plans', 'Plan', 'Calls', 'Base', 'One a month', 'Talk to us', 'Request a Quote']);
  // A colour that is no hex colour, a photo with words it would not show, a card without its amount: refused.
  assert.deepEqual(validateAuthoringPages([{ ...built, blocks: [{ ...swatches, items: [{ name: 'Red', colour: 'red' }, ...swatches.items] }] }]).map((error) => error.replace(/^.*\.items/, 'items')), ['items[0].colour must be a hex colour (#rrggbb)']);
  assert.throws(() => planKindBlocks(page([{ section_id: 't', kind: 'materials', presentation: 'photos', heading: 'Trims', items: [{ title: 'Rings', text: 'Gold-plated brass.' }, { title: 'Sliders' }] }])), /a photo is captioned by its title/);
  assert.throws(() => planKindBlocks(page([{ section_id: 'c', kind: 'terms', presentation: 'prices', heading: 'Prices', items: [{ title: 'Sample', price: {}, text: 'x' }, { title: 'Bulk', price: { amount: 'USD 1' }, text: 'y' }] }])), /item 1 needs price\.amount/);
});

test('a related link to a page held out of the index is not copy to place: the block does not show it (site13 blind audit H-4)', async () => {
  const { pageCopy } = await import('../lib/site-pages.mjs');
  const related = { id: 'related', type: 'relatedPages', heading: 'More', links: [{ label: 'Blog', href: '/blog/' }, { label: 'About us', href: '/about/' }] };
  const built = new Set(['/', '/blog/', '/about/']);
  assert.deepEqual(pageCopy({ blocks: [related] }, built, null, new Set(['/', '/about/'])), ['More', 'About us']);
  assert.deepEqual(pageCopy({ blocks: [related] }, built), ['More', 'Blog', 'About us']);
});
