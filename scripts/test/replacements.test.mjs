import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { applyReplacements, listItems } from '../lib/replacements.mjs';
import { addReplacementList, runReplacements } from '../apply-replacements.mjs';

// owner 2026-11-17 through Site Factory: a built site is not run whole again; its changes come as replacement lists.
const page = () => ({
  id: 'men', route: '/men/', pageType: 'product_manufacturer', status: 'authored',
  seo: { title: 'Men', description: 'D', canonical: '/men/' },
  hero: { heading: 'Men' },
  blocks: [{ id: 'm2', type: 'table', table: { columns: ['A'], rows: [['we grade each style from XS to 3XL free of charge']] } }, { id: 'faq', type: 'faq', items: [{ question: 'Sizes?', answer: 'We grade from XS to 3XL.' }] }],
  jsonLd: [{ '@type': 'FAQPage', mainEntity: [{ '@type': 'Question', name: 'Sizes?', acceptedAnswer: { '@type': 'Answer', text: 'We grade from XS to 3XL.' } }] }],
});

test('a replacement list changes the copy and the structured data of its page, once; what it cannot find is reported', () => {
  const lists = [{ name: '01.json', items: [
    { n: 1, url: '/men/', section: 'm2', old: 'from XS to 3XL free of charge', new: 'from S to 3XL free of charge' },
    { n: 2, url: '/men/', section: 'faq', old: 'We grade from XS to 3XL.', new: 'We grade from S to 3XL.', hits_in_structured_data: 1 },
    { n: 3, url: '/men/', old: 'a sentence no page has', new: 'x' },
    { n: 4, url: '/gone/', old: 'a', new: 'b' },
  ] }];
  const { pages, results } = applyReplacements([page()], lists);
  assert.deepEqual(results.map((item) => item.status), ['replaced', 'replaced', 'missing', 'no-page']);
  assert.deepEqual([results[1].content, results[1].structuredData], [1, 1]);
  assert.equal(pages[0].blocks[0].table.rows[0][0], 'we grade each style from S to 3XL free of charge');
  assert.equal(pages[0].jsonLd[0].mainEntity[0].acceptedAnswer.text, 'We grade from S to 3XL.');
  // Applied again after the next import of the same content: nothing more; on content already replaced: applied.
  const again = applyReplacements(pages, lists);
  assert.deepEqual(again.results.map((item) => item.status), ['applied', 'applied', 'missing', 'no-page']);
  assert.deepEqual(again.pages, pages);
});

test('a new sentence that holds the old one is not applied twice', () => {
  const lists = [{ name: '01.json', items: [{ n: 1, url: '/men/', old: 'free of charge', new: 'free of charge for every style' }] }];
  const once = applyReplacements([page()], lists).pages;
  const twice = applyReplacements(once, lists);
  assert.equal(twice.results[0].status, 'applied');
  assert.equal(twice.pages[0].blocks[0].table.rows[0][0], 'we grade each style from XS to 3XL free of charge for every style');
});

test('the lists are kept in the site and applied in their order; a missing sentence fails the step and is listed', async () => {
  const root = await mkdtemp(join(tmpdir(), 'replacements-'));
  await mkdir(join(root, 'src/data'), { recursive: true });
  await writeFile(join(root, 'src/data/authoring-pages.json'), JSON.stringify([page()]));
  await writeFile(join(root, 'fix1.json'), JSON.stringify([{ n: 1, url: '/men/', old: 'XS to 3XL free', new: 'S to 3XL free' }]));
  await addReplacementList(root, join(root, 'fix1.json'), '01-fix1');
  await assert.rejects(addReplacementList(root, join(root, 'fix1.json'), '01-fix1'), /is there already/);
  const report = await runReplacements({ root });
  assert.deepEqual([report.replaced, report.applied, report.missing.length], [1, 0, 0]);
  assert.match(JSON.parse(await readFile(join(root, 'src/data/authoring-pages.json'), 'utf8'))[0].blocks[0].table.rows[0][0], /from S to 3XL free/);
  assert.match(await readFile(join(root, 'docs/research/replacements.md'), 'utf8'), /本次替换 1 条/);
  assert.throws(() => listItems([{ url: '/a/', new: 'x' }]), /needs url, old and new/);
});

