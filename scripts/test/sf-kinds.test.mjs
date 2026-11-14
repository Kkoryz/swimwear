import assert from 'node:assert/strict';
import test from 'node:test';

import { importSiteFactory } from '../import-site-factory.mjs';
import { validateAuthoringPages } from '../lib/authoring-contract.mjs';
import { BLOCK_KINDS, competitorStyles, overLength, planKindBlocks } from '../lib/sf-kinds.mjs';
import { repeatedModules } from '../lib/visual-checks.mjs';

const items = (count, seed) => Array.from({ length: count }, (_, index) => ({ title: `${seed} ${index + 1}`, text: `The ${seed} point number ${index + 1} in one sentence.` }));
const kindPage = (sections, overrides = {}) => ({
  page_id: 'bikini', url: '/bikini/', title: 'T', meta_description: 'D', h1: 'Bikini maker', release_status: 'ready_for_template', hold_reasons: [], links: [],
  cta: { target_url: '/contact/', label: 'Request a quote' }, structured_data: [], sections, ...overrides,
});
const sections = [
  { section_id: 'a', kind: 'intro', heading: 'Bikinis for your brand', body: 'We make bikinis for brands. '.repeat(10) },
  { section_id: 'b', kind: 'why_us', heading: 'Why brands choose us', body: '', items: items(4, 'Reason') },
  { section_id: 'c', kind: 'customization', heading: 'What you can customise', body: 'Every part can follow your spec.', items: items(5, 'Option') },
  { section_id: 'd', kind: 'terms', heading: 'Order terms', body: 'Orders start at 50 pieces per style in each colour; samples take 10 to 15 days and cost USD 50.' },
  { section_id: 'e', kind: 'process_steps', heading: 'How an order runs', body: 'Five steps from brief to shipment.', items: items(4, 'Step') },
  { section_id: 'f', kind: 'quality_control', presentation: 'list', heading: 'Quality checks', body: '', items: items(3, 'Check') },
  { section_id: 'g', kind: 'faq', heading: 'Questions', body: 'Can we order small?\nYes, from 50 pieces.\n\nHow long do samples take?\nTen to fifteen days.' },
  { section_id: 'h', kind: 'cta', heading: 'Start your bikini line', body: 'Send your brief and we reply within a day.' },
];

test('a section\'s visuals go with its first block (a grid split in two carries them once)', () => {
  const visuals = [{ id: 'v1', type: 'photo', content: 'A worker pairs fabric with lining.', setting: 'Fabric room' }];
  const { blocks } = planKindBlocks(kindPage(sections.map((section) => (section.section_id === 'c' ? { ...section, visuals } : section))));
  assert.deepEqual(blocks.filter((block) => block.visuals).map((block) => [block.id, block.visuals]), [['c', visuals]]);
});

test('the closing section\'s visuals go with the closing band, a closing section going on adding its own (none were dropped)', () => {
  const steps = { id: 's1', type: 'data', caption: 'From enquiry to sample', data: { shape: 'sequence', items: [{ label: 'Send the brief' }, { label: 'Get the quote' }, { label: 'Approve the sample' }] } };
  const more = { id: 's2', type: 'photo', content: 'A sales lead on a video call.', setting: 'Office' };
  const page = kindPage([...sections.slice(0, -1), { ...sections.at(-1), visuals: [steps] }, { section_id: 'h~2', kind: 'cta', continuation_of: 'h', heading: '', body: 'Or write to us.', visuals: [more] }]);
  const cta = planKindBlocks(page).blocks.at(-1);
  assert.deepEqual([cta.type, cta.visuals], ['cta', [steps, more]]);
  assert.equal(planKindBlocks(kindPage(sections)).blocks.at(-1).visuals, undefined);
});

