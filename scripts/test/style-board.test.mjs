import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { sectionModuleNames, styleBoard } from '../lib/style-board.mjs';

const text = (id, words, extra = {}) => ({ id, type: 'intro', heading: 'Heading', paragraphs: [Array.from({ length: words }, () => 'word').join(' ')], ...extra });
const grid = (id, items) => ({ id, type: 'featureGrid', heading: 'Cards', items: items.map((words, index) => ({ heading: `Card ${index}`, paragraphs: [Array.from({ length: words }, () => 'word').join(' ')] })) });

test('the style board holds every module the written pages use, with its longest and shortest copy, and says which no competitor section shows', () => {
  const components = { intro: 'text', pageTypes: {} };
  const pages = [
    { route: '/', pageType: 'home', status: 'authored', blocks: [text('a', 40), grid('g', [30, 30, 30])] },
    { route: '/s/', pageType: 'solution', status: 'authored', blocks: [text('b', 300), text('c', 12), { id: 'p', type: 'prose', paragraphs: ['x'] }] },
    // A placeholder's copy is no real copy: its 900 words are not the longest sample.
    { route: '/x/', pageType: 'solution', status: 'placeholder', blocks: [text('d', 900)] },
  ];
  const sectionModules = [{ pageType: 'home', index: 1, module: 'intro/proof' }, { pageType: 'home', index: 2, module: 'figure', gap: 'layout' }];
  const board = styleBoard(pages, components, sectionModules);
  assert.deepEqual(board.modules.map((module) => [module.key, module.uses, module.samples.map((sample) => `${sample.role} ${sample.route} ${sample.blockId} ${sample.words}`)]), [
    ['intro:text', 3, ['longest /s/ b 301', 'shortest /s/ c 13']],
    // A card grid with no variant of its own is drawn as cards (FeatureGridBlock's default): named so.
    ['featureGrid:cards', 1, ['only / g 97']],
    // The photo wall the renderer adds to a content page (lib/media-slots.mjs withMediaModules) is a module too.
    ['gallery:mosaic', 1, ['only /s/ media-module-1 0']],
  ]);
  assert.deepEqual(board.modules[0].evidence, [{ pageType: 'home', index: 1, module: 'intro/proof' }]);
  assert.deepEqual(board.unbacked, ['featureGrid:cards', 'gallery:mosaic'], 'the blog\'s prose is not a module; the cards and the wall have no competitor section');
  // The names a competitor section may have for a module: a photo band renders the competitor's full-width figures.
  assert.deepEqual(sectionModuleNames('gallery', 'band'), ['gallery:band', 'figure']);
  assert.deepEqual(sectionModuleNames('testimonials', 'carousel'), ['owner:testimonials', 'testimonials:carousel']);
});

test('the board is shot module by module beside the competitor sections it renders; its gate waits for a review of every module and holds on an open P0/P1 of the site', async () => {
  const { default: sharp } = await import('sharp');
  const { prepareStyleBoard, prepareDesignReview, styleBoardGate } = await import('../design-review.mjs');
  const root = await mkdtemp(join(tmpdir(), 'style-board-'));
  await mkdir(join(root, 'src/data'), { recursive: true });
  await writeFile(join(root, 'src/data/style-board.json'), JSON.stringify({ route: '/style-board/', modules: [
    { key: 'intro:text', evidence: [{ pageType: 'home', index: 1, module: 'intro/proof' }], samples: [{ role: 'only', route: '/', blockId: 'a', words: 40 }] },
    { key: 'featureGrid:cards', evidence: [], samples: [{ role: 'only', route: '/', blockId: 'g', words: 90 }] },
  ] }));
  await mkdir(join(root, 'docs/research/pattern-sections/home'), { recursive: true });
  await sharp({ create: { width: 1440, height: 300, channels: 3, background: '#eeeeee' } }).png().toFile(join(root, 'docs/research/pattern-sections/home/01-text.png'));
  const shoot = async (_browser, _url, viewport) => ({ image: await sharp({ create: { width: viewport.width, height: 900, channels: 3, background: '#ffffff' } }).png().toBuffer(), modules: { 'intro:text': { top: 0, bottom: 400, blocks: [{ id: 'a', type: 'intro', top: 20, height: 300 }] }, 'featureGrid:cards': { top: 400, bottom: 900, blocks: [] } } });
  const manifest = await prepareStyleBoard({ baseUrl: 'http://x.test/', root, shoot });
  assert.deepEqual(manifest.board.map((entry) => [entry.key, entry.unbacked, entry.images.length]), [['board--intro-text', false, 2], ['board--featureGrid-cards', true, 2]]);
  assert.deepEqual(manifest.board[0].blocks.desktop, [{ id: 'a', type: 'intro', top: 20, height: 300 }]);
  assert.ok((await readFile(join(root, 'docs/research/style-board/board-desktop.png'))).length > 0, 'the whole board is kept for the owner');
  assert.equal((await styleBoardGate({ root })).status, 'missing');
  const review = (key, findings) => writeFile(join(root, 'docs/research/design-review', `${key}.review.json`), JSON.stringify({ shots: manifest.board.find((entry) => entry.key === key).shots, rules: manifest.board.find((entry) => entry.key === key).rules, findings }));
  await review('board--intro-text', []);
  await review('board--featureGrid-cards', [{ block: 'g', viewport: 'desktop', severity: 'P0', scope: 'site', issue: 'heavy borders' }]);
  const open = await styleBoardGate({ root });
  assert.equal(open.status, 'open');
  assert.deepEqual(JSON.parse(await readFile(join(root, 'docs/research/style-board-review.json'), 'utf8')).unbacked, ['featureGrid:cards']);
  await review('board--featureGrid-cards', [{ block: 'g', viewport: 'desktop', severity: 'P0', scope: 'template', issue: 'needs a layout' }]);
  assert.equal((await styleBoardGate({ root })).status, 'passed', 'a template finding is listed, not holding this site');
  // The design is settled only once the board's and the pages' reviews have both passed.
  const { designSettled, settleDesign } = await import('../design-review.mjs');
  assert.deepEqual(await settleDesign({ root }), { settled: false, why: ["the pages' review is not done"] });
  await writeFile(join(root, 'docs/research/design-review.json'), JSON.stringify({ status: 'passed', shots: 'p' }));
  assert.equal(designSettled(root), false);
  assert.equal((await settleDesign({ root })).settled, true);
  assert.equal(designSettled(root), true);
  // The pages' shots taken later keep the board's in the manifest.
  await writeFile(join(root, 'site.json'), JSON.stringify({ reference: { origin: 'https://example.com', pages: {} } }));
  const pages = await prepareDesignReview({ baseUrl: 'http://x.test/', root, shoot: async () => { throw new Error('no page to shoot'); } });
  assert.equal(pages.board.length, 2);
});