test("Site Factory's source forms are matched on the structure 08 keeps: a table row, a list item, a data visual's fields (site13 2026-11-17)", () => {
  const built = { id: 'p', route: '/p/', blocks: [
    { id: 'm5', type: 'table', table: { columns: ['Spec', 'Value'], rows: [['Grading increments', '4–5 cm in girth and 4 cm in torso girth for each size.']] } },
    { id: 'm6', type: 'iconList', items: [{ heading: 'Market safety requirements', text: 'Our products are made to CPSIA, CCPSA and SASO requirements, and we arrange order-specific lab tests. Every stage follows standards.' }] },
    { id: 'faq', type: 'faq', visuals: [{ type: 'data', data: { items: [{ label: 'Embroidered sample', min: 10, max: 15, unit: 'days' }] } }] },
  ], jsonLd: [] };
  const items = [
    { n: 5, url: '/p/', old: '| Grading increments | 4–5 cm in girth and 4 cm in torso girth for each size. |', new: '| Grading increments | 4 cm in girth for each size. |' },
    { n: 21, url: '/p/', old: '- **Market safety requirements**: Our products are made to CPSIA, CCPSA and SASO requirements, and we arrange order-specific lab tests.', new: '- **Market safety requirements**: Order-specific lab tests at cost cover REACH and CPSIA.' },
    { n: 27, url: '/p/', old: '"label": "Embroidered sample"', new: '"label": "Embroidered or appliqué sample"' },
  ];
  const { pages, results } = applyReplacements([built], [{ name: 'fix', items }]);
  assert.deepEqual(results.map((item) => [item.status, item.form]), [['replaced', 'table row'], ['replaced', 'list item'], ['replaced', 'fields']]);
  assert.deepEqual(pages[0].blocks[0].table.rows[0], ['Grading increments', '4 cm in girth for each size.']);
  assert.equal(pages[0].blocks[1].items[0].text, 'Order-specific lab tests at cost cover REACH and CPSIA. Every stage follows standards.');
  assert.deepEqual(pages[0].blocks[2].visuals[0].data.items[0], { min: 10, max: 15, unit: 'days', label: 'Embroidered or appliqué sample' });
  assert.deepEqual(applyReplacements(pages, [{ name: 'fix', items }]).results.map((item) => item.status), ['applied', 'applied', 'applied']);
});

test('a card written as **Heading**: text without a dash is matched as a list item (RateHarbor careers 2026-11-17)', () => {
  const built = { id: 'c', route: '/careers/', blocks: [{ id: 'm4', type: 'featureGrid', items: [{ heading: 'Send Your Application', text: 'Use our [contact form](/contact-us/) to send your CV and a short note saying which role you want.' }, { heading: 'Interview', text: 'We call you within a week.' }] }], jsonLd: [] };
  const item = { n: 1, url: '/careers/', old: '**Send Your Application**: Use our [contact form](/contact-us/) to send your CV and a short note saying which role you want.', new: '**Send Your Application**: Email your CV and a short note saying which role you want to the address on our [contact page](/contact-us/).' };
  const { pages, results } = applyReplacements([built], [{ name: 'fix', items: [item] }]);
  assert.deepEqual([results[0].status, results[0].form], ['replaced', 'list item']);
  assert.equal(pages[0].blocks[0].items[0].text, 'Email your CV and a short note saying which role you want to the address on our [contact page](/contact-us/).');
});

