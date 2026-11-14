// Visual checks of a rendered page that a person proofreading the design would make and the other layout checks do
// not: a module repeated more times in a row than the competitor ever does, a colour outside the competitor's locked
// palette, photos overlapping each other, and a photo cropped to a fraction of itself. measurePage runs in the page
// (Playwright page.evaluate); the judging functions are pure.

// The longest run of one block type in a sequence: { type, length, blocks }.
export function longestRuns(sequence) {
  const runs = [];
  for (const item of sequence) {
    const last = runs.at(-1);
    if (last && last.type === item.type) { last.length += 1; last.blocks.push(item.id); } else runs.push({ type: item.type, length: 1, blocks: [item.id] });
  }
  return runs;
}

// The competitor's longest run of each block type on a page type (docs/research/analysis/section-modules.json:
// "<block>:<variant>" modules in page order; "skip" sections do not break a run).
export function referenceRuns(sectionModules, pageType) {
  const sequence = sectionModules.filter((item) => item.pageType === pageType && item.module !== 'skip').sort((a, b) => a.index - b.index).map((item) => ({ type: item.module.split(':')[0].split('/')[0], id: String(item.index) }));
  const most = {};
  for (const run of longestRuns(sequence)) most[run.type] = Math.max(most[run.type] ?? 0, run.length);
  return most;
}

// Pages that are one document (a legal text, an article): a run of headed text sections is their form.
export const DOCUMENT_PAGE_TYPES = Object.freeze(['privacy', 'blog_post']);

// Where rendered lines of text sit in their column ({ left, right }): 'start', 'centre' or 'end', undefined with none.
// Lines that start together are start-aligned however wide they are (a paragraph's lines nearly fill a phone column,
// so their middles sit on its middle); ones that end together are end-aligned; centred lines have both edges ragged.
// One line, or lines that fill the column, by where they sit. Self-contained: the design review runs it in the page.
export function lineAlignment(rects, column) {
  const shown = rects.filter((rect) => rect.width > 1);
  if (!shown.length || !column) return undefined;
  const lefts = shown.map((rect) => rect.left);
  const rights = shown.map((rect) => rect.right);
  const together = (edges) => Math.max(...edges) - Math.min(...edges) < 2;
  if (shown.length > 1 && together(lefts) && !together(rights)) return 'start';
  if (shown.length > 1 && together(rights) && !together(lefts)) return 'end';
  const middle = shown.reduce((sum, rect) => sum + (rect.left + rect.right) / 2, 0) / shown.length;
  if (Math.abs(middle - (column.left + column.right) / 2) < 8 && Math.min(...lefts) - column.left > 2) return 'centre';
  return Math.min(...lefts) - column.left <= column.right - Math.max(...rights) ? 'start' : 'end';
}

// The page's sections in order: a block that continues the section right before it (continues: Site Factory split the
// section at its limit) is that section going on and is left out; one with other blocks between is the section again.
export const sectionBlocks = (blocks) => blocks.filter((block, index) => !(block.continues && index > 0 && [blocks[index - 1].id, blocks[index - 1].continues].includes(block.continues)));

// Runs of one block type longer than the competitor's (at least two in a row are always allowed), counted by section;
// none on a document.
export function repeatedModules(blocks, reference = {}, pageType = null) {
  if (DOCUMENT_PAGE_TYPES.includes(pageType)) return [];
  return longestRuns(sectionBlocks(blocks)).filter((run) => run.length > Math.max(2, reference[run.type] ?? 0)).map((run) => ({ type: run.type, length: run.length, allowed: Math.max(2, reference[run.type] ?? 0), blocks: run.blocks }));
}