test('a page written by kind keeps its sections\' order, each in the component of its kind and the competitor\'s style', () => {
  const styles = competitorStyles([{ id: 'x', block: 'iconList', variant: 'icons' }, { id: 'y', block: 'featureGrid', variant: 'numbered' }, { id: 'z', block: 'cta', variant: 'image-band' }]);
  const { blocks, mapping } = planKindBlocks(kindPage(sections), { styles });
  assert.deepEqual(blocks.map((block) => `${block.id}:${block.type}${block.variant ? `:${block.variant}` : ''}`), ['a:intro', 'b:iconList:icons', 'c:featureGrid:numbered', 'c-2:featureGrid:numbered', 'd:proof', 'e:process', 'f:iconList:icons', 'g:faq', 'cta:cta:image-band']);
  // Five cards: a grid of three with the heading and lead, then two; the steps carry their lead.
  assert.deepEqual([blocks[2].items.length, blocks[3].items.length, blocks[2].heading, blocks[3].heading], [3, 2, 'What you can customise', undefined]);
  // The second grid goes on from the first: the audit counts one card section, not two (Fable 2026-11-11).
  assert.deepEqual([blocks[2].continues, blocks[3].continues], [undefined, 'c']);
  assert.deepEqual(repeatedModules([...blocks.slice(2, 4), { ...blocks[2], id: 'x' }].map(({ id, type, continues }) => ({ id, type, continues }))), []);
  assert.deepEqual(blocks[2].paragraphs, ['Every part can follow your spec.']);
  assert.deepEqual(blocks[5].paragraphs, ['Five steps from brief to shipment.']);
  assert.deepEqual(blocks[5].steps[0], { heading: 'Step 1', text: 'The Step point number 1 in one sentence.' });
  assert.equal(blocks[4].mediaKind, 'material');
  assert.deepEqual(blocks.at(-1).paragraphs, ['Send your brief and we reply within a day.']);
  assert.equal(mapping.length, sections.length);
  assert.deepEqual(validateAuthoringPages([{ id: 'p', route: '/p/', pageType: 'product_manufacturer', status: 'authored', seo: { title: 'T', description: 'D', canonical: '/p/' }, jsonLd: [], hero: { heading: 'H' }, blocks }]), []);
});

test("a list's untitled line (an empty title, as the contract allows) is a line without a heading; cards with one show as a list (site10's packaging prices)", () => {
  const styles = competitorStyles([{ id: 'x', block: 'iconList', variant: 'icons' }]);
  const prices = { section_id: 'p', kind: 'customization', heading: 'Prices', body: '', items: [{ title: 'Pillow boxes', text: '$0.9 per box.' }, { title: '', text: 'Each has a minimum of 200 pieces.' }] };
  const { blocks, mapping } = planKindBlocks(kindPage([sections[0], prices, sections.at(-1)]), { styles });
  assert.deepEqual([blocks[1].type, blocks[1].variant, blocks[1].items], ['iconList', 'icons', [{ heading: 'Pillow boxes', text: '$0.9 per box.' }, { text: 'Each has a minimum of 200 pieces.' }]]);
  assert.match(mapping[1].rule, /an item has no title/);
  assert.deepEqual(validateAuthoringPages([{ id: 'p', route: '/p/', pageType: 'product_manufacturer', status: 'authored', seo: { title: 'T', description: 'D', canonical: '/p/' }, jsonLd: [], hero: { heading: 'H' }, blocks }]), []);
  assert.throws(() => planKindBlocks(kindPage([{ ...prices, items: [{ title: 'Empty', text: ' ' }] }, sections.at(-1)])), /item 1 needs a text/);
});

test('a section longer than its component holds is rendered as written and reported, with the import report naming it', () => {
  assert.deepEqual(overLength(kindPage(sections)), [], 'the sample page keeps within the table');
  const long = { section_id: 'long', kind: 'intro', heading: 'About the brand', body: 'word '.repeat(130) };
  assert.deepEqual(overLength(kindPage([long, sections.at(-1)])), [{ route: '/bikini/', sectionId: 'long', kind: 'intro', component: 'intro', words: 130, maximum: 100 }]);
  const { report } = importSiteFactory({ authoringPackage: { schema_version: 'sf/authoring/v1', project: 't', pages: [kindPage([long, sections.at(-1)])] }, pagesPlan: { pages: [{ page_id: 'bikini', page_type: 'product_manufacturer', label: 'Bikini', url: '/bikini/' }], header_nav: [], footer_nav: [] } });
  assert.deepEqual(report.overLength.map((item) => item.sectionId), ['long']);
});