test('an item named in skipped.json is not applied and does not fail the step (MotelPilot full_1117a_fix1 #1, 2026-11-17)', async () => {
  const root = await mkdtemp(join(tmpdir(), 'replacements-skip-'));
  await mkdir(join(root, 'src/data'), { recursive: true });
  await mkdir(join(root, 'content/replacements'), { recursive: true });
  await writeFile(join(root, 'src/data/authoring-pages.json'), JSON.stringify([page()]));
  await writeFile(join(root, 'content/replacements/01-fix.json'), JSON.stringify([{ n: 1, url: '/men/', old: 'an earlier version of a lead', new: 'a later earlier version' }, { n: 2, url: '/men/', old: 'XS to 3XL free', new: 'S to 3XL free' }]));
  await writeFile(join(root, 'content/replacements/skipped.json'), JSON.stringify({ '01-fix.json#1': 'the package already has the line' }));
  const report = await runReplacements({ root });
  assert.deepEqual([report.replaced, report.skipped, report.missing.length], [1, 1, 0]);
  assert.match(await readFile(join(root, 'docs/research/replacements.md'), 'utf8'), /跳过：the package already has the line/);
  // An addition (an empty old: Strandmill fix4 #4, a section the site's package patch adds) is no replacement: skipped,
  // it is not checked; not skipped, the list is refused.
  await writeFile(join(root, 'content/replacements/02-add.json'), JSON.stringify([{ n: 1, url: '/men/', old: '', new: '## A new section' }]));
  await assert.rejects(runReplacements({ root }), /replacement 1 needs url, old and new/);
  await writeFile(join(root, 'content/replacements/skipped.json'), JSON.stringify({ '01-fix.json#1': 'the package already has the line', '02-add.json#1': 'added by the package patch' }));
  assert.equal((await runReplacements({ root })).skipped, 2);
});

test('an open table row whose last cell is cut matches by its start; cards are removed by an empty new (Strandmill fix2 2026-11-18)', () => {
  const pages = [{ route: '/cover/', blocks: [
    { id: 'm3', type: 'table', rows: [['Standard sizing', 'We offer S-XL, S-L and one size. For your market, we also make plus sizes.'], ['Other', 'x']] },
    { id: 'f', type: 'featureGrid', items: [{ heading: 'Our own factory', paragraphs: ['We make it.'] }, { heading: 'Matching family sets', paragraphs: ['We grade one design.'] }, { heading: "Children's print placement", paragraphs: ['We adjust the scale.'] }] },
  ] }];
  const items = [
    { n: 6, url: '/cover/', old: '| Standard sizing | We offer S-XL, S-L and one size.', new: '| Standard sizing | Cover-ups are an exception: we offer S-XL, S-L and one size.' },
    { n: 55, url: '/cover/', old: "- **Matching family sets**: We grade one design.\n- **Children's print placement**: We adjust the scale.", new: '' },
  ];
  const { pages: next, results } = applyReplacements(pages, [{ name: 'fix2', items }]);
  assert.deepEqual(results.map((item) => [item.n, item.status, item.form]), [[6, 'replaced', 'table row'], [55, 'replaced', 'cards removed']]);
  assert.deepEqual(next[0].blocks[0].rows[0], ['Standard sizing', 'Cover-ups are an exception: we offer S-XL, S-L and one size. For your market, we also make plus sizes.']);
  // One card left: the set becomes its text under its heading (settleCardSets).
  assert.deepEqual([next[0].blocks[1].type, next[0].blocks[1].paragraphs], ['intro', ['We make it.']]);
  // Run again: both are applied already, nothing grows or goes twice.
  const again = applyReplacements(next, [{ name: 'fix2', items }]);
  assert.deepEqual(again.results.map((item) => item.status), ['applied', 'applied']);
  assert.deepEqual(again.pages, next);
});

test("the blog hub's copy (src/data/blog.json) is the page at /blog/ for the lists (Strandmill fix2 #52 2026-11-18)", async () => {
  const root = await mkdtemp(join(tmpdir(), 'replacements-blog-'));
  await mkdir(join(root, 'src/data'), { recursive: true });
  await mkdir(join(root, 'content/replacements'), { recursive: true });
  await writeFile(join(root, 'src/data/authoring-pages.json'), JSON.stringify([page()]));
  await writeFile(join(root, 'src/data/blog.json'), JSON.stringify({ title: 'Blog', blocks: [{ id: 'o', type: 'intro', paragraphs: ['One all-in price covers freight to your door.'] }], source: { pageId: 'site:blog' } }));
  await writeFile(join(root, 'content/replacements/01.json'), JSON.stringify([{ n: 52, url: '/blog/', old: 'covers freight to your door.', new: 'covers freight to your door through our forwarding partners.' }]));
  const report = await runReplacements({ root });
  assert.equal(report.replaced, 1);
  const blog = JSON.parse(await readFile(join(root, 'src/data/blog.json'), 'utf8'));
  assert.equal(blog.blocks[0].paragraphs[0], 'One all-in price covers freight to your door through our forwarding partners.');
  assert.deepEqual(Object.keys(blog), ['title', 'blocks', 'source'], 'kept as it was, no route or structured data added');
  const pages = JSON.parse(await readFile(join(root, 'src/data/authoring-pages.json'), 'utf8'));
  assert.equal(pages.some((item) => item.route === '/blog/'), false);
});

