import assert from 'node:assert/strict';
import test from 'node:test';

import { fitRatio } from '../lib/media-ratio.mjs';
import { varyLongRuns } from '../lib/sf-sections.mjs';
import { heavyCrops, hueDistance, lockPalette, offPalette, photoOverlaps, referenceRuns, repeatedModules, stylesheetColours } from '../lib/visual-checks.mjs';

const split = (id) => ({ id, type: 'splitMedia', heading: id, paragraphs: ['P'], media: null, variant: 'single' });

test('a module repeated more times in a row than the competitor does is found; the import breaks such a run', () => {
  const sectionModules = [
    { pageType: 'home', index: 1, module: 'hero:media-overlay' }, { pageType: 'home', index: 2, module: 'splitMedia:single' },
    { pageType: 'home', index: 3, module: 'skip' }, { pageType: 'home', index: 4, module: 'splitMedia:panel' },
    { pageType: 'home', index: 5, module: 'splitMedia:single' }, { pageType: 'home', index: 6, module: 'intro/proof' },
  ];
  const reference = referenceRuns(sectionModules, 'home');
  assert.equal(reference.splitMedia, 3, 'a skipped section does not break the competitor\'s run');
  const page = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, type: 'splitMedia' }));
  assert.deepEqual(repeatedModules(page, reference), [{ type: 'splitMedia', length: 5, allowed: 3, blocks: ['a', 'b', 'c', 'd', 'e'] }]);
  assert.deepEqual(repeatedModules(page.slice(0, 3), reference), []);
  const faqPage = [{ id: 'intro', type: 'intro' }, ...['f1', 'f2', 'f3', 'f4'].map((id) => ({ id, type: 'faq' })), { id: 'cta', type: 'cta' }];
  assert.deepEqual(repeatedModules(faqPage, {}), [], "an FAQ page's topics one after another are its content");
  assert.deepEqual(repeatedModules([...faqPage.slice(1, 4), ...page], {}).map((run) => run.type), ['faq', 'splitMedia'], 'FAQ sections that are not most of the page still count, as the split run does');
  // Six rows where the competitor shows two at most: every third becomes a centred text section, copy unchanged.
  const varied = varyLongRuns(['a', 'b', 'c', 'd', 'e', 'f'].map(split), 2);
  assert.deepEqual(varied.map((block) => block.type), ['splitMedia', 'splitMedia', 'intro', 'splitMedia', 'splitMedia', 'intro']);
  assert.deepEqual(varied[2], { id: 'c', type: 'intro', heading: 'c', paragraphs: ['P'], variant: 'text' });
  assert.deepEqual(repeatedModules(varied, { splitMedia: 2 }), []);
  // A document (a legal text, an article) is a run of headed text by nature: no run of it is a repeated module.
  const clauses = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, type: 'intro' }));
  assert.equal(repeatedModules(clauses, {}).length, 1);
  for (const pageType of ['privacy', 'blog_post']) assert.deepEqual(repeatedModules(clauses, {}, pageType), []);
  // A section going on in blocks of its own (continues) is one module, however many blocks it takes.
  const goesOn = [{ id: 'a', type: 'intro' }, { id: 'b', type: 'intro' }, ...['b~2', 'b~3', 'b~4'].map((id) => ({ id, type: 'intro', continues: 'b' }))];
  assert.deepEqual(repeatedModules(goesOn, {}), []);
  assert.equal(repeatedModules([...goesOn, { id: 'c', type: 'intro' }], {}).length, 1, 'three sections in a row still are three');
  // A card set laid out as a list (pattern bullets) is a list between two card grids, not a third grid (aloha 2026-11-17).
  const cards = [{ id: 'g1', type: 'featureGrid', pattern: 'media' }, { id: 'm2', type: 'featureGrid', pattern: 'bullets' }, { id: 'g3', type: 'featureGrid', pattern: 'media' }];
  assert.deepEqual(repeatedModules(cards, {}), []);
  assert.equal(repeatedModules(cards.map((block) => ({ ...block, pattern: 'media' })), {}).length, 1);
  // Photo rows placed between the blocks of one section are not a run of photo rows: the section shows between them.
  const broken = [{ id: 'b', type: 'intro' }, ...['b~2', 'b~3', 'b~4'].flatMap((id, index) => [{ id: `g${index}`, type: 'gallery' }, { id, type: 'intro', continues: 'b' }])];
  assert.deepEqual(repeatedModules(broken, {}), []);
  // The import breaks a run the way the audit counts it: a section's blocks go together, a head made text takes its
  // continuations with it, and the next sections are counted past them.
  const rows = [split('a'), split('b'), { ...split('b~2'), continues: 'b' }, split('c'), split('d'), { ...split('d~2'), continues: 'd' }, split('e')];
  const out = varyLongRuns(rows, 2);
  assert.deepEqual(out.map((block) => `${block.id}:${block.type}`), ['a:splitMedia', 'b:splitMedia', 'b~2:splitMedia', 'c:intro', 'd:splitMedia', 'd~2:splitMedia', 'e:splitMedia']);
  assert.deepEqual(repeatedModules(out, { splitMedia: 2 }), []);
  assert.deepEqual(varyLongRuns([split('a'), split('b'), split('c'), { ...split('c~2'), continues: 'c' }], 2).map((block) => block.type), ['splitMedia', 'splitMedia', 'intro', 'intro']);
});