test("a customization, process or product-range section may go on as a table (SF's price grid on the rash guard page, owner via SF 2026-10-27)", () => {
  const grid = { section_id: 'c~2', kind: 'customization', presentation: 'table', continuation_of: 'c', heading: '', body: '| Quantity | 1 colour | 2 colours |\n|---|---:|---:|\n| 100-249 | 1.80 | 2.40 |\n| 250-499 | 1.30 | 1.75 |' };
  for (const kind of ['customization', 'process_steps', 'product_range']) assert.equal(BLOCK_KINDS.kinds[kind].presentations.table, 'table');
  const { blocks } = planKindBlocks(kindPage([sections[0], sections[2], grid, sections.at(-1)]));
  const table = blocks.find((block) => block.id === 'c~2');
  assert.deepEqual([table.type, table.continues, table.heading, table.rows.length], ['table', 'c', undefined, 2]);
});

test('a section that goes on from another (continuation_of) renders as the same section: its component, no heading of its own, marked as continuing the first block', () => {
  // "" is the contract's default: no continuation (SF's 2026-10-27 package writes it on every first section).
  const first = { section_id: 'm', kind: 'materials', heading: 'Fabrics we cut', continuation_of: '', body: 'First part of the fabrics. '.repeat(20) };
  const more = ['m~2', 'm~3'].map((id) => ({ section_id: id, kind: 'materials', continuation_of: 'm', body: `Words of ${id} as written. `.repeat(20) }));
  const { blocks, mapping } = planKindBlocks(kindPage([sections[0], first, ...more, sections.at(-1)]));
  assert.deepEqual(blocks.slice(1, 4).map((block) => [block.id, block.type, block.heading ?? null, block.continues ?? null]), [['m', 'splitMedia', 'Fabrics we cut', null], ['m~2', 'splitMedia', null, 'm'], ['m~3', 'splitMedia', null, 'm']]);
  assert.deepEqual(blocks[2].paragraphs, [more[0].body.trim()]);
  assert.deepEqual(mapping.filter((entry) => entry.sectionId.startsWith('m~')).map((entry) => entry.rule), ['kind materials (prose), continuing m', 'kind materials (prose), continuing m']);
  assert.deepEqual(validateAuthoringPages([{ id: 'p', route: '/p/', pageType: 'product_manufacturer', status: 'authored', seo: { title: 'T', description: 'D', canonical: '/p/' }, jsonLd: [], hero: { heading: 'H' }, blocks }]), []);
  // It goes on from a section before it, of its kind.
  assert.throws(() => planKindBlocks(kindPage([more[0], first, sections.at(-1)])), /m~2 continues m, which is not a section before it/);
  assert.throws(() => planKindBlocks(kindPage([first, { ...more[0], kind: 'intro' }, sections.at(-1)])), /m~2 continues m, a materials section, as intro/);
  // A text block without a heading that continues nothing is still refused.
  assert.ok(validateAuthoringPages([{ id: 'p', route: '/p/', pageType: 'product_manufacturer', status: 'authored', seo: { title: 'T', description: 'D', canonical: '/p/' }, jsonLd: [], hero: { heading: 'H' }, blocks: [{ ...blocks[2], continues: undefined }] }]).some((error) => /heading is required/.test(error)));
});

test('a renamed block (its section id a source URL) is still the one its continuations name', async () => {
  const { pageBlockIds } = await import('../lib/sf-sections.mjs');
  const url = 'https://example.com/bikinis#s4';
  const renamed = pageBlockIds([{ id: url, type: 'splitMedia' }, { id: `${url}~2`, type: 'splitMedia', continues: url }, { id: 'kept', type: 'intro' }, { id: 'kept~2', type: 'intro', continues: 'kept' }]);
  assert.deepEqual(renamed.map((block) => [block.id, block.continues ?? null]), [['splitMedia-1', null], ['splitMedia-2', 'splitMedia-1'], ['kept', null], ['intro-1', 'kept']], 'a continuation id (<id>~2) is no block id either');
});