test("Staylumen fix2's forms: numbered steps, a visual's object with its braces, a row added, quoted fragments, list items added, plain text in the structured data; a second pass changes nothing (2026-11-18)", () => {
  const pages = [{ route: '/x/', blocks: [
    { id: 's', type: 'process', steps: [{ heading: 'Review before arrival', text: 'We check the photos 3 hours before.' }] },
    { id: 'v', type: 'comparison', data: { rows: [{ label: 'Full management fee', values: ['10%', '10%'] }, { label: 'Edits', values: ['Yes', 'No'] }], note: 'About 30% lower' } },
    { id: 't', type: 'iconList', items: [{ heading: 'Partners', text: 'We arrange partners.' }] },
    { id: 'faq', type: 'faq', items: [{ question: 'Q', answer: 'Rentals of 30 days need no license.' }] },
  ], jsonLd: [{ '@type': 'FAQPage', mainEntity: [{ '@type': 'Question', name: 'Q', acceptedAnswer: { '@type': 'Answer', text: 'Rentals of 30 days need no license.' } }] }] }];
  const items = [
    { n: 15, url: '/x/', old: '2. **Review before arrival**: We check the photos 3 hours before.', new: '2. **Review before arrival**: We check the photos as soon as they come.' },
    { n: 61, url: '/x/', old: '{"label": "Edits", "values": ["Yes", "No"]}', new: '{"label": "Edits", "values": ["Yes", "Pricing only"]}' },
    { n: 63, url: '/x/', old: '{"label": "Full management fee", "values": ["10%", "10%"]}', new: '{"label": "Full management fee", "values": ["10%", "10%"]}, {"label": "Software fee", "values": ["USD 100", "USD 100"]}' },
    { n: 64, url: '/x/', old: '"About 30% lower"', new: '"About 30% lower (winter 2020 release)"' },
    { n: 27, url: '/x/', old: '- **Partners**: We arrange partners.', new: '- **Partners**: We arrange partners.\n- **Fees**: 10% of revenue.\n- **Notice**: 30 days.' },
    { n: 48, url: '/x/', old: 'Rentals of 30 days need no license.', new: 'Rentals of 30 days need no [license](https://city.example/license).' },
  ];
  const first = applyReplacements(pages, [{ name: 'fix2', items }]);
  assert.deepEqual(first.results.map((item) => [item.n, item.status]), items.map((item) => [item.n, 'replaced']));
  const [page] = first.pages;
  assert.equal(page.blocks[0].steps[0].text, 'We check the photos as soon as they come.');
  assert.deepEqual(page.blocks[1].data.rows.map((row) => [row.label, row.values[1]]), [['Full management fee', '10%'], ['Software fee', 'USD 100'], ['Edits', 'Pricing only']]);
  assert.equal(page.blocks[1].data.note, 'About 30% lower (winter 2020 release)');
  assert.deepEqual(page.blocks[2].items.map((item) => item.heading), ['Partners', 'Fees', 'Notice']);
  assert.equal(page.blocks[3].items[0].answer, 'Rentals of 30 days need no [license](https://city.example/license).');
  assert.equal(page.jsonLd[0].mainEntity[0].acceptedAnswer.text, 'Rentals of 30 days need no license.', 'the structured data keeps plain text');
  const second = applyReplacements(first.pages, [{ name: 'fix2', items }]);
  assert.deepEqual(second.pages, first.pages, 'nothing grows or is added twice');
  assert.ok(second.results.every((item) => item.status === 'applied'), JSON.stringify(second.results));
});

