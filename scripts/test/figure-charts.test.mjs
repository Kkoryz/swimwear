import assert from 'node:assert/strict';
import test from 'node:test';

import { chartErrors } from '../lib/blog.mjs';
import { figureChart, timeIn } from '../lib/figure-charts.mjs';

// Strandmill's women's swimwear page (site13, 2026-11-17): its figures band and the section that states the times.
const page = {
  route: '/women-s-swimwear-manufacturer/',
  pageType: 'product_manufacturer',
  blocks: [
    { id: 'm1', type: 'text', heading: 'Women\'s swimwear made to your design', paragraphs: ['We cut and sew in Guangzhou.'] },
    { id: 'm6', type: 'featureGrid', heading: 'Lead times', items: [{ heading: 'Samples', text: 'Samples take 10 to 15 days.' }, { heading: 'Bulk', text: 'Bulk production takes 35 to 40 days from approval; MOQ is 50 pieces per style colour.' }] },
    { id: 'cta', type: 'cta', heading: 'Start in 10 to 15 days', cta: { label: 'Quote', href: '/quote/' } },
  ],
};
const figures = [
  { value: '2 to 3 working days', label: 'Quotation turnaround' },
  { value: '50 pieces', label: 'Minimum per style colour' },
  { value: '35 to 40 days', label: 'Bulk production time' },
  { value: '10 to 15 days', label: 'Sample lead time' },
];

test('a time is read only where a text states exactly one, its unit as written', () => {
  assert.deepEqual(timeIn('10 to 15 days', { whole: true }), { min: 10, max: 15, unit: 'days', stated: '10 to 15 days' });
  assert.deepEqual(timeIn('2–3 weeks', { whole: true }), { min: 2, max: 3, unit: 'weeks', stated: '2–3 weeks' });
  assert.deepEqual(timeIn('7 working day', { whole: true }).unit, 'working days');
  assert.equal(timeIn('50 pieces', { whole: true }), null);
  assert.equal(timeIn('10 to 15 days, then 35 days'), null, 'two times: which one is the row\'s is not guessed');
  assert.equal(timeIn('about 10 to 15 days', { whole: true }), null, 'a figure is the time and nothing else');
  assert.deepEqual(timeIn('Samples are ready in 7-10 days after the deposit.'), { min: 7, max: 10, unit: 'days', stated: '7-10 days' });
});

test('the page\'s lead times are drawn on one scale after the section that states them, from its data only (four-site audit 2026-11-17, G8)', () => {
  const drawn = figureChart(page, page.blocks, { figures });
  assert.equal(drawn.after, 'm6', 'the section stating both times, not the closing band');
  assert.deepEqual(drawn.chart, { kind: 'ranges', unit: 'days', items: [{ label: 'Bulk production time', min: 35, max: 40 }, { label: 'Sample lead time', min: 10, max: 15 }], alt: 'Bulk production time: 35 to 40 days; Sample lead time: 10 to 15 days' });
  assert.deepEqual(chartErrors(drawn.chart), [], 'a chart the template draws (ArticleChart ranges)');
  // Working days are not days: no number is converted, the lone working-days figure is left out.
  assert.ok(!drawn.chart.items.some((item) => item.label === 'Quotation turnaround'));
});

test('the order terms table and the trust figures the page states count; a contract term, one time or a time chart of Site Factory\'s draw nothing', () => {
  const terms = { id: 'owner-orderTerms', type: 'table', columns: ['Order step', 'Terms'], rows: [['Sampling', 'Samples are ready in 7-10 days.'], ['Bulk production', 'Bulk orders ship in 30-45 days.'], ['MOQ', '100 pieces per style.']] };
  const fromTerms = figureChart({ route: '/x/' }, [terms]);
  assert.deepEqual(fromTerms.chart.items, [{ label: 'Sampling', min: 7, max: 10 }, { label: 'Bulk production', min: 30, max: 45 }]);
  assert.equal(fromTerms.after, 'owner-orderTerms');
  // A site trust figure counts only where the page states it; the same time twice is drawn once.
  const trust = { items: [{ value: '30-45 days', label: 'Bulk lead time' }, { value: '5 days', label: 'Dispatch time' }] };
  assert.deepEqual(figureChart({ route: '/x/' }, [terms], { trust }).chart.items.map((item) => item.label), ['Sampling', 'Bulk production']);
  // Staylumen's launch time beside its cancellation notice: a notice is no lead time, one time is left.
  const notice = [{ id: 's1', type: 'text', paragraphs: ['Launch in 7–14 days. Cancel with 30 days notice.'] }];
  assert.equal(figureChart({ route: '/y/' }, notice, { figures: [{ value: '7–14 days', label: 'Launch time' }, { value: '30 days', label: 'Cancellation notice' }] }), null);
  // Times no section states are not drawn; nor are they on a page that draws its own periods.
  assert.equal(figureChart({ route: '/z/' }, [{ id: 'a', type: 'text', paragraphs: ['Nothing here.'] }], { figures }), null);
  assert.equal(figureChart(page, [...page.blocks, { id: 'v', type: 'text', paragraphs: ['x'], visuals: [{ type: 'data', data: { shape: 'periods', items: [] } }] }], { figures }), null);
  assert.equal(figureChart(page, page.blocks, { figures: figures.slice(0, 2) }), null, 'fewer than two times');
});