test('a kind the table does not know, a presentation a kind does not have, or a section without a kind fails the import', () => {
  assert.throws(() => planKindBlocks(kindPage([{ ...sections[0], kind: 'gallery_wall' }])), /unknown kind gallery_wall/);
  assert.throws(() => planKindBlocks(kindPage([{ ...sections[4], presentation: 'cards' }])), /cannot be presented as cards; it can be steps/);
  assert.throws(() => planKindBlocks(kindPage([sections[0], { section_id: 'x', heading: 'H', body: 'b' }])), /has no kind/);
  assert.throws(() => planKindBlocks(kindPage([{ ...sections[1], items: [] }])), /no items/);
  // Every kind of the table renders with a component the importer knows.
  for (const [kind, entry] of Object.entries(BLOCK_KINDS.kinds)) for (const component of Object.values(entry.presentations)) assert.ok(BLOCK_KINDS.components[component], `${kind} -> ${component}`);
});

test('an imported page written by kind is not reordered by the blueprint, shows its order steps once and places proof beside its section', () => {
  const plan = { pages: [{ page_id: 'bikini', page_type: 'product_manufacturer', label: 'Bikini', url: '/bikini/' }, { page_id: 'contact', page_type: 'contact', label: 'Contact', url: '/contact/' }], header_nav: [], footer_nav: [] };
  const structured = { process_steps: [{ title: 'Brief', text: 'Send the brief.', fact_ids: [] }] };
  const blueprints = { product_manufacturer: [{ id: 'faq', block: 'faq', fill: 'copy' }, { id: 'intro', block: 'intro', fill: 'copy' }, { id: 'orderTerms', block: 'orderTerms', fill: 'owner' }, { id: 'cta', block: 'cta', fill: 'copy' }] };
  const proof = { terms: { columns: ['Step', 'Terms'], rows: [['MOQ', '50 pieces']] } };
  const { pages } = importSiteFactory({ authoringPackage: { schema_version: 'sf/authoring/v1', project: 't', pages: [kindPage(sections, { structured })] }, pagesPlan: plan, facts: new Map(), blueprints, proof });
  const ids = pages[0].blocks.map((block) => block.id);
  assert.deepEqual(ids, ['a', 'b', 'c', 'c-2', 'd', 'owner-orderTerms', 'e', 'f', 'g', 'cta']);
  assert.equal(pages[0].blocks.filter((block) => block.type === 'process').length, 1);
});

test('a section id that is a source URL never reaches the page: its block is renamed <type>-<n>, the id stays in sourceSectionIds', () => {
  const plan = { pages: [{ page_id: 'bikini', page_type: 'product_manufacturer', label: 'Bikini', url: '/bikini/' }, { page_id: 'contact', page_type: 'contact', label: 'Contact', url: '/contact/' }], header_nav: [], footer_nav: [] };
  const urlSections = [
    { ...sections[0], section_id: 'https://competitor.example/bikini#s3' },
    { section_id: 'https://competitor.example/bikini#s4', kind: 'materials', heading: 'Fabrics', body: 'Recycled nylon and spandex with chlorine resistance. '.repeat(5) },
    { section_id: 'splitMedia-1', kind: 'factory', heading: 'Our factory', body: 'Cutting, sewing and checks under one roof. '.repeat(5) },
  ];
  const { pages } = importSiteFactory({ authoringPackage: { schema_version: 'sf/authoring/v1', project: 't', pages: [kindPage(urlSections)] }, pagesPlan: plan, facts: new Map(), blueprints: {} });
  const blocks = pages[0].blocks.filter((block) => block.sourceSectionIds?.length);
  assert.ok(pages[0].blocks.every((block) => !block.id.includes('://')));
  assert.equal(new Set(pages[0].blocks.map((block) => block.id)).size, pages[0].blocks.length);
  assert.deepEqual(blocks.map((block) => block.sourceSectionIds[0]), urlSections.map((section) => section.section_id));
});

