import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import { captureTree, domDensity, heroTitles, htmlParents, sectionList } from '../lib/capture-dom.mjs';
import { checkReferenceCapture, screenshotBands } from '../check-reference-capture.mjs';

// A fake capture: a nested spec becomes the preorder element list capture-reference.mjs extractPage writes (selectors
// as its selectorFor builds them) and the rendered.html it saves next to it.
const STYLE = Object.freeze({
  display: 'block', position: 'static', opacity: '1', visibility: 'visible', 'background-image': 'none',
  'background-color': 'rgba(0, 0, 0, 0)', border: '0px none rgb(0, 0, 0)', 'box-shadow': 'none', 'font-size': '16px',
  'font-family': 'Inter', 'text-transform': 'none',
});
const el = (tag, rect, { id, attrs = {}, text = '', styles = {}, children = [] } = {}) => ({ tag, rect, id, attrs, text, styles, children });
const box = (x, y, width, height) => ({ x, y, width, height });

function capture(spec, { width = 1440, height = 1000, scrollHeight = 2100, url = 'https://ref.test/' } = {}) {
  const elements = [];
  const walk = (node, parentSelector, siblings, index) => {
    const same = siblings.filter((other) => other.tag === node.tag);
    let part = node.tag;
    let selector;
    if (node.id) selector = `${node.tag}#${node.id}`;
    else {
      if (same.length > 1) part += `:nth-of-type(${same.indexOf(node) + 1})`;
      selector = node.tag === 'html' ? '' : parentSelector ? `${parentSelector} > ${part}` : part;
    }
    const attributes = { ...node.attrs, ...(node.id ? { id: node.id } : {}) };
    elements.push({ selector, tag: node.tag, attributes, directText: node.text, rect: node.rect, styles: { ...STYLE, ...node.styles }, before: null, after: null });
    node.children.forEach((child) => walk(child, selector, node.children, index));
  };
  walk(spec, '', [spec], 0);
  const attr = (node) => [...(node.id ? [['id', node.id]] : []), ...Object.entries(node.attrs)].map(([name, value]) => ` ${name}="${value}"`).join('');
  const html = (node) => (['img', 'meta', 'br'].includes(node.tag) ? `<${node.tag}${attr(node)}>` : `<${node.tag}${attr(node)}>${node.text}${node.children.map(html).join('')}</${node.tag}>`);
  return {
    extraction: { schemaVersion: 'seo-site-reference-extraction-v1', url, viewport: { id: `desktop-${width}`, width, height }, document: { scrollWidth: width, scrollHeight }, elements },
    html: `<!DOCTYPE html>${html(spec)}`,
  };
}

const LONG = 'We run room pricing and channel listings for independent hotels so their teams can look after guests every single day of the year.';

// Header 0-100 with its menu, three stacked sections in <main> (the first anchored by its id), a footer at 1900.
function hotelPage({ sectionStyles = {}, hero = false, extra = [], headerTitle = false, mastheadTitle = true } = {}) {
  const title = el('h1', box(80, 160, 800, 60), { text: 'Revenue management for hotels', styles: { 'font-size': '48px' } });
  const first = hero
    ? el('section', box(0, 0, 1440, 700), { id: 'intro', children: [el('img', box(0, 0, 1440, 900)), ...(mastheadTitle ? [title] : [])] })
    : el('section', box(0, 100, 1440, 600), { id: 'intro', children: [...(mastheadTitle ? [title] : []), el('p', box(80, 240, 600, 120), { text: LONG }), el('img', box(720, 160, 700, 500))] });
  return el('html', box(0, 0, 1440, 1000), {
    children: [
      el('head', box(0, 0, 0, 0), { children: [el('title', box(0, 0, 0, 0), { text: 'Hotels' })] }),
      el('body', box(0, 0, 1440, 2100), {
        children: [
          el('header', box(0, 0, 1440, 100), { styles: { position: 'fixed' }, children: [el('nav', box(400, 20, 600, 60), { children: [el('a', box(400, 30, 80, 20), { text: 'Home' })] }), ...(headerTitle ? [el('h1', box(20, 20, 200, 60), { text: 'Hotel Revenue Co' })] : [])] }),
          el('main', box(0, 100, 1440, 1800), {
            children: [
              first,
              el('section', box(0, 700, 1440, 600), { styles: sectionStyles, children: [el('h2', box(80, 760, 800, 40), { text: 'Our services', styles: { 'font-size': '32px' } }), el('p', box(80, 820, 600, 200), { text: `${LONG} ${LONG}` }), el('p', box(80, 1030, 600, 200), { text: LONG })] }),
              el('section', box(0, 1300, 1440, 600), { styles: sectionStyles, children: [el('h2', box(80, 1360, 800, 40), { text: 'How we work', styles: { 'font-size': '32px' } }), el('p', box(80, 1420, 600, 200), { text: LONG }), el('img', box(720, 1360, 700, 500))] }),
            ],
          }),
          el('footer', box(0, 1900, 1440, 200), { children: [el('p', box(80, 1950, 300, 20), { text: '© 2026' })] }),
          ...extra,
        ],
      }),
    ],
  });
}

