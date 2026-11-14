import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { fitLabel, judgeImageFit, pagePhotos } from '../judge-image-fit.mjs';

test("a page's photos come with the heading of the block they sit in; the logo is no photo of the page", () => {
  const html = '<html><body><img src="/logo.png" alt="Brand"><main><section data-authoring-block="hero"><img src="/media/a.webp" alt="A wetsuit"><h1>Wetsuits</h1></section><section data-authoring-block="splitMedia"><h2>Neoprene &amp; seams</h2><img src="/media/b.webp" alt=""></section></main></body></html>';
  assert.deepEqual(pagePhotos(html), [{ src: '/media/a.webp', alt: 'A wetsuit', section: 'Wetsuits' }, { src: '/media/b.webp', alt: '', section: 'Neoprene & seams' }]);
});

test('a reply gives one of the two labels, or none', () => {
  assert.equal(fitLabel('thinking...\n{"label": "wrong_subject"}'), 'wrong_subject');
  assert.equal(fitLabel('{"label": "maybe"}'), null);
  assert.equal(fitLabel(''), null);
});

test('each photo is judged once per page subject and kept by its content: an unchanged photo is not judged again', async () => {
  const root = await mkdtemp(join(tmpdir(), 'image-fit-'));
  await mkdir(join(root, 'src/data'), { recursive: true });
  await mkdir(join(root, 'dist/wetsuit'), { recursive: true });
  await mkdir(join(root, 'dist/media'), { recursive: true });
  await writeFile(join(root, 'src/data/authoring-pages.json'), JSON.stringify([{ id: 'w', route: '/wetsuit/', pageType: 'product_manufacturer', status: 'authored', seo: { title: 'T', description: 'D', canonical: '/wetsuit/' }, jsonLd: [], hero: { heading: 'Wetsuits' }, blocks: [] }]));
  await writeFile(join(root, 'dist/media/a.webp'), 'bikini');
  await writeFile(join(root, 'dist/media/b.webp'), 'bikini');
  await writeFile(join(root, 'dist/wetsuit/index.html'), '<main><section data-authoring-block="hero"><h1>Wetsuits</h1><img src="/media/a.webp" alt="x"><img src="/media/b.webp" alt="y"></section></main>');
  const calls = [];
  const run = async ({ prompt, lastMessage }) => { calls.push(prompt); await writeFile(lastMessage, '{"label": "wrong_subject"}'); return { code: 0, stderr: '' }; };
  const first = await judgeImageFit({ root, run, reads: 2 });
  assert.equal(calls.length, 2, 'two photos of the same content: one judgment, read twice');
  assert.match(calls[0], /page_subject: Wetsuits/);
  assert.deepEqual(first.pages[0].images.map((image) => image.fit), ['wrong_subject', 'wrong_subject']);
  assert.equal(first.agreement, 1);
  calls.length = 0;
  await judgeImageFit({ root, run });
  assert.equal(calls.length, 0, 'unchanged: nothing judged again');
  await writeFile(join(root, 'dist/media/b.webp'), 'a real wetsuit photo');
  await judgeImageFit({ root, run });
  assert.equal(calls.length, 1, 'a changed photo is judged again');
});

test('a library photo judged off its own page\'s subject goes back to generation once; a stand-in, a site-wide photo on a site-wide page and one remade before stay', async () => {
  const { misfits, sendBackMisfits } = await import('../send-back-misfits.mjs');
  const { readFile } = await import('node:fs/promises');
  const photo = (id, category, extra = {}) => ({ id, category, kind: 'product', status: 'generated', web: { src: `/media/photos/${id}-960.webp`, srcset: `/media/photos/${id}-480.webp 480w, /media/photos/${id}-960.webp 960w` }, ...extra });
  const plan = { routes: { '/men/': "men's swimwear", '/about/': 'general' }, entries: [photo('men-case', "men's swimwear"), photo('men-1', "men's swimwear"), photo('general-process-1', 'general', { kind: 'process' }), photo('general-1', 'general'), photo('men-2', "men's swimwear", { fitRemakes: 1 })] };
  const wrong = (id) => ({ src: `/media/photos/${id}-960.webp`, fit: 'wrong_subject' });
  const fit = { pages: [{ route: '/men/', images: [wrong('men-case'), { src: '/media/photos/men-1-960.webp', fit: 'fits' }, wrong('general-process-1'), wrong('men-2')] }, { route: '/about/', images: [wrong('general-1')] }] };
  assert.deepEqual(misfits(plan, fit, ['process']).map(({ entry }) => entry.id), ['men-case']);
  const root = await mkdtemp(join(tmpdir(), 'misfits-'));
  await mkdir(join(root, 'docs/research'), { recursive: true });
  await writeFile(join(root, 'docs/research/image-plan.json'), JSON.stringify(plan));
  await writeFile(join(root, 'docs/research/image-fit.json'), JSON.stringify(fit));
  assert.equal((await sendBackMisfits({ root, check: true })).length, 1);
  await sendBackMisfits({ root });
  const sent = JSON.parse(await readFile(join(root, 'docs/research/image-plan.json'), 'utf8')).entries[0];
  assert.deepEqual([sent.status, sent.fitRemakes], ['rejected-review', 1]);
  assert.equal((await sendBackMisfits({ root })).length, 0, 'not sent back twice');
});