test("where text sits in its column is read from its lines' edges: lines that start together are start-aligned however wide, centred ones have both edges ragged", async () => {
  const { lineAlignment } = await import('../lib/visual-checks.mjs');
  const column = { left: 16, right: 374 };
  const line = (left, right) => ({ left, right, width: right - left });
  // A left-aligned paragraph at phone width: its lines nearly fill the column, so their middles sit on its middle.
  assert.equal(lineAlignment([line(16, 372), line(16, 369), line(16, 373), line(16, 371)], column), 'start');
  assert.equal(lineAlignment([line(40, 350), line(80, 310), line(60, 330)], column), 'centre');
  assert.equal(lineAlignment([line(30, 374), line(120, 374)], column), 'end');
  // One line: where it sits.
  assert.equal(lineAlignment([line(100, 290)], column), 'centre');
  assert.equal(lineAlignment([line(16, 200)], column), 'start');
  assert.equal(lineAlignment([], column), undefined);
});

test('a colour outside the competitor\'s palette is found; the palette\'s colour made darker for contrast is not', () => {
  const palette = lockPalette({ roles: { accent: { value: '#306180' } }, tokens: { '--link': '#08a4ec', '--surface-secondary': '#F7F4EE' } });
  assert.equal(palette.length, 3);
  assert.ok(hueDistance([6, 126, 181], [8, 164, 236]) < 5, 'a darker link blue is the same blue');
  const colours = [{ color: [6, 126, 181], where: 'a' }, { color: [230, 120, 30], where: 'button.cta' }, { color: [120, 120, 120], where: 'p' }, { color: [230, 120, 30], where: 'span' }];
  assert.deepEqual(offPalette(colours, palette).map((item) => [item.color, item.where]), [['rgb(230,120,30)', 'button.cta']]);
  // The treatment's own colours, read from its stylesheet (comments and translucent colours left out).
  assert.deepEqual(stylesheetColours('a { color: #08A4EC; }\n/* #ff0000 */\n.x { background: rgb(247 244 238); box-shadow: 0 0 4px rgba(0,0,0,0.2); }').map((item) => [item.color.join(','), item.where]), [['8,164,236', 'line 1'], ['247,244,238', 'line 3']]);
});

test('photos drawn over one another and photos cropped to under half of themselves are found', () => {
  const photo = (src, x, y, width, height, natural = { width: 1000, height: 1500 }) => ({ src, block: 'b', box: { x, y, width, height }, natural, fit: 'cover' });
  const stacked = [photo('a', 0, 0, 400, 300), photo('b', 200, 150, 400, 300), photo('c', 700, 0, 300, 300)];
  assert.deepEqual(photoOverlaps(stacked).map((pair) => [pair.a, pair.b]), [['a', 'b']]);
  // A 2:3 portrait in a 16:9 frame shows under two fifths of itself (a torso); in a 3:4 card nearly all.
  assert.deepEqual(heavyCrops([photo('wide', 0, 0, 480, 270), photo('tall', 0, 0, 300, 400)]).map((item) => [item.src, item.shown]), [['wide', 0.38]]);
});

test('a block follows its photos\' orientation when its own ratio would show too little of them', () => {
  const portrait = { width: 1000, height: 1500 };
  assert.equal(fitRatio('4 / 3', [portrait, portrait, { width: 1200, height: 800 }]), '0.75 / 1', 'portrait photos: a 3 / 4 frame');
  assert.equal(fitRatio('1 / 1', [portrait]), '1 / 1', 'a square frame still shows two thirds of a portrait');
  assert.equal(fitRatio('4 / 3', [{ width: 1600, height: 1000 }]), '4 / 3');
  assert.equal(fitRatio('4 / 3', [{ slot: 'product' }]), '4 / 3');
  assert.equal(fitRatio('auto', [portrait]), 'auto');
});