// A 1440-wide screenshot as raw RGB: white, with dark marks where `ink` rectangles are.
function shot({ width = 1440, height = 2100, ink = [] } = {}) {
  const data = Buffer.alloc(width * height * 3, 255);
  for (const { x, y, w, h } of ink) for (let row = y; row < Math.min(height, y + h); row += 1) for (let col = x; col < Math.min(width, x + w); col += 1) data.fill(30, (row * width + col) * 3, (row * width + col) * 3 + 3);
  return { data, width, height, channels: 3 };
}
// Marks over every band with content: what a page shown as a visitor sees looks like.
const SHOWN = [{ x: 80, y: 160, w: 800, h: 300 }, { x: 720, y: 1100, w: 700, h: 500 }, { x: 80, y: 1950, w: 300, h: 20 }];

const DESKTOP = 'desktop-1440';
function evidence({ spec = hotelPage(), pixels = shot({ ink: SHOWN }), density = null, waivers = {}, fontLock = { roles: { hero: { family: 'Inter' } } } } = {}) {
  const { extraction, html } = capture(spec);
  return {
    pages: [{ pageType: 'home', folder: 'home', url: 'https://ref.test/', html, fontLock, viewports: { [DESKTOP]: { extraction, bands: pixels ? screenshotBands(pixels) : null } }, missing: [] }],
    density,
    waivers,
  };
}
const checksOf = (result) => result.problems.map((problem) => problem.check).sort();

test('screenshot bands report the share of pixels that differ from each band\'s background', () => {
  const bands = screenshotBands(shot({ ink: [{ x: 0, y: 0, w: 1440, h: 100 }] }));
  assert.deepEqual(bands.map((band) => [band.top, band.bottom]), [[0, 1000], [1000, 2000], [2000, 2100]]);
  assert.ok(Math.abs(bands[0].inkShare - 0.1) < 0.001);
  assert.equal(bands[1].inkShare, 0);
});

test('the DOM tree takes an id-anchored element\'s parent from rendered.html', () => {
  const { extraction, html } = capture(hotelPage());
  assert.equal(htmlParents(html).get('section#intro'), 'body > main');
  const tree = captureTree(extraction, { html });
  const intro = tree.nodes.find((node) => node.selector === 'section#intro');
  assert.equal(intro.parent.selector, 'body > main');
  // Without the page's markup it hangs from <body>: the stacked list then loses that section.
  const orphan = captureTree(extraction).nodes.find((node) => node.selector === 'section#intro');
  assert.equal(orphan.parent.selector, 'body');
});

test('the section list follows the browser rule of reference-anatomy.mjs extractSectionShapes', () => {
  const { extraction, html } = capture(hotelPage());
  assert.equal(sectionList(captureTree(extraction, { html })).length, 3);
  assert.equal(sectionList(captureTree(extraction)).length, 2);
});