test('Site Factory\'s list of layouts it needs is checked against the table: a missing layout, component or word range is reported', async () => {
  const { missingLayouts } = await import('../check-layouts-needed.mjs');
  const needed = (layouts) => ({ schema_version: 'sf/layouts-needed/v1', layouts });
  assert.deepEqual(missingLayouts(needed([{ kind: 'why_us', presentation: 'prose', component: 'splitMedia', words: [35, 104], pages: ['home'] }])), []);
  assert.match(missingLayouts(needed([{ kind: 'factory', presentation: 'list', pages: ['about'] }]))[0], /factory has no list layout \(it has prose, figures\)/);
  assert.match(missingLayouts(needed([{ kind: 'gallery_wall', presentation: 'prose', pages: ['home'] }]))[0], /no kind gallery_wall/);
  assert.match(missingLayouts(needed([{ kind: 'why_us', presentation: 'prose', component: 'proof', pages: ['home'] }]))[0], /planned for proof, the table renders it with splitMedia/);
  assert.match(missingLayouts(needed([{ kind: 'why_us', presentation: 'prose', words: [20, 200], pages: ['home'] }]))[0], /20-200 words, splitMedia holds 35-150/);
  assert.throws(() => missingLayouts({ schema_version: 'x' }), /unsupported/);
});

test('why_us and process_steps may be written as prose: a text and photo row', () => {
  const { blocks } = planKindBlocks(kindPage([sections[0], { section_id: 'p', kind: 'why_us', presentation: 'prose', heading: 'Why brands choose us', body: 'We cut patterns in house and sample in two weeks. '.repeat(4) }]));
  assert.deepEqual([blocks[1].type, blocks[1].mediaKind, blocks[1].paragraphs.length], ['splitMedia', 'process', 1]);
});

test('a section named "cta" that is not the closing band keeps its copy under its own id', () => {
  const { blocks } = planKindBlocks(kindPage([sections[0], { section_id: 'cta', kind: 'faq', presentation: 'prose', heading: 'Tell us about your collection', body: 'Tell us your collection vision and requirements through our website or by email.' }]));
  assert.deepEqual(blocks.map((block) => `${block.id}:${block.type}`), ['a:intro', 'cta-faq:splitMedia', 'cta:cta']);
});

test('a materials section presented as a table renders as a table: its lead above, the GFM table as header and rows, text under it as notes; no table in it fails the import', async () => {
  const { markdownTable } = await import('../lib/markdown-table.mjs');
  const body = [
    'The fabrics we cut most, with what each is for.',
    '',
    '| Fabric | Composition | Weight | Best for |',
    '|:--|:-:|--:|---|',
    '| Recycled nylon | 78% nylon, 22% elastane | 190 gsm | [Bikinis](/bikini-manufacturer/) |',
    '| Polyester \\| PBT | 53% polyester, 47% PBT | 210 gsm | |',
    '| Textured knit | 82% nylon | 240 gsm | One pieces | extra cell |',
    '',
    'Weights are before dyeing.',
  ].join('\n');
  const parsed = markdownTable(body);
  assert.deepEqual(parsed.lead, ['The fabrics we cut most, with what each is for.']);
  assert.deepEqual(parsed.columns, ['Fabric', 'Composition', 'Weight', 'Best for']);
  assert.deepEqual(parsed.rows[1], ['Polyester | PBT', '53% polyester, 47% PBT', '210 gsm', ''], 'an escaped pipe stays in its cell; a missing value stays empty');
  assert.deepEqual(parsed.rows[2], ['Textured knit', '82% nylon', '240 gsm', 'One pieces'], 'cells past the header are dropped, as GFM shows them');
  assert.deepEqual(parsed.after, ['Weights are before dyeing.']);
  assert.equal(markdownTable('A paragraph with a | pipe but no table.'), null);
  const table = { section_id: 'm', kind: 'materials', presentation: 'table', heading: 'Fabrics and their uses', body };
  const { blocks, mapping } = planKindBlocks(kindPage([table]));
  assert.deepEqual({ type: blocks[0].type, columns: blocks[0].columns.length, rows: blocks[0].rows.length, paragraphs: blocks[0].paragraphs, notes: blocks[0].notes }, { type: 'table', columns: 4, rows: 3, paragraphs: ['The fabrics we cut most, with what each is for.'], notes: ['Weights are before dyeing.'] });
  assert.equal(mapping[0].rule, 'kind materials (table)');
  assert.deepEqual(validateAuthoringPages([{ id: 'p', route: '/p/', pageType: 'product_manufacturer', status: 'authored', seo: { title: 'T', description: 'D', canonical: '/p/' }, jsonLd: [], hero: { heading: 'H' }, blocks }]), []);
  assert.throws(() => planKindBlocks(kindPage([{ ...table, body: 'Our fabrics are listed below.' }])), /presented as a table but its body holds no Markdown table/);
});