test('a photo shown much larger than the rest of its group is found, unless a layout widened it on purpose; an overlay that greys the whole photo is found', async () => {
  const { unevenPhotos, heavyOverlays } = await import('../lib/visual-checks.mjs');
  const photo = (src, width, height, extra = {}) => ({ src, block: 'gallery', box: { x: 0, y: 0, width, height }, natural: { width, height }, fit: 'cover', ...extra });
  // Two small photos side by side and the third across the row (the phone gallery the review flagged).
  assert.deepEqual(unevenPhotos([photo('a', 170, 220), photo('b', 170, 220), photo('c', 350, 450)]).map((item) => [item.src, item.ratio]), [['c', 4.2]]);
  assert.deepEqual(unevenPhotos([photo('a', 170, 220), photo('b', 170, 220), photo('c', 170, 220)]), []);
  assert.deepEqual(unevenPhotos([photo('a', 170, 220), photo('b', 170, 220), photo('c', 350, 450, { explicit: true })]), [], 'a mosaic\'s wide place is meant');
  assert.deepEqual(unevenPhotos([photo('a', 170, 220), photo('c', 350, 450)]), [], 'two photos are no group');
  // A gradient that clears toward the textless side passes; one that greys everything, or a flat dark layer, does not.
  assert.deepEqual(heavyOverlays([{ block: 'hero', alphas: [0.55, 0.3, 0], textShare: 0.45 }]), []);
  assert.deepEqual(heavyOverlays([{ block: 'hero', alphas: [0.6, 0.45], textShare: 0.45 }, { block: 'cta', alphas: [0.5], textShare: 0.4 }]), [{ block: 'hero', lightest: 0.45, textShare: 0.45, clearShare: 0.55 }, { block: 'cta', lightest: 0.5, textShare: 0.4, clearShare: 0.6 }]);
  // A text across the photo (a centred band) wants an even overlay.
  assert.deepEqual(heavyOverlays([{ block: 'cta', alphas: [0.45], textShare: 0.8 }]), []);
  // So does a centred title strip (the copy's column takes half the photo, but neither side is left clear) and a form
  // hero whose copy and form span the photo between them; a copy at the left with the right clear still fails.
  assert.deepEqual(heavyOverlays([{ block: 'hero', alphas: [0.54], textShare: 0.51, clearShare: 0.25 }]), []);
  assert.deepEqual(heavyOverlays([{ block: 'hero', alphas: [0.54], textShare: 0.94, clearShare: 0.03 }]), []);
  assert.deepEqual(heavyOverlays([{ block: 'hero', alphas: [0.54], textShare: 0.51, clearShare: 0.49 }]), [{ block: 'hero', lightest: 0.54, textShare: 0.51, clearShare: 0.49 }]);
});

test('running text whose lines run past the readable measure is found, once per block with its longest line', async () => {
  const { longMeasures } = await import('../lib/visual-checks.mjs');
  assert.deepEqual(longMeasures([{ block: 'overview', lines: 3, ch: 96 }, { block: 'overview', lines: 2, ch: 104 }, { block: 'faq', lines: 4, ch: 70 }]), [{ block: 'overview', ch: 104 }]);
});

test('a heading and its text line up: not one centred over the other set flush, not a few pixels apart; one gutter on phones', async () => {
  const { gutterOutliers, misalignedColumns } = await import('../lib/visual-checks.mjs');
  const column = (headingLeft, headingAlign, textLeft, textAlign) => ({ block: 'b', heading: 'H', headingLeft, headingAlign, textLeft, textAlign });
  // The fix it names: the heading follows its flush text (site10's repair centred the text instead, then flipped back).
  assert.deepEqual(misalignedColumns([column(60, 'centre', 15, 'start')]), [{ block: 'b', heading: 'H', issue: 'mixed_text_alignment', headingAlign: 'centre', textAlign: 'start', fix: 'set the heading flush (text-align: start) on its text\'s left edge; the text stays flush' }]);
  // site10's bikini page: a heading 31px in from its own text.
  assert.deepEqual(misalignedColumns([column(46, 'start', 15, 'start')]), [{ block: 'b', heading: 'H', issue: 'text_edge_offset', offset: 31 }]);
  // On the line, centred both, or a heading set well apart from its text (a layout, not a slip): nothing.
  assert.deepEqual(misalignedColumns([column(15, 'start', 16, 'start'), column(80, 'centre', 20, 'centre'), column(400, 'start', 15, 'start')]), []);
  assert.deepEqual(gutterOutliers([{ route: '/', axis: 26 }, { route: '/a/', axis: 15 }, { route: '/b/', axis: 15 }, { route: '/c/', axis: 16 }]), [{ route: '/', axis: 26, site: 15 }]);
  assert.deepEqual(gutterOutliers([{ route: '/', axis: 26 }, { route: '/a/', axis: 15 }]), [], 'two pages are not a site');
});