test('a Duda page (hometeamluxuryrentals.com): its body carries an id, its header and footer are divs with Duda\'s markers, its sections plain divs', () => {
  const row = (y, heading) => el('div', box(0, y, 1440, 600), { attrs: { class: 'dmRespRow' }, children: [el('h2', box(80, y + 60, 800, 40), { text: heading, styles: { 'font-size': '32px' } }), el('p', box(80, y + 120, 600, 200), { text: LONG })] });
  const spec = el('html', box(0, 0, 1440, 1000), {
    children: [
      el('head', box(0, 0, 0, 0)),
      el('body', box(0, 0, 1440, 2100), {
        id: 'dmRoot',
        children: [
          // The phone header first, 0×0 at this width, as Duda's markup has it.
          el('div', box(0, 0, 0, 0), { attrs: { class: 'hamburger-header-container showOnMedium' }, styles: { position: 'fixed' } }),
          el('div', box(0, 0, 1440, 100), { attrs: { class: 'dmHeaderContainer fHeader' }, styles: { position: 'fixed' }, children: [el('a', box(400, 30, 80, 20), { text: 'Home' })] }),
          row(100, 'Luxury homes'), row(700, 'Where we perform'), row(1300, 'Owner stories'),
          // Its footer menu's closed sub-menus sit at opacity 0: shut menus, not content faded in on scroll.
          el('div', box(0, 1900, 1440, 200), { attrs: { class: 'dmFooterContainer' }, children: [el('p', box(80, 1950, 300, 20), { text: '© 2026' }), el('nav', box(400, 2005, 600, 90), { children: [el('ul', box(400, 2005, 300, 90), { styles: { opacity: '0' }, children: ['Arizona', 'Florida', 'Texas', 'Utah'].map((state, index) => el('li', box(400, 2005 + index * 20, 300, 20), { text: state })) })] })] }),
        ],
      }),
    ],
  });
  const { extraction, html } = capture(spec);
  const tree = captureTree(extraction, { html });
  assert.equal(tree.body?.selector, 'body#dmRoot');
  assert.match(tree.header?.attributes.class ?? '', /dmHeaderContainer/);
  assert.match(tree.footer?.attributes.class ?? '', /dmFooterContainer/);
  assert.equal(sectionList(tree).length, 3);
  const result = checkReferenceCapture(evidence({ spec }));
  assert.equal(checksOf(result).filter((check) => ['section-list', 'fixed-overlay', 'faded-content'].includes(check)).length, 0, JSON.stringify(result.problems));
});

test('the density estimate counts photos, words and the longest text-only run as lib/density.mjs does', () => {
  const { extraction, html } = capture(hotelPage());
  const metrics = domDensity(captureTree(extraction, { html }));
  assert.equal(metrics.contentHeight, 1800);
  assert.equal(metrics.images, 2);
  assert.equal(metrics.words, 124);
  // Two 700x500 photos on a 1440x1800 content area.
  assert.equal(metrics.photoAreaPct, 27);
  assert.equal(metrics.longestTextOnlyPx, 700);
});

test("an article's own header is content: its hero video counts in the estimate (concordhotels.com home)", () => {
  const masthead = el('article', box(0, 100, 1440, 1000), { children: [el('header', box(0, 100, 1440, 1000), { children: [el('video', box(0, 100, 1440, 1000))] })] });
  const page = hotelPage({ mastheadTitle: false });
  page.children[1].children[1].children.unshift(masthead);
  const { extraction, html } = capture(page);
  const tree = captureTree(extraction, { html });
  assert.equal(tree.header.tag, 'header');
  assert.equal(tree.header.selector, 'body > header');
  assert.equal(domDensity(tree).images, 3);
});

test('the title rule finds a masthead title and misses one only in the site header', () => {
  const masthead = el('article', box(0, 100, 1440, 400), { children: [el('header', box(0, 100, 1440, 400), { children: [el('h1', box(80, 200, 600, 60), { text: 'Management' })] })] });
  const withMasthead = hotelPage({ mastheadTitle: false, extra: [] });
  withMasthead.children[1].children[1].children.unshift(masthead);
  const { extraction, html } = capture(withMasthead);
  assert.equal(heroTitles(captureTree(extraction, { html })).picked?.text, 'Management');
  const onlyLogo = capture(hotelPage({ mastheadTitle: false, headerTitle: true }));
  const titles = heroTitles(captureTree(onlyLogo.extraction, { html: onlyLogo.html }));
  assert.equal(titles.titles, 1);
  assert.equal(titles.picked, null);
});

