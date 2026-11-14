// The captured DOM (docs/research/reference-pages/<folder>/raw/<viewport>.json, capture-reference.mjs extractPage) as a
// tree, and the capture's own rules run on it without a browser: the section list (lib/reference-anatomy.mjs
// extractSectionShapes), the visual density (lib/density.mjs measureDensity) and the title (scaffold-placeholder-pages.mjs
// measureHeroText). scripts/check-reference-capture.mjs checks a capture with them before any model looks at it.
//
// The capture records each element's selector, rect (at the top of the page: scrollThroughPage ends there, so a rect's
// y is its place in the page), computed styles and own text, in document order; not its parent. The parent is the
// selector without its last step, except for an element with an id, whose selector starts at itself: its parent comes
// from the rendered.html saved with the capture (htmlParents), else it hangs from <body>.
//
// What the JSON cannot give, and how each rule is approximated here:
//  - innerText: the own text of an element and its rendered descendants, joined by spaces;
//  - getClientRects().length > 0: no display:none on the element or an ancestor and not display:contents;
//  - border-top-width / border-left-width: the captured `border` shorthand (empty when the sides differ: no border);
//  - a title's line boxes (Range.getClientRects): the h1's own box.

import { PAGE_SHELL } from './page-shell.mjs';

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr', 'keygen']);
// Elements whose content page.content() writes as text: no element inside them is in the DOM.
const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title', 'xmp', 'iframe', 'noembed', 'noframes', 'noscript', 'plaintext']);
// Tags whose own text is never shown.
export const NON_TEXT = new Set(['html', 'head', 'script', 'style', 'noscript', 'template', 'title', 'meta', 'link', 'option', 'svg', 'path']);

const decode = (text) => text.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');

// CSS.escape, as the capture's selectorFor applied it to ids.
export function cssEscape(value) {
  const text = String(value);
  let out = '';
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code === 0) out += '�';
    else if ((code >= 1 && code <= 0x1f) || code === 0x7f || (index === 0 && code >= 0x30 && code <= 0x39) || (index === 1 && code >= 0x30 && code <= 0x39 && text.charCodeAt(0) === 0x2d)) out += `\\${code.toString(16)} `;
    else if (index === 0 && code === 0x2d && text.length === 1) out += `\\${text[index]}`;
    else if (code >= 0x80 || code === 0x2d || code === 0x5f || (code >= 0x30 && code <= 0x39) || (code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a)) out += text[index];
    else out += `\\${text[index]}`;
  }
  return out;
}