test('running text set centred over more than three lines is found, once per block with its longest', async () => {
  const { centredRunningText } = await import('../lib/visual-checks.mjs');
  // site10's audit repair centred whole paragraphs under centred headings: lined up, but no longer readable.
  assert.deepEqual(centredRunningText([{ block: 'overview', lines: 5, text: 'a' }, { block: 'overview', lines: 7, text: 'b' }, { block: 'cta', lines: 2, text: 'c' }]), [{ block: 'overview', lines: 7, text: 'b' }]);
});

test('a row that scrolls sideways without the template\'s own scroller is found, and a carousel that does not fit needs both its buttons', async () => {
  const { carouselsWithoutControls, unmarkedScrollers } = await import('../lib/visual-checks.mjs');
  assert.deepEqual(unmarkedScrollers([{ block: 'testimonials', marked: false, selector: '.testimonials' }, { block: 'table', marked: true, selector: '.table-block__scroll' }]), [{ block: 'testimonials', selector: '.testimonials' }]);
  assert.deepEqual(carouselsWithoutControls([{ block: 'a', overflows: true, controls: 0 }, { block: 'b', overflows: true, controls: 2 }, { block: 'c', overflows: false, controls: 0 }]), [{ block: 'a', controls: 0 }]);
});

test('testimonials take the site\'s variant, a page type\'s own first; the contract knows the carousel', async () => {
  const { resolveVariant } = await import('../lib/media-slots.mjs');
  const { BLOCK_VARIANTS, SECTION_MODULES } = await import('../lib/authoring-contract.mjs');
  const block = { type: 'testimonials', items: [] };
  assert.equal(resolveVariant(block, 'home', 0, {}), undefined, 'no variant: the grid of today');
  assert.equal(resolveVariant(block, 'home', 0, { testimonials: 'carousel' }), 'carousel');
  assert.equal(resolveVariant(block, 'about', 0, { testimonials: 'carousel', pageTypes: { about: { testimonials: 'grid' } } }), 'grid');
  assert.deepEqual(BLOCK_VARIANTS.testimonials, ['grid', 'carousel']);
  assert.ok(SECTION_MODULES.includes('testimonials:carousel'));
});

test('logos take the site\'s variant, a page type\'s own first; the contract knows the strip and the marquee', async () => {
  const { resolveVariant } = await import('../lib/media-slots.mjs');
  const { BLOCK_VARIANTS, SECTION_MODULES } = await import('../lib/authoring-contract.mjs');
  const block = { type: 'logos', items: [] };
  assert.equal(resolveVariant(block, 'home', 0, {}), undefined, 'no variant: the grid of today');
  assert.equal(resolveVariant(block, 'home', 0, { logos: 'marquee', pageTypes: { home: { logos: 'strip' } } }), 'strip');
  assert.deepEqual(BLOCK_VARIANTS.logos, ['grid', 'strip', 'marquee']);
  assert.ok(SECTION_MODULES.includes('logos:marquee'));
  // Certificates the same: a grid unless the site or the page type slides them in one row.
  const certificates = { type: 'certifications', items: [] };
  assert.equal(resolveVariant(certificates, 'about', 0, {}), undefined);
  assert.equal(resolveVariant(certificates, 'about', 0, { certifications: 'strip' }), 'strip');
  assert.equal(resolveVariant(certificates, 'about', 0, { certifications: 'grid', pageTypes: { about: { certifications: 'strip' } } }), 'strip');
  assert.deepEqual(BLOCK_VARIANTS.certifications, ['grid', 'strip']);
});