test('an item a later list changed again is superseded, and a sentence cut stays applied (Strandmill fix1 #3, fix2 #82)', () => {
  const pages = [{ route: '/', blocks: [{ id: 'a', type: 'intro', paragraphs: ['In sizes XS to 3XL, and up to 5XL. Our blend gives UPF 50 protection.'] }] }];
  const lists = [
    { name: 'fix1', items: [{ n: 3, url: '/', old: 'In sizes XS to 3XL, and up to 5XL.', new: 'In sizes XS to 3XL (S to 3XL for men), and up to 5XL.' }] },
    { name: 'fix2', items: [{ n: 2, url: '/', old: 'In sizes XS to 3XL (S to 3XL for men), and up to 5XL.', new: "In sizes XS to 3XL (S to 3XL for men's styles), and up to 5XL." }, { n: 82, url: '/', old: ' Our blend gives UPF 50 protection.', new: '' }] },
  ];
  const first = applyReplacements(pages, lists);
  assert.deepEqual(first.results.map((item) => item.status), ['replaced', 'replaced', 'replaced']);
  const second = applyReplacements(first.pages, lists);
  assert.deepEqual(second.results.map((item) => item.status), ['superseded', 'applied', 'applied']);
});

test("a row's first cells match a row of more columns, its later cells kept; an old over a blank line is found across paragraphs (RateHarbor fix2 #12, MotelPilot fix2 #73)", () => {
  const pages = [{ route: '/x/', blocks: [
    { id: 't', type: 'table', rows: [['Self-run after setup', 'We recalibrate every 6 to 8 weeks.', 'You review the rates.']] },
    { id: 'o', type: 'intro', paragraphs: ['You hear back in a day. From there, onboarding goes like this:', '1. Send us your details.\n2. Finish the handover.', 'Questions? Write to us.'] },
  ] }];
  const items = [
    { n: 12, url: '/x/', old: '| Self-run after setup | We recalibrate every 6 to 8 weeks. |', new: '| Self-run after setup | You book recalibration revisits. |' },
    { n: 73, url: '/x/', old: 'From there, onboarding goes like this:\n\n1. Send us your details.\n2. Finish the handover.', new: 'From there, onboarding takes two steps: you send us your details and finish the handover.' },
  ];
  const first = applyReplacements(pages, [{ name: 'fix2', items }]);
  assert.deepEqual(first.results.map((item) => item.status), ['replaced', 'replaced']);
  assert.deepEqual(first.pages[0].blocks[0].rows[0], ['Self-run after setup', 'You book recalibration revisits.', 'You review the rates.']);
  assert.deepEqual(first.pages[0].blocks[1].paragraphs, ['You hear back in a day. From there, onboarding takes two steps: you send us your details and finish the handover.', 'Questions? Write to us.']);
  const second = applyReplacements(first.pages, [{ name: 'fix2', items }]);
  assert.deepEqual(second.pages, first.pages);
  assert.deepEqual(second.results.map((item) => item.status), ['applied', 'applied']);
});

test('a blog post is the page at /blog/<slug>/ for the lists, written back as it was kept (MotelPilot 2026-11-18)', async () => {
  const root = await mkdtemp(join(tmpdir(), 'replacements-posts-'));
  await mkdir(join(root, 'src/data'), { recursive: true });
  await mkdir(join(root, 'content/replacements'), { recursive: true });
  await writeFile(join(root, 'src/data/authoring-pages.json'), JSON.stringify([page()]));
  // Posts as the blog takes them (lib/blog.mjs): the lists are applied, then the pages' dates recorded on every page.
  const post = (slug, paragraph) => ({ slug, status: 'review', title: slug, seo: { title: slug, description: `${slug} in short.` }, lead: [`${slug} answered first.`], datePublished: '2026-11-18', dateModified: '2026-11-18', author: { type: 'Organization', name: 'Co' }, sections: [{ heading: 'H', paragraphs: [paragraph] }] });
  const posts = [post('fees', 'We work with owners in the United States; learn more.'), post('other', 'Another post.')];
  await writeFile(join(root, 'src/data/blog-posts.json'), JSON.stringify(posts));
  await writeFile(join(root, 'content/replacements/03.json'), JSON.stringify([{ n: 1, url: '/blog/fees/', old: 'owners in the United States; learn', new: 'owners in countries including the United States and Canada; learn' }]));
  assert.equal((await runReplacements({ root })).replaced, 1);
  const after = JSON.parse(await readFile(join(root, 'src/data/blog-posts.json'), 'utf8'));
  assert.equal(after[0].sections[0].paragraphs[0], 'We work with owners in countries including the United States and Canada; learn more.');
  assert.deepEqual(Object.keys(after[0]), Object.keys(posts[0]));
  assert.deepEqual(after[1], posts[1]);
  assert.equal((await runReplacements({ root })).applied, 1, 'applied once only');
  // Every page's date is recorded on its content as replaced (aloha audit 2026-11-18 L-5: one lastmod of 46 in the sitemap).
  const dates = JSON.parse(await readFile(join(root, 'src/data/page-dates.json'), 'utf8'));
  assert.ok(['/blog/fees/', '/blog/other/', page().route].every((route) => dates[route]), Object.keys(dates).join(', '));
});

