import assert from 'node:assert/strict';
import test from 'node:test';

import { chartErrors } from '../lib/blog.mjs';
import { chartOfData, dataErrors, isChartData } from '../lib/visual-data.mjs';
import { mediaIntents, mediaSlots, withSectionVisuals } from '../lib/media-slots.mjs';
import { validateAuthoringPages } from '../lib/authoring-contract.mjs';

const data = (shape, items) => ({ id: `${shape}-1`, type: 'data', caption: 'Caption', data: { shape, items } });

test('each kind of data is drawn one way: only time on a scale, specs as figures, options as a table', () => {
  assert.equal(chartOfData({ shape: 'amounts', items: [{ label: 'Inventory', value: 5600, unit: 'USD' }, { label: 'Development', value: 750, unit: 'USD' }] }).kind, 'bar');
  assert.equal(chartOfData({ shape: 'periods', items: [{ label: 'Samples', start: '2026-07-01', end: '2026-07-15' }, { label: 'Bulk', start: '2026-07-31', end: '2026-09-09' }] }).kind, 'timeline');
  assert.deepEqual(chartOfData({ shape: 'periods', items: [{ label: 'Standard sample', min: 10, max: 15, unit: 'days' }, { label: 'Bulk manufacturing', min: 35, max: 40, unit: 'days' }] }), { kind: 'ranges', unit: 'days', items: [{ label: 'Standard sample', min: 10, max: 15 }, { label: 'Bulk manufacturing', min: 35, max: 40 }] });
  // Outseams of 16–22 inches are a spec, read in the text: not drawn, neither as a bar on a scale nor as a repeat card
  // (owner 2026-10-30); the steps are the process module.
  assert.equal(isChartData({ shape: 'ranges', items: [{ label: "Men's outseam", min: 16, max: 22, unit: 'inches' }] }), false);
  assert.equal(isChartData({ shape: 'sequence', items: [] }), false);
  assert.equal(isChartData({ shape: 'amounts', items: [] }), true);
  assert.equal(chartOfData({ shape: 'shares', items: [{ label: 'Nylon', percent: 80 }, { label: 'Spandex', percent: 20 }] }).kind, 'shares');
  const comparison = chartOfData({ shape: 'comparison', items: { options: ['Stock', 'Custom'], rows: [{ label: 'Cost', values: ['None', 'Sample fees'] }] } });
  assert.deepEqual(comparison, { kind: 'comparison', options: ['Stock', 'Custom'], rows: [{ label: 'Cost', values: ['None', 'Sample fees'] }] });
  for (const chart of [comparison, chartOfData({ shape: 'ranges', items: [{ label: 'Fabric minimum', min: 100, max: 450, unit: 'metres' }] })]) assert.deepEqual(chartErrors(chart), []);
  assert.deepEqual(dataErrors({ shape: 'shares', items: [{ label: 'Nylon', percent: 80 }, { label: 'Spandex', percent: 10 }] }), ['data (shares) must add up to 100']);
  assert.deepEqual(dataErrors({ shape: 'sequence', items: [{ label: 'Brief' }, { label: 'Sample' }] }), ['data (sequence) needs 3 to 7 items']);
});

test('a section\'s visuals place themselves: steps follow as the process module, a text section asking for a photo becomes a photo row, a row with data makes no photo', () => {
  const steps = data('sequence', [{ label: 'Brief', detail: 'Send styles.' }, { label: 'Sample' }, { label: 'Bulk', detail: 'Usually 35 to 40 days.' }]);
  const photo = { id: 'p1', type: 'photo', content: 'A worker at a sewing machine.', setting: 'Sewing floor' };
  const blocks = withSectionVisuals([
    { id: 'a', type: 'splitMedia', heading: 'Order steps', paragraphs: ['x'], visuals: [steps] },
    { id: 'b', type: 'intro', heading: 'Why us', paragraphs: ['y'], visuals: [photo] },
    { id: 'c', type: 'intro', heading: 'No ask', paragraphs: ['z'] },
  ], { process: 'circles' });
  assert.deepEqual(blocks.map((block) => `${block.id}:${block.type}`), ['a:splitMedia', 'a-steps:process', 'b:splitMedia', 'c:intro']);
  // The caption names the steps: their heading, as written (swimwear 2026-11-15); a sentence-long one leads them.
  assert.deepEqual(blocks[1], { id: 'a-steps', type: 'process', heading: 'Caption', steps: [{ heading: 'Brief', text: 'Send styles.' }, 'Sample', { heading: 'Bulk', text: 'Usually 35 to 40 days.' }], variant: 'circles', continues: 'a' });
  const sentence = 'Every order runs through the same five steps, from the brief you send to the shipment we book for you.';
  const [, long] = withSectionVisuals([{ id: 'a', type: 'splitMedia', heading: 'Order steps', paragraphs: ['x'], visuals: [{ ...steps, caption: sentence }] }], { process: 'circles' });
  assert.deepEqual([long.heading, long.paragraphs], [undefined, [sentence]]);
  // The steps block is a valid page block; the row with data gets no photo; the asked photo takes the row's position.
  assert.deepEqual(validateAuthoringPages([{ id: 'p', route: '/p/', pageType: 'product_manufacturer', status: 'authored', seo: { title: 'T', description: 'D', canonical: '/p/' }, jsonLd: [], hero: { heading: 'H' }, blocks: [blocks[1]] }]), []);
  // Steps shown without a photo (circles) leave the row its own; steps over a photo of the work (photo-cards) take it.
  assert.deepEqual(mediaSlots(blocks[0], 'single', {}), ['process']);
  const overPhoto = withSectionVisuals([{ id: 'a', type: 'splitMedia', heading: 'Order steps', paragraphs: ['x'], visuals: [steps] }], { process: 'photo-cards' });
  assert.deepEqual(mediaSlots(overPhoto[0], 'single', {}), []);
  // A row whose data is only specs keeps its photo.
  assert.deepEqual(mediaSlots({ id: 'r', type: 'splitMedia', paragraphs: ['x'], visuals: [data('ranges', [{ label: 'Outseam', min: 16, max: 22, unit: 'inches' }])] }, 'single', {}), ['process']);
  assert.deepEqual(mediaIntents(blocks[2], 'single', {}), [{ ...photo, section: 'Why us' }]);
  // The closing band's steps come before it: the band stays the page's last word.
  const closing = withSectionVisuals([{ id: 'cta', type: 'cta', heading: 'Start', paragraphs: ['x'], visuals: [steps] }], { process: 'circles' });
  assert.deepEqual(closing.map((block) => `${block.id}:${block.type}`), ['cta-steps:process', 'cta:cta']);
  assert.equal(closing[0].continues, undefined);
});