test('controls smaller than 24 pixels are reported once per block and size (no position: no spacing exception)', async () => {
  const { smallTargets } = await import('../lib/visual-checks.mjs');
  const targets = [{ block: 'footer', text: 'FAQ', width: 30, height: 18 }, { block: 'footer', text: 'Blog', width: 30, height: 18 }, { block: 'hero', text: 'Get a quote', width: 160, height: 48 }];
  assert.deepEqual(smallTargets(targets).map((target) => target.text), ['FAQ']);
});

test('section headings keep to the reference\'s axis: a centred one or one off the common left edge is found', async () => {
  const { headingAxes } = await import('../lib/visual-checks.mjs');
  const heading = (block, left, extra = {}) => ({ block, text: block, left, centred: false, boxed: false, inverse: false, ...extra });
  const page = [heading('a', 158), heading('b', 158), heading('c', 297), heading('d', 158, { centred: true }), heading('e', 206, { boxed: true }), heading('cta', 220, { inverse: true })];
  assert.deepEqual(headingAxes(page, 'start').map((item) => [item.block, item.kind]), [['c', 'off_axis'], ['d', 'centred']]);
  assert.deepEqual(headingAxes(page, 'center'), [], 'a reference that centres its headings is not held to one left edge');
  // A split row with its photo first sets its heading at the head of the copy beside the photo (hhmhotels.com's
  // alternating capability rows): it heads that column, not the page's axis.
  assert.deepEqual(headingAxes([...page, heading('split', 749, { beside: true })], 'start').map((item) => item.block), ['c', 'd']);
  const { withCapture } = await import('../scaffold-placeholder-pages.mjs');
  assert.equal(withCapture({ pageTypes: {} }, { pages: [], headings: { start: 9, center: 2 } }, null).headingAlign, 'start');
  assert.equal(withCapture({ pageTypes: {} }, { pages: [], headings: { start: 1, center: 6 } }, null).headingAlign, 'center');
});

test('a split row\'s photo and copy share their edges; a button stays with its copy', async () => {
  const { splitEdges, actionsDetached } = await import('../lib/visual-checks.mjs');
  // The hotel service rows: a 364px photo beside 719px of copy (top aligned), and beside 218px of copy (top aligned).
  assert.deepEqual(splitEdges([{ block: 'm3', media: { top: 0, bottom: 364 }, copy: { top: 0, bottom: 719 } }]).map((item) => item.side), ['copy_past_photo']);
  assert.deepEqual(splitEdges([{ block: 'm6', media: { top: 0, bottom: 364 }, copy: { top: 0, bottom: 218 } }]).map((item) => item.side), ['copy_off_middle']);
  assert.deepEqual(splitEdges([{ block: 'ok', media: { top: 0, bottom: 719 }, copy: { top: 0, bottom: 719 } }, { block: 'mid', media: { top: 0, bottom: 364 }, copy: { top: 73, bottom: 291 } }]), [], 'shared edges, or the copy level with the photo\'s middle');
  assert.deepEqual(splitEdges([{ block: 'm3', media: { top: 0, bottom: 578 }, copy: { top: 0, bottom: 719 }, sticky: true }]), [], 'a capped photo held beside longer copy as it is read');
  // The closing band's button 335px under its paragraph and 414px to its right.
  assert.deepEqual(actionsDetached([{ block: 'cta', label: 'Talk to our team', gap: 335, offset: 414, centred: false }, { block: 'hero', label: 'Talk', gap: 24, offset: 300, centred: true }]).map((item) => item.block), ['cta']);
});

test('the item titles of one section set keep one size and level, over every block the set runs over', async () => {
  const { unevenSetType } = await import('../lib/visual-checks.mjs');
  const card = (block, set, tag, size, text) => ({ set, block, kind: 'feature-card__title', tag, size, text });
  // The hotel home: six service cards over two grids, the second without a heading of its own.
  const titles = [card('featureGrid-1', 'featureGrid-1', 'h3', 22, 'Full remote management'), card('featureGrid-1', 'featureGrid-1', 'h3', 22, 'Pricing'), card('featureGrid-2', 'featureGrid-1', 'h2', 36, 'Online visibility')];
  assert.deepEqual(unevenSetType(titles), [{ block: 'featureGrid-2', kind: 'feature-card__title', sizes: [22, 36], tags: ['h3', 'h2'], text: 'Online visibility' }]);
  assert.deepEqual(unevenSetType(titles.slice(0, 2)), []);
  // Two sets may differ: each keeps its own.
  assert.deepEqual(unevenSetType([card('a', 'a', 'h3', 22, 'x'), card('b', 'b', 'h3', 18, 'y')]), []);
});