test('an FAQ entry written as its question and answer over a blank line replaces the question and the answer kept apart, in the FAQPage too (Strandmill fix3 #12 2026-11-18)', () => {
  const pages = [{ route: '/modest/', blocks: [{ id: 'faq', type: 'faq', items: [{ question: 'Will burkinis be accepted at public pools?', answer: 'Our burkinis use swim-specific nylon, and pools accept them.' }] }],
    jsonLd: [{ '@type': 'FAQPage', mainEntity: [{ '@type': 'Question', name: 'Will burkinis be accepted at public pools?', acceptedAnswer: { '@type': 'Answer', text: 'Our burkinis use swim-specific nylon, and pools accept them.' } }] }] }];
  const items = [{ n: 12, url: '/modest/', old: 'Will burkinis be accepted at public pools?\n\nOur burkinis use swim-specific nylon,', new: 'Are your modest sets accepted at public pools?\n\nOur modest sets use swim-specific nylon,' }];
  const first = applyReplacements(pages, [{ name: 'fix3', items }]);
  assert.equal(first.results[0].status, 'replaced');
  assert.deepEqual(first.pages[0].blocks[0].items[0], { question: 'Are your modest sets accepted at public pools?', answer: 'Our modest sets use swim-specific nylon, and pools accept them.' });
  assert.equal(first.pages[0].jsonLd[0].mainEntity[0].name, 'Are your modest sets accepted at public pools?');
  assert.equal(first.pages[0].jsonLd[0].mainEntity[0].acceptedAnswer.text, 'Our modest sets use swim-specific nylon, and pools accept them.');
  const second = applyReplacements(first.pages, [{ name: 'fix3', items }]);
  assert.deepEqual(second.pages, first.pages);
  assert.equal(second.results[0].status, 'applied');
});

test('card sets left too thin by removed cards are settled: an empty grid goes, a single card joins its set or becomes its text (Strandmill 2026-11-18)', async () => {
  const { settleCardSets } = await import('../lib/replacements.mjs');
  const card = (heading) => ({ heading, paragraphs: [`${heading} text.`] });
  const page = { route: '/x/', blocks: [
    { id: 'a', type: 'featureGrid', heading: 'Factory', items: [card('Own factory')] },
    { id: 'a-2', type: 'featureGrid', continues: 'a', items: [card('B'), card('C'), card('D')] },
    { id: 'm8', type: 'featureGrid', heading: 'Labels', items: [card('E'), card('F'), card('G')] },
    { id: 'm8-2', type: 'featureGrid', continues: 'm8', items: [] },
    { id: 'solo', type: 'featureGrid', heading: 'Safety', items: [card('Tested')] },
  ] };
  const settled = settleCardSets(page);
  assert.deepEqual(settled.blocks.map((block) => `${block.id}:${block.type}:${block.items?.length ?? block.paragraphs.length}`), ['a:featureGrid:4', 'm8:featureGrid:3', 'solo:intro:1']);
  assert.deepEqual(settled.blocks[2], { id: 'solo', type: 'intro', heading: 'Safety', paragraphs: ['Tested text.'] });
  assert.deepEqual(settleCardSets(settled), settled, 'settled once');
});

test("the trust bar, Site Factory's site-level field (section trust_bar, no page), has its value replaced whole, never the words in a sentence (aloha 2026-11-17)", () => {
  const trust = { route: '#trust_bar', items: [{ value: '350 independent', label: 'Independent labels', note: 'We produce for more than 350 independent labels.' }] };
  const lists = [{ name: 'fix.json', items: [{ n: 1, url: '?', section: 'trust_bar', old: '350 independent', new: '350' }] }];
  const { pages, results } = applyReplacements([trust], lists);
  assert.deepEqual([results[0].status, pages[0].items[0].value, pages[0].items[0].note], ['replaced', '350', 'We produce for more than 350 independent labels.']);
  assert.equal(applyReplacements(pages, lists).results[0].status, 'applied');
});