test('a capture shot as a visitor sees it passes and gets its row in the table', () => {
  const density = { pages: [{ url: 'https://ref.test', pageType: 'home', metrics: { contentHeight: 1800, images: 2, structured: 0, words: 102, wordsPer1000px: 57, photoAreaPct: 27, structuredAreaPct: 0, visualAreaPct: 27, longestTextOnlyPx: 650 } }] };
  const result = checkReferenceCapture(evidence({ density }));
  assert.deepEqual(result.problems, []);
  assert.equal(result.table.length, 1);
  assert.equal(result.table[0].source, 'density');
  assert.equal(result.table[0].words, 102);
  assert.equal(result.table[0].images, 2);
  assert.equal(result.table[0].visualAreaPct, 27);
  assert.equal(result.table[0].longestTextOnlyPx, 650);
  assert.equal(result.table[0].sections, 3);
});

test('without a density measure the table falls back to the capture\'s own estimate', () => {
  const result = checkReferenceCapture(evidence());
  assert.equal(result.table[0].source, 'capture');
  assert.equal(result.table[0].images, 2);
});

test('a blank band where the DOM has visible text and photos is reported (hhmhotels.com, fade-on-scroll)', () => {
  const result = checkReferenceCapture(evidence({ pixels: shot({ ink: [SHOWN[0]] }) }));
  assert.deepEqual(checksOf(result), ['blank-segment']);
  assert.match(result.problems[0].detail, /1000/);
});

test('sections the DOM holds near opacity 0 are reported as faded, without a screenshot', () => {
  const result = checkReferenceCapture(evidence({ spec: hotelPage({ sectionStyles: { opacity: '0.02' } }), pixels: null }));
  assert.ok(checksOf(result).includes('faded-content'));
  assert.ok(!checksOf(result).includes('blank-segment'));
});