test("FAQ pairs come from the section's qa (07 since 10-24, the body empty), else its body; more than a block holds go on in blocks of their own, the heading on the first", () => {
  const qa = Array.from({ length: 39 }, (_, index) => ({ question: `Question ${index + 1}?`, answer: `Answer ${index + 1}.` }));
  const { blocks, mapping } = planKindBlocks(kindPage([{ section_id: 'faq', kind: 'faq', heading: 'Frequently asked questions', body: '', qa }]));
  assert.deepEqual(blocks.filter((block) => block.type === 'faq').map((block) => [block.id, block.items.length, block.heading ?? null]), [['faq', 20, 'Frequently asked questions'], ['faq-2', 19, null]]);
  assert.equal(blocks[1].items[0].question, 'Question 21?', 'in order');
  assert.equal(mapping[0].rule, 'kind faq (qa, 39 pairs)');
  assert.deepEqual(validateAuthoringPages([{ id: 'p', route: '/p/', pageType: 'product_manufacturer', status: 'authored', seo: { title: 'T', description: 'D', canonical: '/p/' }, jsonLd: [], hero: { heading: 'H' }, blocks }]), []);
  // A single pair is a FAQ too; a pair without its answer fails the import.
  assert.equal(planKindBlocks(kindPage([{ section_id: 'f', kind: 'faq', heading: 'One question', body: '', qa: [qa[0]] }])).blocks[0].items.length, 1);
  assert.throws(() => planKindBlocks(kindPage([{ section_id: 'f', kind: 'faq', heading: 'Q', body: '', qa: [{ question: 'Why?', answer: '' }] }])), /without its question or answer/);
  // An older package: the pairs in the body.
  assert.equal(planKindBlocks(kindPage([sections[6]])).blocks[0].items.length, 2);
});

test('a scope section (what a piece of work includes and delivers, any trade) renders as prose by default and as cards, a list or a table when it says so', () => {
  assert.deepEqual(Object.keys(BLOCK_KINDS.kinds.scope.presentations), ['prose', 'cards', 'list', 'table', 'steps', 'figures', 'prices']);
  const scope = (id, presentation, extra = {}) => ({ section_id: id, kind: 'scope', ...(presentation ? { presentation } : {}), heading: 'What revenue management covers', body: 'Daily rate reviews against the comp set, weekly pickup reports and a monthly pricing plan the owner signs off. '.repeat(2), ...extra });
  const { blocks } = planKindBlocks(kindPage([sections[0], scope('s1'), scope('s2', 'cards', { body: '', items: items(3, 'Part') }), scope('s3', 'list', { body: '', items: items(3, 'Duty') }), sections.at(-1)]));
  assert.deepEqual(blocks.filter((block) => block.id.startsWith('s')).map((block) => block.type), ['splitMedia', 'featureGrid', 'iconList']);
});