test('an empty new whose old is a section\'s heading takes the section out, with the blocks going on from it; a visual of a section goes by its id (blog hubs 2026-11-18)', () => {
  const page = { route: '/blog/', blocks: [
    { id: 'overview', type: 'intro', sourceSectionIds: ['overview'], heading: 'Intro', paragraphs: ['Guides.'], visuals: [{ id: 'overview_production_time', type: 'data' }, { id: 'keep', type: 'data' }] },
    { id: 'table-1', type: 'table', sourceSectionIds: ['overview_2'], heading: 'Certifications, Fabrics and Design', columns: ['A'], rows: [['b']] },
    { id: 'table-1-2', type: 'table', continues: 'table-1', columns: ['A'], rows: [['c']] },
    { id: 'cta', type: 'cta', sourceSectionIds: ['cta'], heading: 'Talk to us', cta: { label: 'Contact', href: '/contact/' } },
  ] };
  const items = [
    { n: 6, url: '/blog/', section: 'overview_2', old: 'Certifications, Fabrics and Design', new: '' },
    { n: 7, url: '/blog/', section: 'overview.visuals', old: 'overview_production_time', new: '' },
  ];
  const first = applyReplacements([page], [{ name: 'hub', items }]);
  assert.deepEqual(first.results.map((item) => [item.status, item.form]), [['replaced', 'section removed'], ['replaced', 'visual removed']]);
  assert.deepEqual(first.pages[0].blocks.map((block) => block.id), ['overview', 'cta']);
  assert.deepEqual(first.pages[0].blocks[0].visuals.map((visual) => visual.id), ['keep']);
  const second = applyReplacements(first.pages, [{ name: 'hub', items }]);
  assert.deepEqual(second.results.map((item) => item.status), ['applied', 'applied']);
  assert.deepEqual(second.pages, first.pages);
  // An empty new whose old is a sentence, not a heading, still cuts the sentence.
  const cut = applyReplacements([page], [{ name: 'x', items: [{ n: 1, url: '/blog/', section: 'overview', old: 'Guides.', new: '' }] }]);
  assert.deepEqual(cut.pages[0].blocks[0].paragraphs, ['']);
});

test('a data visual item written "<label>: <detail>" in a section\'s visuals has its label and detail replaced (Strandmill swim_1118b #37)', () => {
  const page = { route: '/kids/', blocks: [{ id: 'iconList-1', type: 'iconList', sourceSectionIds: ['overview_2_2'], items: [], visuals: [{ id: 'q', type: 'data', data: { shape: 'sequence', items: [{ label: 'Cutting', detail: 'Cut pieces are checked' }, { label: 'Random checks', detail: 'Random checks on finished goods' }] } }] }] };
  const items = [{ n: 37, url: '/kids/', section: 'overview_2_2.visuals', old: 'Random checks: Random checks on finished goods', new: 'Random in-line checks: Random checks during production' }];
  const first = applyReplacements([page], [{ name: 'b', items }]);
  assert.deepEqual([first.results[0].status, first.results[0].form], ['replaced', 'visual item']);
  assert.deepEqual(first.pages[0].blocks[0].visuals[0].data.items[1], { label: 'Random in-line checks', detail: 'Random checks during production' });
  assert.equal(applyReplacements(first.pages, [{ name: 'b', items }]).results[0].status, 'applied');
  // A comparison visual's items are an object (Staylumen /san-diego/ m10, 2026-11-18): passed over, not a crash.
  const comparison = { ...page, blocks: [{ ...page.blocks[0], visuals: [{ id: 'c', type: 'data', data: { shape: 'comparison', items: { options: ['A', 'B'], rows: [{ label: 'When', values: ['x', 'y'] }] } } }, ...page.blocks[0].visuals] }] };
  const second = applyReplacements([comparison], [{ name: 'b', items }]);
  assert.equal(second.results[0].status, 'replaced');
  assert.deepEqual(second.pages[0].blocks[0].visuals[0], comparison.blocks[0].visuals[0]);
});