// sRGB "rgb(r, g, b[, a])" -> CIE Lab, and the CIE76 distance between two colours.
const channel = (value) => { const c = value / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
export function toLab([r, g, b]) {
  const [R, G, B] = [r, g, b].map(channel);
  const xyz = [(0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047, 0.2126 * R + 0.7152 * G + 0.0722 * B, (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883];
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = xyz.map(f);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
export const deltaE = (a, b) => Math.hypot(...toLab(a).map((value, index) => value - toLab(b)[index]));
export const parseRgb = (text) => { const match = String(text).match(/rgba?\(([^)]+)\)/); if (!match) return null; const [r, g, b, a = 1] = match[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { rgb: [r, g, b], alpha: a }; };

// How far a colour is from a palette colour in hue and saturation alone (Lab a*b*), ignoring lightness: a palette
// colour darkened or lightened to meet contrast (a link blue made darker) is still the palette's colour. Greys (low
// chroma) match any grey.
const chroma = ([, a, b]) => Math.hypot(a, b);
export function hueDistance(colour, paletteColour) {
  const [x, y] = [toLab(colour), toLab(paletteColour)];
  if (chroma(x) < 6 && chroma(y) < 6) return 0;
  // Compare the direction and strength of the colour, scaled to the lightness change (a darker shade has less chroma).
  const scale = y[0] > 0 && x[0] > 0 ? x[0] / y[0] : 1;
  return Math.hypot(x[1] - y[1] * Math.min(scale, 1.5), x[2] - y[2] * Math.min(scale, 1.5));
}

// Colours not of the palette (the design lock's colours, white, black and greys) in hue and saturation: [{ color,
// where, nearest }]. Each colour is reported once, with the first place it is used.
export const PALETTE_TOLERANCE = 12;
export function offPalette(colours, palette, tolerance = PALETTE_TOLERANCE) {
  const known = [...palette, [255, 255, 255], [0, 0, 0]];
  const seen = new Map();
  for (const { color, where } of colours) {
    const key = color.join(',');
    if (seen.has(key)) continue;
    const nearest = Math.min(...known.map((value) => hueDistance(color, value)));
    seen.set(key, nearest > tolerance ? { color: `rgb(${key})`, where, nearest: Math.round(nearest) } : null);
  }
  return [...seen.values()].filter(Boolean);
}

// The literal colours a stylesheet sets (#rgb, #rrggbb, rgb()/rgba() with full alpha), each with its line: the
// treatment's own colours, checked against the design lock before anything is built.
export function stylesheetColours(css) {
  const colours = [];
  const text = css.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '));
  for (const [index, line] of text.split('\n').entries()) {
    for (const match of line.matchAll(/#([0-9a-f]{3}|[0-9a-f]{6})\b|rgba?\(([^)]+)\)/gi)) {
      let rgb;
      if (match[1]) { const hex = match[1].length === 3 ? [...match[1]].map((c) => c + c).join('') : match[1]; rgb = [0, 2, 4].map((at) => parseInt(hex.slice(at, at + 2), 16)); } else {
        const parts = match[2].split(/[ ,/]+/).filter(Boolean).map(Number);
        if (parts.length > 3 && parts[3] < 1) continue;
        rgb = parts.slice(0, 3);
      }
      if (rgb.every(Number.isFinite)) colours.push({ color: rgb, where: `line ${index + 1}` });
    }
  }
  return colours;
}

// The design lock's colours (docs/research/analysis/design-lock.json roles, supplementary roles and tokens), as
// [r, g, b].
export function lockPalette(designLock) {
  const value = (entry) => (typeof entry === 'string' ? entry : entry?.value);
  const values = [designLock?.roles, designLock?.supplementaryRoles, designLock?.tokens].flatMap((group) => Object.values(group ?? {}).map(value));
  return stylesheetColours(values.filter(Boolean).join('\n')).map((item) => item.color);
}

// The share of a photo still shown in its box (object-fit: cover crops the rest): 1 is the whole photo.
export const shownShare = (box, natural) => { const boxRatio = box.width / box.height; const photoRatio = natural.width / natural.height; return Math.min(boxRatio, photoRatio) / Math.max(boxRatio, photoRatio); };
export const CROP_MINIMUM = 0.5;

// In the page: the block sequence of main, the colours its visible elements paint, the palette its stylesheet's :root
// custom properties define, the content photos' boxes, and pairs of photos that overlap.
export function measurePage() {
  const main = document.querySelector('main[data-authoring-page]') ?? document.querySelector('main');
  const visible = (element) => { const box = element.getBoundingClientRect(); const style = getComputedStyle(element); return box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0; };
  const blocks = [...main.querySelectorAll(':scope [data-authoring-block]')].filter((element) => !element.parentElement.closest('[data-authoring-block]')).map((element) => ({ type: element.getAttribute('data-authoring-block'), id: element.getAttribute('data-block-id') ?? element.getAttribute('data-authoring-block'), continues: element.getAttribute('data-continues') }));
  // The palette: every colour a :root custom property of the page's stylesheets resolves to.
  const names = new Set();
  for (const sheet of document.styleSheets) {
    let rules = [];
    try { rules = [...sheet.cssRules]; } catch { continue; }
    const walk = (list) => { for (const rule of list) { if (rule.cssRules) walk(rule.cssRules); if (rule.selectorText?.split(',').some((selector) => selector.trim() === ':root')) for (const name of rule.style) if (name.startsWith('--')) names.add(name); } };
    walk(rules);
  }
  const probe = document.createElement('i');
  document.body.append(probe);
  const palette = [];
  for (const name of names) { probe.style.color = ''; probe.style.color = `var(${name})`; const value = getComputedStyle(probe).color; if (probe.style.color && /rgb/.test(value)) palette.push(value); }
  probe.remove();
  // What the page paints: backgrounds, text colours (elements with their own text) and borders.
  const colours = [];
  const where = (element) => `${element.tagName.toLowerCase()}${element.className && typeof element.className === 'string' ? `.${element.className.trim().split(/\s+/)[0]}` : ''}`;
  for (const element of [document.querySelector('header'), main, document.querySelector('footer')].filter(Boolean).flatMap((root) => [root, ...root.querySelectorAll('*')])) {
    if (!visible(element) || element.closest('svg') || element.tagName === 'IMG') continue;
    const style = getComputedStyle(element);
    if (!/rgba?\([^)]*,\s*0\)$/.test(style.backgroundColor) && style.backgroundColor !== 'transparent') colours.push({ color: style.backgroundColor, where: where(element) });
    if ([...element.childNodes].some((node) => node.nodeType === 3 && node.textContent.trim())) colours.push({ color: style.color, where: where(element) });
    if (parseFloat(style.borderTopWidth) > 0 && style.borderTopStyle !== 'none') colours.push({ color: style.borderTopColor, where: where(element) });
  }
  // Content photos (not a backdrop under copy, not the logo): their boxes, natural sizes and fit; whether a layout
  // made one wide on purpose (a mosaic's wide place).
  const photos = [...main.querySelectorAll('img')].filter((image) => visible(image) && !/backdrop/.test(image.className) && image.naturalWidth > 0).map((image) => {
    const box = image.getBoundingClientRect();
    return { src: image.getAttribute('src'), block: image.closest('[data-block-id]')?.getAttribute('data-block-id') ?? null, box: { x: box.left, y: box.top + scrollY, width: box.width, height: box.height }, natural: { width: image.naturalWidth, height: image.naturalHeight }, fit: getComputedStyle(image).objectFit, explicit: Boolean(image.closest('[data-explicit-span="true"]')) };
  });
  // The overlays over photos that carry text (the hero, an image band, a form band over a photo): the alpha of every
  // colour stop.
  const overlays = [[document.querySelector('.page-hero[data-variant="media-overlay"]'), '::before', 'hero'], ...[...document.querySelectorAll('[data-variant="image-band"] .cta, [data-variant="form"][data-has-photo] .cta')].map((element) => [element, '::after', element.closest('[data-block-id]')?.getAttribute('data-block-id') ?? 'cta'])].filter(([element]) => element && visible(element)).map(([element, pseudo, block]) => {
    const style = getComputedStyle(element, pseudo);
    const alphas = [...`${style.backgroundImage} ${style.backgroundColor}`.matchAll(/rgba?\(([^)]+)\)/g)].map((match) => { const parts = match[1].split(/[ ,/]+/).filter(Boolean); return parts.length > 3 ? Number(parts[3]) : 1; });
    // Where the text sits over the photo: everything that carries text (the copy, a form hero's form), as one span of
    // the photo's width (textShare), and the widest side of the photo left without text (clearShare: a centred title
    // has two narrow sides and no clear side; a copy on the left leaves the right clear).
    const box = element.getBoundingClientRect();
    const carriers = [...element.querySelectorAll('.page-hero__copy, .page-hero__form, .cta__content, .cta__form')].map((part) => part.getBoundingClientRect()).filter((rect) => rect.width > 0);
    const left = carriers.length ? Math.min(...carriers.map((rect) => rect.left)) : box.left;
    const right = carriers.length ? Math.max(...carriers.map((rect) => rect.right)) : box.right;
    const width = Math.max(1, box.width);
    const share = (value) => Math.round((value / width) * 100) / 100;
    return { block, alphas, textShare: share(right - left), clearShare: share(Math.max(0, left - box.left, box.right - right)) };
  });
  // Running text: how wide the lines of each wrapping paragraph run, in the paragraph's own ch (the unit a treatment's
  // max-width is written in), measured on its longest line.
  const zero = document.createElement('span');
  zero.textContent = '0';
  zero.style.cssText = 'position:absolute;visibility:hidden;white-space:pre';
  const measures = [...main.querySelectorAll('p')].filter((paragraph) => visible(paragraph) && paragraph.textContent.trim().length > 120).map((paragraph) => {
    const range = document.createRange();
    range.selectNodeContents(paragraph);
    const rects = [...range.getClientRects()].filter((rect) => rect.width > 0);
    const lines = new Set(rects.map((rect) => Math.round(rect.top))).size;
    paragraph.append(zero);
    const ch = zero.getBoundingClientRect().width || 1;
    zero.remove();
    const left = Math.min(...rects.map((rect) => rect.left));
    return { block: paragraph.closest('[data-block-id]')?.getAttribute('data-block-id') ?? null, lines, ch: Math.round((Math.max(...rects.map((rect) => rect.right)) - left) / ch) };
  }).filter((measure) => measure.lines >= 2);
  // Rows that scroll sideways: the template marks its own (a table, a carousel's track) with data-scroll; a carousel's
  // buttons, when it does not fit.
  const scrollers = [...main.querySelectorAll('*')].filter((element) => visible(element) && /auto|scroll/.test(getComputedStyle(element).overflowX) && element.scrollWidth > element.clientWidth + 1).map((element) => ({ block: element.closest('[data-block-id]')?.getAttribute('data-block-id') ?? null, marked: Boolean(element.closest('[data-scroll]')), selector: element.className ? `.${String(element.className).trim().split(/s+/).join('.')}` : element.tagName.toLowerCase() }));
  const carousels = [...main.querySelectorAll('[data-layout="carousel"]')].filter(visible).map((carousel) => {
    const viewport = carousel.querySelector('[data-scroll]');
    return { block: carousel.closest('[data-block-id]')?.getAttribute('data-block-id') ?? null, overflows: Boolean(viewport) && viewport.scrollWidth > viewport.clientWidth + 1, controls: [...carousel.querySelectorAll('button')].filter((button) => visible(button)).length };
  });
  // Controls a finger has to hit (links and buttons on their own; a link inside running text is exempt, as WCAG has it,
  // and so is a box whose label can be tapped instead). A control inside a closed menu or fold cannot be hit yet.
  const folded = (element) => Boolean(element.parentElement?.closest('details:not([open])')) && !element.closest('summary');
  const labelled = (element) => element.tagName === 'INPUT' && /checkbox|radio/.test(element.type) && Boolean(element.closest('label') || (element.id && document.querySelector(`label[for="${element.id}"]`)));
  const targets = [...document.querySelectorAll('a[href], button, summary, input:not([type="hidden"]), select, textarea')].filter((element) => visible(element) && !folded(element) && !labelled(element) && !(element.tagName === 'A' && element.closest('p, dd, td, blockquote'))).map((element) => {
    const box = element.getBoundingClientRect();
    return { block: element.closest('[data-block-id]')?.getAttribute('data-block-id') ?? (element.closest('header') ? 'header' : element.closest('footer') ? 'footer' : null), text: (element.textContent || element.getAttribute('aria-label') || '').trim().slice(0, 40), width: Math.round(box.width), height: Math.round(box.height) };
  });
  // Alignment inside the page itself (owner 2026-11-03: elements line up with one another, whatever the competitor
  // does): each heading outside a card, list, table or figure with the running paragraph that follows it in its column
  // (where their text starts, how it is set), and the page's text axis (the left edge most running text starts on).
  const inCard = (element) => Boolean(element.closest('li, td, th, figure, blockquote, details, .process-step, .feature-card, [data-layout="equal-grid"] > *'));
  const inkLeft = (element) => { const range = document.createRange(); range.selectNodeContents(element); const rects = [...range.getClientRects()].filter((rect) => rect.width > 1); return rects.length ? Math.round(Math.min(...rects.map((rect) => rect.left))) : null; };
  const setAs = (element) => { const align = getComputedStyle(element).textAlign; return align === 'center' ? 'centre' : /right|end/.test(align) ? 'end' : 'start'; };
  const running = [...main.querySelectorAll('p')].filter((paragraph) => visible(paragraph) && paragraph.textContent.trim().length > 80 && !inCard(paragraph));
  const columns = [...main.querySelectorAll('h1, h2, h3')].filter((heading) => visible(heading) && !inCard(heading)).map((heading) => {
    const text = running.find((paragraph) => heading.compareDocumentPosition(paragraph) & Node.DOCUMENT_POSITION_FOLLOWING);
    if (!text) return null;
    const [a, b] = [heading.getBoundingClientRect(), text.getBoundingClientRect()];
    if (b.top - a.bottom > 160 || Math.min(a.right, b.right) - Math.max(a.left, b.left) < Math.min(a.width, b.width) * 0.5) return null;
    return { block: heading.closest('[data-block-id]')?.getAttribute('data-block-id') ?? heading.closest('[data-authoring-block]')?.getAttribute('data-authoring-block') ?? null, heading: heading.textContent.trim().slice(0, 50), headingLeft: inkLeft(heading), headingAlign: setAs(heading), textLeft: inkLeft(text), textAlign: setAs(text) };
  }).filter(Boolean);
  // The axis by flush text only (a centred line's left edge moves with its length), outside panels: a box narrower than
  // the page with its own ground or border insets its text on purpose.
  const width = main.getBoundingClientRect().width;
  const inPanel = (element) => {
    for (let node = element.parentElement; node && node !== main; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (node.getBoundingClientRect().width < width - 1 && (!/rgba?\([^)]*,\s*0\)$|transparent/.test(style.backgroundColor) || parseFloat(style.borderLeftWidth) > 0)) return true;
    }
    return false;
  };
  const starts = new Map();
  for (const paragraph of running.filter((item) => setAs(item) === 'start' && !inPanel(item))) { const left = inkLeft(paragraph); if (left !== null) starts.set(left, (starts.get(left) ?? 0) + 1); }
  const textAxis = [...starts].sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;
  // Running text set centred, by its lines: centring a paragraph to match a centred heading is not lining them up.
  const lineCount = (element) => { const range = document.createRange(); range.selectNodeContents(element); return new Set([...range.getClientRects()].filter((rect) => rect.width > 1).map((rect) => Math.round(rect.top))).size; };
  const centred = running.filter((paragraph) => setAs(paragraph) === 'centre').map((paragraph) => ({ block: paragraph.closest('[data-block-id]')?.getAttribute('data-block-id') ?? null, lines: lineCount(paragraph), text: paragraph.textContent.trim().slice(0, 50) }));
  // Each section heading: where its text starts, whether it is centred, and whether it sits in a boxed panel (its own
  // inset, as a card's title). headingAxes compares them with the reference's heading alignment.
  // A card's or list item's own title (an h2 in a grid without a section heading) is no section heading.
  const headings = [...main.querySelectorAll('[data-authoring-block] h2')].filter((heading) => heading.getBoundingClientRect().width > 0 && !heading.closest('article, li, .feature-card, .gallery__item, .related-tile')).map((heading) => {
    const range = document.createRange();
    range.selectNodeContents(heading);
    const lines = [...range.getClientRects()].filter((rect) => rect.width > 0);
    const box = heading.getBoundingClientRect();
    const left = lines.length ? Math.min(...lines.map((rect) => rect.left)) : box.left;
    const right = lines.length ? Math.max(...lines.map((rect) => rect.right)) : box.right;
    const panel = heading.closest('.split__copy, .text-block');
    const boxed = Boolean(panel) && (() => { const style = getComputedStyle(panel); return !/^(rgba\(0, 0, 0, 0\)|transparent)$/.test(style.backgroundColor) || parseFloat(style.borderTopWidth) > 0; })();
    const centred = getComputedStyle(heading).textAlign === 'center' || (box.width - (right - left) > 40 && Math.abs((left + right) / 2 - (box.left + box.right) / 2) < 6);
    // A split row with its photo first heads the copy column beside the photo (hhmhotels.com's alternating rows).
    const beside = Boolean(heading.closest('.split[data-layout="split"][data-side="media-start"] > .split__copy'));
    return { block: heading.closest('[data-authoring-block]').getAttribute('data-block-id'), text: heading.textContent.trim().slice(0, 60), left: Math.round(left), centred, boxed, beside, inverse: Boolean(heading.closest('.block--cta, .block--band, [data-variant="photo-cards"]')) };
  });
  // Split rows set side by side: the photo column's box and the copy's own extent (splitEdges).
  const extent = (element) => { const rects = [...element.querySelectorAll('h2, h3, p, li, .button, table')].map((item) => item.getBoundingClientRect()).filter((rect) => rect.width > 0 && rect.height > 0); return rects.length ? { top: Math.min(...rects.map((rect) => rect.top)), bottom: Math.max(...rects.map((rect) => rect.bottom)) } : null; };
  const splits = [...main.querySelectorAll('[data-authoring-block="splitMedia"] .split[data-layout="split"]')].flatMap((row) => {
    // The photos themselves, not their column (which stretches to the row): their top and bottom over the set.
    const photos = [...row.querySelectorAll(':scope > .split__media-set > .split__media')].filter((item) => item.getBoundingClientRect().height > 0);
    const rects = photos.map((item) => item.getBoundingClientRect());
    const media = rects.length ? { top: Math.min(...rects.map((rect) => rect.top)), bottom: Math.max(...rects.map((rect) => rect.bottom)), left: Math.min(...rects.map((rect) => rect.left)), height: Math.max(...rects.map((rect) => rect.bottom)) - Math.min(...rects.map((rect) => rect.top)) } : null;
    const copy = row.querySelector(':scope > .split__copy');
    const text = copy && extent(copy);
    const box = copy?.getBoundingClientRect();
    if (!media || !text || !box || media.height < 40 || Math.abs(media.left - box.left) < 40) return [];
    // A sticky photo stays beside copy longer than itself as it is read (template.css: the photo's height is capped).
    const sticky = photos.some((item) => getComputedStyle(item).position === 'sticky');
    return [{ block: row.closest('[data-block-id]')?.getAttribute('data-block-id') ?? null, media: { top: Math.round(media.top), bottom: Math.round(media.bottom) }, copy: { top: Math.round(text.top), bottom: Math.round(text.bottom) }, sticky }];
  });
  // Each section's buttons and the text right above them (actionsDetached).
  const actions = [...main.querySelectorAll('[data-authoring-block] .button')].filter((button) => button.getBoundingClientRect().width > 0 && !button.closest('form, nav, .track__controls, .related-tile, .gallery__item, .feature-card, .case, article')).flatMap((button) => {
    const section = button.closest('[data-authoring-block]');
    const box = button.getBoundingClientRect();
    const above = [...section.querySelectorAll('h1, h2, h3, p, li')].filter((item) => !item.contains(button) && item.getBoundingClientRect().height > 0 && item.getBoundingClientRect().bottom <= box.top + 2 && item.getBoundingClientRect().right > box.left - 400 && item.getBoundingClientRect().left < box.right + 400);
    if (!above.length) return [];
    const nearest = above.reduce((best, item) => (item.getBoundingClientRect().bottom > best.getBoundingClientRect().bottom ? item : best));
    const rect = nearest.getBoundingClientRect();
    return [{ block: section.getAttribute('data-block-id'), label: button.textContent.trim().slice(0, 40), gap: Math.round(box.top - rect.bottom), offset: Math.round(box.left - rect.left), centred: getComputedStyle(nearest).textAlign === 'center' }];
  });
  // The item titles of each section set (a block and the blocks going on from it, data-continues): their kind (the
  // class ending in __title), tag and size (setType).
  const titles = [...main.querySelectorAll('[data-authoring-block] [class*="__title"]')].filter((title) => title.getBoundingClientRect().height > 0).flatMap((title) => {
    const section = title.closest('[data-authoring-block]');
    const kind = [...title.classList].find((name) => name.endsWith('__title'));
    return kind ? [{ set: section.getAttribute('data-continues') || section.getAttribute('data-block-id'), block: section.getAttribute('data-block-id'), kind, tag: title.tagName.toLowerCase(), size: Math.round(parseFloat(getComputedStyle(title).fontSize) * 10) / 10, text: title.textContent.trim().slice(0, 40) }] : [];
  });
  return { blocks, palette, colours, photos, overlays, measures, scrollers, carousels, targets, columns, textAxis, centred, headings, splits, actions, titles };
}

// The titles of one kind in one section set at one size and level (owner 2026-11-14: "字体大小都不一样": the hotel home's
// six service cards, split over two grids, had 22px titles in the first and 36px in the second, which had no heading of
// its own and set its card titles as section headings). [{ block, kind, sizes, tags, text }]
export function unevenSetType(titles = []) {
  const groups = new Map();
  for (const title of titles) {
    const key = `${title.set}|${title.kind}`;
    groups.set(key, [...(groups.get(key) ?? []), title]);
  }
  return [...groups.values()].flatMap((list) => {
    const sizes = [...new Set(list.map((title) => title.size))];
    const tags = [...new Set(list.map((title) => title.tag))];
    if (sizes.length < 2 && tags.length < 2) return [];
    const odd = list.find((title) => title.size !== list[0].size || title.tag !== list[0].tag) ?? list[0];
    return [{ block: odd.block, kind: odd.kind, sizes, tags, text: odd.text }];
  });
}

// A split row's photo and copy share their edges (owner 2026-11-12: "左内容右图或者右内容左图也没有对齐", "不应该照搬固定宽度
// 和顶端对齐"): copy running a sixth or more past its photo leaves the column under the photo empty; a photo a sixth or
// more taller than its copy needs the copy level with its middle. [{ block, ... }]
export const SPLIT_EDGE_SHARE = 1 / 6;
export function splitEdges(splits = []) {
  return splits.flatMap(({ block, media, copy, sticky = false }) => {
    const [mediaHeight, copyHeight] = [media.bottom - media.top, copy.bottom - copy.top];
    if (copyHeight - mediaHeight > mediaHeight * SPLIT_EDGE_SHARE && !sticky) return [{ block, issue: 'split_edges', side: 'copy_past_photo', photo: mediaHeight, copy: copyHeight }];
    const middle = Math.abs((media.top + media.bottom) / 2 - (copy.top + copy.bottom) / 2);
    if (mediaHeight - copyHeight > copyHeight * SPLIT_EDGE_SHARE && middle > 16) return [{ block, issue: 'split_edges', side: 'copy_off_middle', photo: mediaHeight, copy: copyHeight }];
    return [];
  });
}

// A button stays with the copy it ends (owner 2026-11-12: "首页的Talk to our team位置也不对": the closing band's button sat
// 335px under its paragraph and 400px to its right). [{ block, label, gap, offset }]
export const ACTION_GAP = 120;
export const ACTION_OFFSET = 48;
export const actionsDetached = (actions = []) => actions.filter((action) => action.gap > ACTION_GAP || (!action.centred && Math.abs(action.offset) > ACTION_OFFSET)).map(({ block, label, gap, offset }) => ({ block, label, gap, offset }));

// Paragraphs of more than CENTRED_LINES lines set centred (their ragged left edge is hard to read along): one per
// Section headings off the reference's axis (align: components.headingAlign): where its headings start on the content's
// left edge, a centred one, or one starting elsewhere than most (a boxed panel's and a closing or band section's
// heading keep their own inset, and so does the heading of a split row's copy beside a photo set first: hotel-rm's
// alternating rows, 2026-11-14, four failures no stylesheet repair could mend). [{ block, text, kind }]
export const HEADING_AXIS_TOLERANCE = 8;
export function headingAxes(headings = [], align = null) {
  if (align !== 'start') return [];
  const open = headings.filter((heading) => !heading.boxed && !heading.inverse && !heading.beside);
  const counts = new Map();
  for (const heading of open.filter((item) => !item.centred)) { const key = Math.round(heading.left / HEADING_AXIS_TOLERANCE); counts.set(key, (counts.get(key) ?? 0) + 1); }
  const axis = [...counts].sort((left, right) => right[1] - left[1])[0]?.[0];
  return open.flatMap((heading) => (heading.centred ? [{ block: heading.block, text: heading.text, kind: 'centred' }] : axis !== undefined && Math.abs(heading.left - axis * HEADING_AXIS_TOLERANCE) > 2 * HEADING_AXIS_TOLERANCE ? [{ block: heading.block, text: heading.text, kind: 'off_axis', left: heading.left }] : []));
}

// block, with its longest. [{ block, lines, text }]
export const CENTRED_LINES = 3;
export function centredRunningText(centred = []) {
  const longest = new Map();
  for (const item of centred.filter((entry) => entry.lines > CENTRED_LINES)) if (!longest.has(item.block) || longest.get(item.block).lines < item.lines) longest.set(item.block, item);
  return [...longest.values()];
}

// A heading and the text under it that do not line up: one centred over the other set flush (mixed), or both flush
// but starting a few pixels apart (offset; further apart is a layout, a heading beside its text). [{ block, heading,
// issue, ... }]
export const EDGE_TOLERANCE = 2;
export const EDGE_REACH = 48;
export function misalignedColumns(columns = []) {
  return columns.flatMap((column) => {
    const { block, heading } = column;
    // Running text reads flush (centred over more than a few lines it fails too): the heading follows its text.
    if (column.headingAlign !== column.textAlign) return [{ block, heading, issue: 'mixed_text_alignment', headingAlign: column.headingAlign, textAlign: column.textAlign, fix: column.textAlign === 'start' ? 'set the heading flush (text-align: start) on its text\'s left edge; the text stays flush' : 'set the text flush and the heading with it (text-align: start)' }];
    const offset = column.headingLeft - column.textLeft;
    if (column.headingAlign === 'start' && Math.abs(offset) > EDGE_TOLERANCE && Math.abs(offset) <= EDGE_REACH) return [{ block, heading, issue: 'text_edge_offset', offset }];
    return [];
  });
}

// Pages whose running text starts on another line than the rest of the site's at the same width (one site, one
// gutter): [{ route, axis, site }] against the axis most pages share, when at least three pages have one.
export function gutterOutliers(axes = []) {
  const known = axes.filter((item) => Number.isFinite(item.axis));
  if (known.length < 3) return [];
  const counts = new Map();
  for (const { axis } of known) counts.set(axis, (counts.get(axis) ?? 0) + 1);
  const site = [...counts].sort((left, right) => right[1] - left[1])[0][0];
  return known.filter((item) => Math.abs(item.axis - site) > EDGE_TOLERANCE).map(({ route, axis }) => ({ route, axis, site }));
}

// Controls smaller than TARGET_MIN pixels across (WCAG 2.2 target size, minimum), one per block and size: a warning for
// now, not a failure (the plan: see how many the sites have first). [{ block, text, width, height }]
export const TARGET_MIN = 24;
export function smallTargets(targets = []) {
  const seen = new Set();
  return targets.filter((target) => {
    const key = `${target.block} ${target.width}x${target.height}`;
    if ((target.width >= TARGET_MIN && target.height >= TARGET_MIN) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// A row that scrolls sideways without the template's own scroller (a site's CSS faking a carousel, or content too
// wide for its box): a visitor sees cut-off cards and no way to move them. [{ block, selector }]
export const unmarkedScrollers = (scrollers = []) => scrollers.filter((scroller) => !scroller.marked).map(({ block, selector }) => ({ block, selector }));
// A carousel whose items do not fit but that shows fewer than its two buttons. [{ block, controls }]
export const carouselsWithoutControls = (carousels = []) => carousels.filter((carousel) => carousel.overflows && carousel.controls < 2).map(({ block, controls }) => ({ block, controls }));

// Paragraphs whose lines run wider than MEASURE_LIMIT ch (treatment-practice: a text column of about 70ch; the limit
// leaves room), one finding per block with its widest: [{ block, ch }].
export const MEASURE_LIMIT = 80;
export function longMeasures(measures = []) {
  const widest = new Map();
  for (const measure of measures.filter((item) => item.ch > MEASURE_LIMIT)) widest.set(measure.block, Math.max(widest.get(measure.block) ?? 0, measure.ch));
  return [...widest].map(([block, ch]) => ({ block, ch }));
}

// Photos of one group (a gallery, a row of cards, at least three) where one is shown much larger than the group's
// median, so it outweighs the rest; a photo a layout widened on purpose (a mosaic) is not counted: [{ block, src, ratio }].
export const PHOTO_WEIGHT_LIMIT = 1.6;
export function unevenPhotos(photos) {
  const groups = new Map();
  for (const photo of photos.filter((item) => item.block && !item.explicit)) groups.set(photo.block, [...(groups.get(photo.block) ?? []), photo]);
  const found = [];
  for (const [block, group] of groups) {
    if (group.length < 3) continue;
    const areas = group.map((photo) => photo.box.width * photo.box.height).sort((a, b) => a - b);
    const median = areas[Math.floor(areas.length / 2)];
    for (const photo of group) { const ratio = (photo.box.width * photo.box.height) / median; if (ratio > PHOTO_WEIGHT_LIMIT) found.push({ block, src: photo.src, ratio: Math.round(ratio * 10) / 10 }); }
  }
  return found;
}

// An overlay that darkens the whole photo while its text takes one side only: even its lightest stop above
// OVERLAY_LIMIT (the photo's textless side should keep its own light; treatment-practice.md). A text across most of
// the photo (TEXT_ACROSS of its width or more), or in its middle (a centred title strip: no side of the photo wider
// than 1 - TEXT_ACROSS is left clear), wants an even overlay, as does a form hero whose copy and form span the photo
// between them. Checked at desktop width (on a phone the text covers the photo). Without clearShare (an older
// measurement) the text is taken to sit at one side.
export const OVERLAY_LIMIT = 0.35;
export const TEXT_ACROSS = 0.6;
const clearSide = (overlay) => overlay.clearShare ?? 1 - (overlay.textShare ?? 0);
export const heavyOverlays = (overlays = []) => overlays.filter((overlay) => overlay.alphas.length && clearSide(overlay) > 1 - TEXT_ACROSS && Math.min(...overlay.alphas) > OVERLAY_LIMIT).map((overlay) => ({ block: overlay.block, lightest: Math.min(...overlay.alphas), textShare: overlay.textShare, clearShare: clearSide(overlay) }));

// Pairs of photos whose boxes overlap by more than 4% of the smaller one: [{ a, b, block }].
export function photoOverlaps(photos) {
  const pairs = [];
  for (let i = 0; i < photos.length; i += 1) for (let j = i + 1; j < photos.length; j += 1) {
    const [a, b] = [photos[i].box, photos[j].box];
    const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
    const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
    if (width > 0 && height > 0 && width * height > 0.04 * Math.min(a.width * a.height, b.width * b.height)) pairs.push({ a: photos[i].src, b: photos[j].src, block: photos[i].block });
  }
  return pairs;
}

// Photos cropped to less than CROP_MINIMUM of themselves: [{ src, block, shown }].
export const heavyCrops = (photos) => photos.filter((photo) => photo.fit === 'cover').map((photo) => ({ src: photo.src, block: photo.block, shown: Math.round(shownShare(photo.box, photo.natural) * 100) / 100 })).filter((photo) => photo.shown < CROP_MINIMUM);