test('a fixed box over the window larger than 5% of it is reported; the site header, a small button and a hidden lightbox are not (hhmhotels.com cookie bar)', () => {
  const cookie = el('div', box(0, 920, 1440, 80), { id: 'consent', styles: { position: 'fixed' }, children: [el('p', box(20, 940, 400, 20), { text: 'We use cookies' })] });
  const chat = el('div', box(1375, 943, 44, 44), { styles: { position: 'fixed' } });
  const lightbox = el('div', box(0, 0, 1440, 1000), { styles: { position: 'fixed', opacity: '0' } });
  const result = checkReferenceCapture(evidence({ spec: hotelPage({ extra: [cookie, chat, lightbox] }) }));
  assert.deepEqual(checksOf(result), ['fixed-overlay']);
  assert.match(result.problems[0].detail, /div#consent/);
});

test('a hero photo under the header with a low measured photo share is reported (hhmhotels.com home, transparent header)', () => {
  const metrics = { contentHeight: 1800, images: 1, structured: 0, words: 78, wordsPer1000px: 43, photoAreaPct: 14, structuredAreaPct: 0, visualAreaPct: 14, longestTextOnlyPx: 600 };
  const pixels = shot({ ink: [{ x: 0, y: 0, w: 1440, h: 900 }, ...SHOWN.slice(1)] });
  const low = checkReferenceCapture(evidence({ spec: hotelPage({ hero: true }), pixels, density: { pages: [{ url: 'https://ref.test/', metrics }] } }));
  assert.deepEqual(checksOf(low), ['hero-photo-area']);
  const fair = checkReferenceCapture(evidence({ spec: hotelPage({ hero: true }), pixels, density: { pages: [{ url: 'https://ref.test/', metrics: { ...metrics, photoAreaPct: 58, visualAreaPct: 58 } }] } }));
  assert.deepEqual(fair.problems, []);
});

test('a page with an h1 whose title the capture rules miss is reported (concordhotels.com masthead)', () => {
  const result = checkReferenceCapture(evidence({ spec: hotelPage({ mastheadTitle: false, headerTitle: true }) }));
  assert.deepEqual(checksOf(result), ['title-missed']);
  const noFont = checkReferenceCapture(evidence({ fontLock: { roles: { hero: null } } }));
  assert.deepEqual(checksOf(noFont), ['title-missed']);
});

test('a page whose content is one block with no stacked sections is reported (hhmhotels.com/contact-us)', () => {
  const flat = el('html', box(0, 0, 1440, 1000), {
    children: [el('head', box(0, 0, 0, 0)), el('body', box(0, 0, 1440, 1200), {
      children: [
        el('header', box(0, 0, 1440, 100), { children: [el('nav', box(400, 20, 600, 60), { children: [el('a', box(400, 30, 80, 20), { text: 'Home' })] })] }),
        el('div', box(0, 100, 1440, 900), { children: [el('h1', box(80, 140, 600, 60), { text: 'Contact us' }), el('p', box(80, 240, 600, 200), { text: LONG })] }),
        el('footer', box(0, 1000, 1440, 200), { children: [el('p', box(80, 1050, 300, 20), { text: '© 2026' })] }),
      ],
    })],
  });
  const result = checkReferenceCapture(evidence({ spec: flat, pixels: shot({ height: 1200, ink: [{ x: 80, y: 140, w: 600, h: 300 }, { x: 80, y: 1050, w: 300, h: 20 }] }) }));
  assert.deepEqual(checksOf(result), ['section-list']);
});

test('a waiver in site.json captureWaivers lists the problem without failing', () => {
  const cookie = el('div', box(0, 920, 1440, 80), { id: 'consent', styles: { position: 'fixed' }, children: [el('p', box(20, 940, 400, 20), { text: 'We use cookies' })] });
  const result = checkReferenceCapture(evidence({ spec: hotelPage({ extra: [cookie] }), waivers: { home: { 'fixed-overlay': 'the bar sits in the footer of the shot only' } } }));
  assert.deepEqual(result.problems, []);
  assert.equal(result.waived.length, 1);
  assert.equal(result.waived[0].reason, 'the bar sits in the footer of the shot only');
});

test('a missing capture file is a problem, not a skipped check', () => {
  const input = evidence();
  input.pages[0].missing = ['design-references/mobile-390.png'];
  assert.deepEqual(checksOf(checkReferenceCapture(input)), ['missing-capture']);
});

// The command line on a site folder: reads the capture, writes the reports to --out, exits 1 on a problem.
test('the CLI writes capture-check.json and capture-check.md to --out and exits 1 on a problem', async () => {
  const sharp = (await import('sharp')).default;
  const root = await mkdtemp(join(tmpdir(), 'capture-check-'));
  try {
    const site = join(root, 'site');
    const folder = join(site, 'docs/research/reference-pages/home');
    await mkdir(join(folder, 'raw'), { recursive: true });
    await mkdir(join(folder, 'design-references'), { recursive: true });
    await writeFile(join(site, 'site.json'), JSON.stringify({ reference: { origin: 'https://ref.test', pages: { home: '/' } } }));
    await mkdir(join(site, 'docs/research/raw'), { recursive: true });
    await writeFile(join(site, 'docs/research/raw/reference-density.json'), JSON.stringify({ pages: [{ url: 'https://ref.test/', pageType: 'home', metrics: { contentHeight: 1800, images: 2, structured: 0, words: 124, wordsPer1000px: 69, photoAreaPct: 27, structuredAreaPct: 0, visualAreaPct: 27, longestTextOnlyPx: 700 } }] }));
    const { extraction, html } = capture(hotelPage());
    const pixels = shot({ ink: SHOWN });
    for (const id of ['desktop-1440', 'tablet-768', 'mobile-390']) {
      await writeFile(join(folder, 'raw', `${id}.json`), JSON.stringify(extraction));
      await sharp(pixels.data, { raw: { width: pixels.width, height: pixels.height, channels: 3 } }).png().toFile(join(folder, 'design-references', `${id}.png`));
    }
    await writeFile(join(folder, 'raw/rendered.html'), html);
    await writeFile(join(folder, 'raw/font-lock.json'), JSON.stringify({ roles: { hero: { family: 'Inter' } } }));
    const script = resolve('scripts/check-reference-capture.mjs');
    const out = join(root, 'out');
    const clean = spawnSync(process.execPath, [script, site, '--out', out], { encoding: 'utf8' });
    assert.equal(clean.status, 0, clean.stderr);
    assert.match(clean.stdout, /home/);
    const report = JSON.parse(await readFile(join(out, 'capture-check.json'), 'utf8'));
    assert.deepEqual(report.problems, []);
    assert.match(await readFile(join(out, 'capture-check.md'), 'utf8'), /采集验收/);
    await rm(join(folder, 'design-references/mobile-390.png'));
    const failed = spawnSync(process.execPath, [script, site, '--out', out], { encoding: 'utf8' });
    assert.equal(failed.status, 1);
    assert.match(failed.stdout + failed.stderr, /missing-capture/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
