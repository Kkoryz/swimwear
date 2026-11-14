import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { derivePageFigures } from '../derive-page-figures.mjs';
import { normalizeText, pageText, parseFigures, pickFigures } from '../lib/page-figures.mjs';

const terms = 'The MOQ is 50 pieces per style. A sample takes 10 to 15 days. Bulk takes 35 to 40 days.';
const page = (route, extra = '', pageType = 'product_manufacturer') => ({ route, pageType, hero: { heading: route }, blocks: [
  { id: 'terms', type: 'table', rows: [[terms]] },
  { id: 'own', type: 'splitMedia', paragraphs: [extra] },
  { id: 'cases', type: 'caseStudies', items: [{ value: '600', label: 'pieces in the launch' }] },
  { id: 'owner-factory', type: 'stats', items: [{ value: '280', label: 'staff' }] },
] });

test("a page's band: figures its text states word for word, its own before the terms most pages state", () => {
  const pages = [page('/hardware/', 'Stock hardware ships in 3–7 days, with a typical MOQ of 100–500 pieces.'), page('/a/'), page('/b/'), page('/c/')];
  const siteTexts = pages.map((item) => normalizeText(pageText(item)));
  const text = pageText(pages[0]);
  assert.ok(!text.includes('600') && !text.includes('280'), 'case studies and the owner stand-ins are left out');
  const picked = pickFigures([
    { value: '50 pieces', label: 'Minimum per style' },
    { value: '3-7 days', label: 'Stock hardware lead time' },
    { value: '100–500 pieces', label: 'Stock hardware MOQ' },
    { value: '10 to 15 days', label: 'Sample time' },
    { value: '4 weeks', label: 'Worked out' },
    { value: '35 to 40 days', label: 'Bulk production time for orders' },
  ], text, siteTexts);
  assert.deepEqual(picked.map((figure) => figure.value), ['3-7 days', '100–500 pieces', '50 pieces', '10 to 15 days'], 'not in the text, or a long label: dropped; a dash variant still matches');
  assert.deepEqual(pickFigures([{ value: '50 pieces', label: 'MOQ' }, { value: '10 to 15 days', label: 'Sample' }, { value: '35 to 40 days', label: 'Bulk' }, { value: '50 pieces', label: 'MOQ again' }], pageText(pages[1]), siteTexts).map((figure) => figure.label), ['MOQ', 'Sample', 'Bulk'], 'with none of its own, three of the common ones');
  assert.deepEqual(pickFigures([{ value: 'fast', label: 'Speed' }], terms, siteTexts), [], 'a figure has a number');
  const money = 'A 40% surcharge applies under 50 pieces. Our price is US$2.40 per piece; a mould costs $175. For example 80% nylon. Rings come in 6 to 50 mm.';
  assert.deepEqual(pickFigures([{ value: '40%', label: 'Small order surcharge' }, { value: 'US$2.40', label: 'Bulk' }, { value: '$175', label: 'Mould' }, { value: '80% nylon', label: 'Example blend' }, { value: '6 to 50 mm', label: 'Ring sizes' }], money, [normalizeText(money)]).map((figure) => figure.value), ['6 to 50 mm'], 'no money and no examples, whatever the judge lists');
  assert.deepEqual(parseFigures('thinking\n{"figures":[{"value":" 50 pieces ","label":"MOQ"},{"value":3}]}'), [{ value: '50 pieces', label: 'MOQ' }]);
  assert.throws(() => parseFigures('{"x":1}'), /no figures/);
});

test('page figures are read once per page text; the home, about and legal pages are not read', async () => {
  const root = await mkdtemp(join(tmpdir(), 'page-figures-'));
  await mkdir(join(root, 'src/data'), { recursive: true });
  const pages = [page('/', '', 'home'), page('/about/', '', 'about'), page('/privacy/', '', 'privacy'), page('/hardware/', 'Stock hardware ships in 3–7 days.'), page('/a/')];
  await writeFile(join(root, 'src/data/authoring-pages.json'), JSON.stringify(pages));
  const asked = [];
  const run = async ({ prompt, lastMessage }) => {
    const route = prompt.match(/one page \((\S+)\)/)[1];
    asked.push(route);
    await writeFile(lastMessage, JSON.stringify({ figures: route === '/hardware/' ? [{ value: '3–7 days', label: 'Stock lead time' }, { value: '50 pieces', label: 'MOQ' }] : [{ value: '50 pieces', label: 'MOQ' }] }));
    return { code: 0, stderr: '' };
  };
  const first = await derivePageFigures({ root, run, concurrency: 1 });
  assert.deepEqual(asked.sort(), ['/a/', '/hardware/']);
  assert.deepEqual(first.figures, { '/hardware/': [{ value: '3–7 days', label: 'Stock lead time' }, { value: '50 pieces', label: 'MOQ' }], '/a/': [{ value: '50 pieces', label: 'MOQ' }] });
  assert.deepEqual(JSON.parse(await readFile(join(root, 'src/data/page-figures.json'), 'utf8')), first.figures);
  asked.length = 0;
  await derivePageFigures({ root, run });
  assert.deepEqual(asked, [], 'an unchanged page is not read again');
  pages[4].blocks[1].paragraphs = ['Rings come in 6 to 50 mm.'];
  await writeFile(join(root, 'src/data/authoring-pages.json'), JSON.stringify(pages));
  await derivePageFigures({ root, run });
  assert.deepEqual(asked, ['/a/'], 'a changed page is read again');
  const failing = await derivePageFigures({ root: await (async () => { const other = await mkdtemp(join(tmpdir(), 'page-figures-')); await mkdir(join(other, 'src/data'), { recursive: true }); await writeFile(join(other, 'src/data/authoring-pages.json'), JSON.stringify([page('/a/')])); return other; })(), run: async () => ({ code: 1, stderr: 'at capacity' }) });
  assert.deepEqual(failing.failures.map((failure) => failure.route), ['/a/']);
  assert.deepEqual(failing.figures, {}, 'a page not read has no band yet');
});