// The element tree of a page.content() serialization (well formed: every non-void element has its end tag).
function parseHtml(html) {
  const root = { tag: '#root', id: '', parent: null, children: [] };
  let current = root;
  const pattern = /<!--[\s\S]*?-->|<![^>]*>|<\/([A-Za-z][^\s/>]*)\s*>|<([A-Za-z][^\s/>]*)((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>/g;
  let match;
  while ((match = pattern.exec(html))) {
    const [, closing, opening, attributes = '', selfClosing] = match;
    if (closing) {
      let node = current;
      while (node !== root && node.tag.toLowerCase() !== closing.toLowerCase()) node = node.parent;
      if (node !== root) current = node.parent;
      continue;
    }
    if (!opening) continue;
    const id = /(?:^|\s)id\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/.exec(attributes);
    // A template's content is not in the document (querySelectorAll does not see it): it gets no siblings.
    const node = { tag: opening, id: id ? decode(id[1] ?? id[2] ?? id[3]) : '', parent: current, children: [], detached: current.detached || current.tag === 'template' };
    current.children.push(node);
    const lower = opening.toLowerCase();
    if (RAW_TEXT.has(lower) && !selfClosing) {
      const end = html.toLowerCase().indexOf(`</${lower}`, pattern.lastIndex);
      pattern.lastIndex = end < 0 ? html.length : html.indexOf('>', end) + 1 || html.length;
      continue;
    }
    if (!selfClosing && !VOID.has(lower)) current = node;
  }
  return root;
}

// The capture's selectorFor on a parsed element.
function selectorOf(node) {
  const parts = [];
  for (let current = node; current && current.parent && current.tag.toLowerCase() !== 'html'; current = current.parent) {
    let part = current.tag;
    if (current.id) { parts.unshift(`${part}#${cssEscape(current.id)}`); break; }
    const siblings = current.parent.children.filter((child) => child.tag === current.tag);
    if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
    parts.unshift(part);
  }
  return parts.join(' > ');
}

// Selector of each id-anchored element of rendered.html -> its parent's selector (as the capture writes selectors).
export function htmlParents(html) {
  const parents = new Map();
  const walk = (node) => {
    for (const child of node.children) {
      if (child.id && !child.detached && !parents.has(selectorOf(child))) parents.set(selectorOf(child), child.parent.tag === '#root' ? null : selectorOf(child.parent));
      walk(child);
    }
  };
  walk(parseHtml(html));
  return parents;
}

// A matcher for a selector list of simple selectors (tag, .class, [attr], [attr=value]), the form PAGE_SHELL uses.
export function selectorMatcher(list) {
  const tests = list.split(',').map((item) => item.trim()).filter(Boolean).map((selector) => {
    if (/[\s>+~]/.test(selector.replace(/\[[^\]]*\]/g, ''))) throw new Error(`capture-dom supports simple selectors only: ${selector}`);
    const tag = /^[a-z][a-z0-9-]*/i.exec(selector)?.[0]?.toLowerCase() ?? null;
    const classes = [...selector.matchAll(/\.([\w-]+)/g)].map((item) => item[1]);
    const attributes = [...selector.matchAll(/\[([\w-]+)(?:=["']?([^"'\]]*)["']?)?\]/g)].map((item) => [item[1], item[2]]);
    return (node) => (!tag || node.tag.toLowerCase() === tag)
      && classes.every((name) => String(node.attributes?.class ?? '').split(/\s+/).includes(name))
      && attributes.every(([name, value]) => (value === undefined ? name in (node.attributes ?? {}) : node.attributes?.[name] === value));
  });
  return (node) => tests.some((test) => test(node));
}

const px = (value) => Number.parseFloat(value) || 0;
export const rectOf = (node) => ({ top: node.rect.y, bottom: node.rect.y + node.rect.height, left: node.rect.x, right: node.rect.x + node.rect.width, width: node.rect.width, height: node.rect.height });

// The captured elements as a tree: each node is the captured element with parent, children, depth and what its
// ancestors decide for it (displayed: no display:none on it or above; opacity: the product of its own and its
// ancestors'; headerBox / footerBox: the nearest header / footer of PAGE_SHELL at or above it; inShell).
export function captureTree(extraction, { html = null, shell = PAGE_SHELL } = {}) {
  const nodes = extraction.elements.map((element, index) => ({ ...element, index, parent: null, children: [] }));
  const bySelector = new Map();
  for (const node of nodes) if (!bySelector.has(node.selector)) bySelector.set(node.selector, node);
  const root = nodes.find((node) => node.tag === 'html') ?? null;
  const body = bySelector.get('body') ?? null;
  const parents = html ? htmlParents(html) : new Map();
  for (const node of nodes) {
    if (node === root) continue;
    const cut = node.selector.lastIndexOf(' > ');
    const parentSelector = cut >= 0 ? node.selector.slice(0, cut) : node.selector.includes('#') ? parents.get(node.selector) ?? 'body' : '';
    let parent = bySelector.get(parentSelector ?? '') ?? body ?? root;
    if (!parent || parent.index >= node.index) parent = body && body.index < node.index ? body : root;
    if (!parent || parent === node) continue;
    node.parent = parent;
    parent.children.push(node);
  }
  const header = selectorMatcher(shell.header);
  const footer = selectorMatcher(shell.footer);
  // A header or footer inside the page's own content (shell.page: an article's header holding its hero) is not shell.
  const page = selectorMatcher(shell.page);
  const order = [];
  const visit = (node, depth) => {
    const parent = node.parent;
    node.depth = depth;
    node.displayed = (!parent || parent.displayed) && node.styles?.display !== 'none';
    node.opacity = (parent ? parent.opacity : 1) * (Number.parseFloat(node.styles?.opacity ?? '1') || 0);
    node.inPage = Boolean(parent?.inPage) || page(node);
    node.headerBox = header(node) && !parent?.inPage ? node : parent?.headerBox ?? null;
    node.footerBox = footer(node) && !parent?.inPage ? node : parent?.footerBox ?? null;
    node.inShell = Boolean(node.headerBox || node.footerBox);
    order.push(node);
  };
  // Iterative depth-first walk: a deep page must not overflow the stack.
  if (root) {
    const stack = [[root, 0]];
    while (stack.length) {
      const [node, depth] = stack.pop();
      visit(node, depth);
      for (let index = node.children.length - 1; index >= 0; index -= 1) stack.push([node.children[index], depth + 1]);
    }
  }
  // containsShell: a header or footer below the node (querySelector(shell) looks at descendants only).
  for (let index = order.length - 1; index >= 0; index -= 1) {
    const node = order[index];
    node.containsShell = node.children.some((child) => child.headerBox === child || child.footerBox === child || child.containsShell);
  }
  const vw = extraction.viewport?.width ?? 1440;
  const vh = extraction.viewport?.height ?? 1000;
  return { nodes: order, root, body, viewport: { width: vw, height: vh }, scrollHeight: extraction.document?.scrollHeight ?? Math.max(0, ...nodes.map((node) => node.rect.y + node.rect.height)), url: extraction.url, header: order.find((node) => node.headerBox === node) ?? null, footer: order.find((node) => node.footerBox === node) ?? null };
}

export function* descendants(node) {
  const stack = [...node.children].reverse();
  while (stack.length) {
    const next = stack.pop();
    yield next;
    for (let index = next.children.length - 1; index >= 0; index -= 1) stack.push(next.children[index]);
  }
}
const has = (node, test) => { for (const item of descendants(node)) if (test(item)) return true; return false; };
const closest = (node, test) => { for (let current = node; current; current = current.parent) if (test(current)) return current; return null; };
const tagIn = (...tags) => (node) => tags.includes(node.tag.toLowerCase());

// textContent (hidden text included) and innerText (rendered text only) of a node.
export function textOf(node) {
  const parts = [node.directText];
  for (const item of descendants(node)) if (!NON_TEXT.has(item.tag)) parts.push(item.directText);
  return parts.filter(Boolean).join(' ');
}
export function innerTextOf(node) {
  if (!node.displayed) return '';
  const parts = [];
  const walk = (item) => {
    if (!item.displayed || NON_TEXT.has(item.tag)) return;
    if (item.styles?.visibility !== 'hidden' && item.directText) parts.push(item.directText);
    item.children.forEach(walk);
  };
  walk(node);
  return parts.join(' ');
}
const wordCount = (text) => text.split(/\s+/).filter(Boolean).length;

// The content's top (the header's foot) and foot (the footer's top), as the browser-side rules take them.
function contentSpan(tree) {
  const top = tree.header ? tree.header.rect.y + tree.header.rect.height : 0;
  const bottom = tree.footer ? tree.footer.rect.y : tree.scrollHeight;
  return { top, bottom };
}
// getClientRects().length > 0, approximated.
const rendered = (node) => node.displayed && node.styles?.display !== 'contents';

// reference-anatomy.mjs extractSectionShapes, up to the section list it measures: the container whose stacked
// full-width children cover most of the content, its tall wrappers expanded, a tall single block split at its largest
// headings. Returns each section's span (virtual: a stretch between headings). Kept step for step with the browser
// function so a capture whose list has fewer than two sections is found here, before scaffold-placeholder-pages.mjs
// stops on it ("could not find the section list", hhmhotels.com/contact-us, 2026-11-14).
export function sectionList(tree) {
  const innerWidth = tree.viewport.width;
  const { top, bottom } = contentSpan(tree);
  const visible = (node) => rendered(node) && node.styles?.visibility !== 'hidden';
  const isSection = (node) => {
    if (!visible(node) || tagIn('nav', 'script', 'style')(node) || node.inShell || node.containsShell) return false;
    const rect = rectOf(node);
    return rect.width >= innerWidth * 0.6 && rect.height >= 60 && rect.right > 0 && rect.left < innerWidth && rect.top >= top - 2 && rect.top + rect.height <= bottom + 2;
  };
  const contentHeight = Math.max(bottom - top, 1);
  let best = null;
  let bestScore = -1;
  if (!tree.body) return [];
  for (const element of [tree.body, ...descendants(tree.body)]) {
    const sections = element.children.filter(isSection);
    if (sections.length < 2) continue;
    const spans = sections.map((section) => [rectOf(section).top, rectOf(section).bottom]).sort((a, b) => a[0] - b[0]);
    let covered = 0;
    let cursor = -Infinity;
    for (const [start, end] of spans) { if (end > cursor) { covered += end - Math.max(start, cursor); cursor = end; } }
    const total = spans.reduce((sum, [start, end]) => sum + (end - start), 0);
    if (total - covered > covered * 0.2) continue;
    const score = Math.round((covered / contentHeight) * 10) / 10 + sections.length / 1000;
    if (score > bestScore) { bestScore = score; best = sections; }
  }
  const innerStack = (section) => {
    const box = rectOf(section);
    let found = null;
    let foundCount = 0;
    for (const element of [section, ...descendants(section)]) {
      const inner = element.children.filter((child) => isSection(child) && child.rect.width >= box.width * 0.6);
      if (inner.length < 2) continue;
      const innerHeight = inner.reduce((sum, child) => sum + child.rect.height, 0);
      if (innerHeight >= box.height * 0.6 && innerHeight <= box.height * 1.05 && inner.length > foundCount) { found = inner; foundCount = inner.length; }
    }
    return found;
  };
  const expand = (list, depth = 0) => list.flatMap((section) => {
    if (depth > 3 || section.rect.height <= contentHeight * 0.4) return [section];
    const inner = innerStack(section);
    return inner ? expand(inner, depth + 1) : [section];
  });
  const span = (node) => ({ ...rectOf(node), virtual: false, selector: node.selector });
  if (!best) return [];
  const segment = (section) => {
    const box = rectOf(section);
    if (box.height <= contentHeight * 0.3) return [span(section)];
    const headings = [...descendants(section)].filter((node) => tagIn('h1', 'h2', 'h3')(node) && visible(node) && px(node.styles?.['font-size']) >= 20);
    const largest = Math.max(0, ...headings.map((node) => px(node.styles['font-size'])));
    const cuts = headings.filter((node) => px(node.styles['font-size']) >= largest - 2);
    if (cuts.length < 3) return [span(section)];
    const seen = new Set();
    const nodes = cuts.filter((node) => node.rect.y - box.top > 60 && !seen.has(node.rect.y) && seen.add(node.rect.y)).sort((a, b) => a.rect.y - b.rect.y);
    const points = [box.top, ...nodes.map((node) => node.rect.y)];
    return points.map((at, index) => ({ top: at, bottom: index + 1 < points.length ? points[index + 1] : box.bottom, left: box.left, right: box.right, width: box.width, virtual: true, selector: section.selector }))
      .map((part) => ({ ...part, height: part.bottom - part.top })).filter((part) => part.height >= 60);
  };
  return expand(best).flatMap(segment);
}

// lib/density.mjs measureDensity on the captured DOM (at the capture's width), plus firstScreenPhotoPct: the share of
// the first window (0 to the viewport's height, the part under the header included) that photos cover.
export function domDensity(tree) {
  const { top, bottom } = contentSpan(tree);
  const height = Math.max(bottom - top, 1);
  const width = tree.viewport.width;
  const visible = (node) => node.displayed && node.styles?.visibility !== 'hidden' && node.rect.width > 60 && node.rect.height > 60;
  const inside = (rect) => rect.bottom > top + 1 && rect.top < bottom - 1 && rect.right > 0 && rect.left < width;
  const all = tree.body ? [...descendants(tree.body)] : [];
  const contentBoxes = (list) => list.filter((node) => !node.inShell && visible(node)).map(rectOf);
  const photoNodes = [...tree.nodes.filter(tagIn('img', 'video')), ...all.filter((node) => /url\(/.test(node.styles?.['background-image'] ?? ''))];
  const photoBoxes = contentBoxes(photoNodes);
  const photos = photoBoxes.filter(inside);
  const boxed = (node) => !/^(rgba\(0, 0, 0, 0\)|transparent)$/.test(node.styles?.['background-color'] ?? 'transparent') || px(node.styles?.border) > 0 || (node.styles?.['box-shadow'] ?? 'none') !== 'none';
  const cardGrid = (node) => {
    const cards = node.children.filter((child) => visible(child) && boxed(child) && innerTextOf(child).trim() && !has(child, tagIn('img')));
    return cards.length >= 3 && new Set(cards.map((card) => Math.round(card.rect.y / 10))).size < cards.length;
  };
  const charts = contentBoxes(tree.nodes.filter(tagIn('svg', 'canvas'))).filter(inside).filter((rect) => rect.width > 200 && rect.height > 120);
  const structured = [...contentBoxes(tree.nodes.filter(tagIn('table', 'iframe'))).filter(inside), ...charts, ...contentBoxes(all.filter(cardGrid)).filter(inside)];
  const area = (rects, from = top, to = bottom) => {
    const cells = new Set();
    for (const rect of rects) {
      const x0 = Math.max(0, Math.floor(rect.left / 20)), x1 = Math.min(Math.ceil(width / 20), Math.ceil(rect.right / 20));
      const y0 = Math.floor(Math.max(from, rect.top) / 20), y1 = Math.ceil(Math.min(to, rect.bottom) / 20);
      for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) cells.add(y * 10000 + x);
    }
    return cells.size * 400;
  };
  const share = (rects) => Math.min(100, Math.round((100 * area(rects)) / (width * height)));
  const textual = tree.nodes.filter((node) => tagIn('p', 'li', 'h1', 'h2', 'h3', 'h4', 'summary')(node)
    && !node.inShell && !closest(node, tagIn('nav', 'form', 'table')) && !has(node, tagIn('p', 'li', 'h2', 'h3')) && rendered(node) && node.styles?.visibility !== 'hidden');
  const words = wordCount(textual.map(innerTextOf).join(' '));
  const breaks = [...photos, ...structured].map((rect) => ({ top: Math.max(top, rect.top), bottom: Math.min(bottom, rect.bottom) })).sort((a, b) => a.top - b.top);
  let cursor = top;
  let longest = 0;
  for (const item of breaks) { longest = Math.max(longest, item.top - cursor); cursor = Math.max(cursor, item.bottom); }
  longest = Math.max(longest, bottom - cursor);
  const window = tree.viewport.height;
  const firstScreen = photoBoxes.filter((rect) => rect.bottom > 0 && rect.top < window && rect.right > 0 && rect.left < width);
  return {
    contentHeight: Math.round(height),
    images: photos.length,
    structured: structured.length,
    words,
    wordsPer1000px: Math.round((1000 * words) / height),
    photoAreaPct: share(photos),
    structuredAreaPct: share(structured),
    visualAreaPct: share([...photos, ...structured]),
    longestTextOnlyPx: Math.round(longest),
    firstScreenPhotoPct: Math.min(100, Math.round((100 * area(firstScreen, 0, window)) / (width * window))),
  };
}

// scaffold-placeholder-pages.mjs measureHeroText's choice of title: the first shown h1 outside the shell, else one in a
// header without navigation (a page's own masthead) outside the footer. titles: how many shown h1s the page has.
export function heroTitles(tree) {
  const shown = (node) => textOf(node).trim() && node.rect.width > 0 && node.displayed && node.styles?.visibility !== 'hidden';
  const titles = tree.nodes.filter((node) => node.tag === 'h1' && shown(node));
  const navigation = (node) => node.tag === 'nav' || node.attributes?.role === 'navigation';
  const inPageHeader = (node) => Boolean(node.headerBox) && !has(node.headerBox, navigation) && !node.footerBox;
  const heading = titles.find((node) => !node.inShell) ?? titles.find(inPageHeader) ?? null;
  const usable = heading && px(heading.styles?.['font-size']) > 0 ? heading : null;
  return { titles: titles.length, picked: usable ? { selector: usable.selector, text: textOf(usable).replace(/\s+/g, ' ').trim() } : null, first: titles[0] ? { selector: titles[0].selector, text: textOf(titles[0]).replace(/\s+/g, ' ').trim() } : null };
}
