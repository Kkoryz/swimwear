// Measures the full-width sections of a reference page (runs in the browser). Classification lives in pattern-map.mjs.


// Runs in the browser (page.evaluate(extractSectionShapes, PAGE_SHELL)). Finds the element that holds the most
// full-width sections between Header and Footer.
export function extractSectionShapes(pageShell) {
  const shell = pageShell.shell;
  const header = document.querySelector(pageShell.header);
  const footer = document.querySelector(pageShell.footer);
  // Smooth scrolling would leave scrollY mid-flight; measure at the true top.
  document.documentElement.style.scrollBehavior = 'auto';
  scrollTo(0, 0);
  const top = header ? header.getBoundingClientRect().bottom + scrollY : 0;
  const bottom = footer ? footer.getBoundingClientRect().top + scrollY : document.documentElement.scrollHeight;
  const visible = (element) => {
    const style = getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
  };
  const isSection = (element) => {
    if (!visible(element) || element.matches('nav, script, style') || element.closest(shell) || element.querySelector(shell)) return false;
    const rect = element.getBoundingClientRect();
    const docTop = rect.top + scrollY;
    return rect.width >= innerWidth * 0.6 && rect.height >= 60 && rect.right > 0 && rect.left < innerWidth && docTop >= top - 2 && docTop + rect.height <= bottom + 2;
  };
  // Pick the container whose stacked full-width children cover most of the content height. Counting children
  // alone picks carousels and product grids; overlapping children (slides) are rejected.
  const contentHeight = Math.max(bottom - top, 1);
  let best = null;
  let bestScore = -1;
  for (const element of document.querySelectorAll('body, body *')) {
    const sections = [...element.children].filter(isSection);
    if (sections.length < 2) continue;
    const spans = sections.map((section) => { const box = section.getBoundingClientRect(); return [box.top + scrollY, box.bottom + scrollY]; }).sort((a, b) => a[0] - b[0]);
    let covered = 0;
    let cursor = -Infinity;
    for (const [start, end] of spans) { if (end > cursor) { covered += end - Math.max(start, cursor); cursor = end; } }
    const total = spans.reduce((sum, [start, end]) => sum + (end - start), 0);
    if (total - covered > covered * 0.2) continue;
    const score = Math.round((covered / contentHeight) * 10) / 10 + sections.length / 1000;
    if (score > bestScore) { bestScore = score; best = sections; }
  }
  // A wrapper that holds most of the page and is itself a stack of full-width sections is expanded into them.
  // Single-child wrappers are followed down to the level that actually stacks the sections.
  const innerStack = (section) => {
    const box = section.getBoundingClientRect();
    let found = null;
    let foundCount = 0;
    for (const element of [section, ...section.querySelectorAll('*')]) {
      const inner = [...element.children].filter((child) => isSection(child) && child.getBoundingClientRect().width >= box.width * 0.6);
      if (inner.length < 2) continue;
      const innerHeight = inner.reduce((sum, child) => sum + child.getBoundingClientRect().height, 0);
      if (innerHeight >= box.height * 0.6 && innerHeight <= box.height * 1.05 && inner.length > foundCount) { found = inner; foundCount = inner.length; }
    }
    return found;
  };
  const expand = (list, depth = 0) => list.flatMap((section) => {
    if (depth > 3 || section.getBoundingClientRect().height <= contentHeight * 0.4) return [section];
    const inner = innerStack(section);
    return inner ? expand(inner, depth + 1) : [section];
  });
  if (best) best = expand(best);
  // Last resort for builders that put everything in one container: split a tall block at its large headings.
  // A segment keeps the heading nodes that bound it (startNode: none for the first), so the same stretch can be found
  // again at another width (measurePhoneSections).
  const virtualSection = (root, start, end, startNode = null, endNode = null) => {
    const rootBox = root.getBoundingClientRect();
    const inRange = (node) => { const t = node.getBoundingClientRect().top + scrollY; return t >= start - 1 && t < end - 1; };
    return {
      virtual: true,
      root,
      startNode,
      endNode,
      querySelectorAll: (selector) => [...root.querySelectorAll(selector)].filter(inRange),
      querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
      contains: (node) => root.contains(node),
      getBoundingClientRect: () => ({ top: start - scrollY, bottom: end - scrollY, height: end - start, left: rootBox.left, right: rootBox.right, width: rootBox.width }),
    };
  };
  const segment = (section) => {
    const box = section.getBoundingClientRect();
    if (box.height <= contentHeight * 0.3) return [section];
    const headings = [...section.querySelectorAll('h1, h2, h3')].filter((node) => visible(node) && parseFloat(getComputedStyle(node).fontSize) >= 20);
    const largest = Math.max(0, ...headings.map((node) => parseFloat(getComputedStyle(node).fontSize)));
    const top = (node) => node.getBoundingClientRect().top + scrollY;
    const cuts = headings.filter((node) => parseFloat(getComputedStyle(node).fontSize) >= largest - 2);
    if (cuts.length < 3) return [section];
    const start = box.top + scrollY;
    const end = box.bottom + scrollY;
    // One cut per distinct top, in page order, each more than 60px below the start.
    const seen = new Set();
    const nodes = cuts.filter((node) => top(node) - start > 60 && !seen.has(top(node)) && seen.add(top(node))).sort((a, b) => top(a) - top(b));
    const points = [{ at: start, node: null }, ...nodes.map((node) => ({ at: top(node), node }))];
    return points.map((point, index) => virtualSection(section, point.at, index + 1 < points.length ? points[index + 1].at : end, point.node, points[index + 1]?.node ?? null)).filter((part) => part.getBoundingClientRect().height >= 60);
  };
  if (best) best = best.flatMap(segment);
  // Each section is marked by its index (a segment: its root and the headings that bound it) and anchored by a path in
  // the document, so measurePhoneSections can measure the same sections again at a phone's width, also on a site that
  // reloads its page when the viewport changes (the marks go with the old document; the paths find the new one's).
  const pathOf = (node) => {
    const parts = [];
    for (let element = node; element && element !== document.documentElement; element = element.parentElement) {
      let nth = 1;
      for (let sibling = element.previousElementSibling; sibling; sibling = sibling.previousElementSibling) if (sibling.tagName === element.tagName) nth += 1;
      parts.unshift(`${element.tagName.toLowerCase()}:nth-of-type(${nth})`);
    }
    return parts.join(' > ');
  };
  const anchors = (best || []).map((section, index) => {
    if (!section.virtual) { section.setAttribute('data-sf-section', String(index)); return { section: pathOf(section) }; }
    section.root.setAttribute('data-sf-root', '');
    section.startNode?.setAttribute('data-sf-start', String(index));
    section.endNode?.setAttribute('data-sf-end', String(index));
    return { root: pathOf(section.root), start: section.startNode ? pathOf(section.startNode) : null, end: section.endNode ? pathOf(section.endNode) : null };
  });
  const words = (element) => [...element.querySelectorAll('p, li, h1, h2, h3, h4, td, th, span')]
    .filter((node) => visible(node) && !node.closest('nav, form') && !node.querySelector('p, li, h1, h2, h3, h4'))
    .map((node) => node.innerText).join(' ').split(/\s+/).filter(Boolean).length;
  return (best || []).map((section, index) => {
    // The section's own CSS background counts too (banner and band heroes are often painted that way).
    const nodes = [...(section.virtual ? [] : [section]), ...section.querySelectorAll('*')].filter((node) => visible(node) && (node.tagName === 'IMG' || /url\(/.test(getComputedStyle(node).backgroundImage)));
    const media = nodes.map((node) => node.getBoundingClientRect()).filter((rect) => rect.width > 40 && rect.height > 40);
    const backgroundOnly = nodes.length > 0 && nodes.every((node) => node.tagName !== 'IMG');
    const sectionRect = section.getBoundingClientRect();
    // A photo painted with background-size: cover across the section is a full-bleed photo, not a side image.
    const coverBackground = nodes.some((node) => node.tagName !== 'IMG' && /cover/.test(getComputedStyle(node).backgroundSize)
      && node.getBoundingClientRect().width >= sectionRect.width * 0.9 && node.getBoundingClientRect().height >= sectionRect.height * 0.8);
    const large = media.filter((rect) => rect.width >= 160 || rect.height >= 160);
    const rowTops = large.map((rect) => Math.round(rect.top / 40));
    const perRow = Math.max(0, ...rowTops.map((row) => rowTops.filter((other) => other === row).length));
    const rect = section.getBoundingClientRect();
    const style = (node) => getComputedStyle(node);
    const shown = (node) => visible(node) && node.getBoundingClientRect().width > 0;
    const texts = [...section.querySelectorAll('p, span, div, h1, h2, h3, h4, h5, h6, li, strong, b')].filter((node) => shown(node) && !node.children.length && node.textContent.trim());
    const firstHeadingNode = section.querySelector('h1, h2, h3');
    const eyebrow = texts.find((node) => firstHeadingNode && (node.compareDocumentPosition(firstHeadingNode) & Node.DOCUMENT_POSITION_FOLLOWING)
      && node.textContent.trim().split(/\s+/).length <= 8 && (style(node).textTransform === 'uppercase' || /^[^a-z]+$/.test(node.textContent.trim())) && parseFloat(style(node).fontSize) <= 18);
    const icons = [...section.querySelectorAll('svg, i[class*="fa"], i[class*="icon"], img')].filter((node) => { const box = node.getBoundingClientRect(); return shown(node) && box.width > 0 && box.width <= 64 && box.height <= 64; });
    const listItems = [...section.querySelectorAll('li')].filter((node) => shown(node) && !node.closest('nav'));
    const checkItems = [...section.querySelectorAll('li, p')].filter((node) => shown(node) && (/^[\s✓✔☑✅•\-–]/.test(node.textContent) && /^[\s]*[✓✔☑✅]/.test(node.textContent) || node.querySelector('svg, i[class*="check"], img[src*="check"]')));
    const stats = texts.filter((node) => /^[~≈<>+]?\s*[\d][\d.,]*\s*(%|\+|k|K|M|m²|pcs|pieces|days|years)?\+?$/.test(node.textContent.trim()) && parseFloat(style(node).fontSize) >= 22).length
      + texts.filter((node) => /^\d[\d.,]*\s*[+%]?\s+\S+/.test(node.textContent.trim()) && node.textContent.trim().split(/\s+/).length <= 5 && parseFloat(style(node).fontSize) >= 20).length;
    const numbered = texts.filter((node) => /^0?\d{1,2}\.?$/.test(node.textContent.trim())).length;
    const buttons = [...section.querySelectorAll('a, button')].filter((node) => shown(node) && !node.closest('form') && style(node).backgroundColor !== 'rgba(0, 0, 0, 0)' && parseFloat(style(node).paddingLeft) >= 8).length;
    const imageWidths = large.map((box) => Math.round(box.width));
    const bg = section.virtual ? 'rgba(0, 0, 0, 0)' : style(section).backgroundColor;
    const headingSizes = [...section.querySelectorAll('h1, h2, h3, h4')].filter(shown).map((node) => parseFloat(style(node).fontSize));
    // A small first heading followed by a much larger one is an eyebrow label (often marked up as a heading).
    const eyebrowHeading = headingSizes.length >= 2 && headingSizes[0] <= 18 && Math.max(...headingSizes) >= headingSizes[0] + 6;
    return {
      top: Math.round(rect.top + scrollY),
      left: Math.round(rect.left),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      background: bg === 'rgba(0, 0, 0, 0)' || bg === 'rgb(255, 255, 255)' ? null : bg,
      eyebrow: Boolean(eyebrow) || eyebrowHeading,
      headingSize: headingSizes.length ? Math.round(Math.max(...headingSizes)) : 0,
      icons: icons.length,
      listItems: listItems.length,
      checkItems: checkItems.length,
      stats,
      numbered,
      buttons,
      imageWidths,
      tabs: section.querySelectorAll('[role="tab"], [class*="tab-title"], [class*="tabs-nav"] li').length,
      carousel: Boolean(section.querySelector('[class*="swiper"], [class*="slick"], [class*="carousel"], [class*="testimonial"]')),
      marquee: [...section.querySelectorAll('*')].some((node) => style(node).animationName !== 'none' && node.querySelectorAll('img').length >= 4),
      video: Boolean(section.querySelector('video, iframe[src*="youtube"], iframe[src*="vimeo"]')),
      map: Boolean(section.querySelector('iframe[src*="google.com/maps"], iframe[src*="maps.google"], iframe[src*="openstreetmap"], iframe[src*="map.baidu"], iframe[src*="amap.com"]')),
      quotes: texts.filter((node) => /^[“"]/.test(node.textContent.trim())).length,
      words: words(section),
      headings: section.querySelectorAll('h1, h2, h3, h4').length,
      largeImages: large.length,
      smallImages: media.length - large.length,
      imagesPerRow: perRow,
      coversSection: large.some((media) => media.width >= rect.width * 0.9 && media.height >= rect.height * 0.8),
      backgroundOnly,
      coverBackground,
      // The fields a visitor fills in, and whether the form is embedded (its fields out of reach: pageShell.formEmbeds).
      formFields: [...section.querySelectorAll('input, select, textarea')].filter((field) => !['hidden', 'submit', 'button', 'checkbox', 'radio', 'search', 'reset', 'image'].includes(field.type)).length,
      formEmbed: Boolean(pageShell.formEmbeds && section.querySelector(pageShell.formEmbeds)),
      hasForm: Boolean(section.querySelector('form')) || section.querySelectorAll('input, textarea').length >= 2 || Boolean(pageShell.formEmbeds && section.querySelector(pageShell.formEmbeds)),
      hasTable: Boolean(section.querySelector('table')),
      // Tabs (role=tab) and menus also expose aria-expanded; only disclosure-style questions count.
      // Carousel arrows and menu toggles also carry aria-expanded: count only disclosures with a visible label.
      accordionItems: [...section.querySelectorAll('details > summary, [aria-expanded][aria-controls], [class*="accordion"] [class*="title"], [class*="toggle-title"]')]
        .filter((node) => !node.closest('[role="tablist"], [role="tab"], nav, [class*="swiper"], [class*="slick"], [class*="carousel"], [class*="slider"]') && node.textContent.trim().length >= 10)
        // A modal or menu trigger controls content elsewhere; a disclosure controls content inside the section.
        .filter((node) => { const id = node.getAttribute('aria-controls'); if (!id) return true; const target = document.getElementById(id); return Boolean(target) && section.contains(target); })
        // Class-matched titles must sit close to their accordion and not be navigation links (product card titles).
        .filter((node) => {
          if (node.matches('summary, [aria-expanded][aria-controls]')) return true;
          if (node.matches('a[href]')) return false;
          let depth = 0;
          for (let current = node.parentElement; current && depth < 4; current = current.parentElement, depth += 1) if (/accordion|toggle/i.test(String(current.className))) return true;
          return false;
        }).length,
      firstHeading: (section.querySelector('h1, h2, h3')?.innerText || '').trim().slice(0, 80),
      anchor: anchors[index],
    };
  });
}

// Runs in the browser at a phone's width (page.evaluate(measurePhoneSections, anchors)) after extractSectionShapes
// marked and anchored the sections at desktop width (each shape's `anchor`): the same sections' shapes on a phone, by
// index. Each: its height, its words, and its main photo (the largest image or CSS background at least half the screen
// wide): { height, words, photo: { width, height, ratio } | null }. A section hidden on phones measures 0 with no
// photo; a mobile-only photo inside the section counts, since the section is measured, not the desktop photo.
export function measurePhoneSections(anchors) {
  document.documentElement.style.scrollBehavior = 'auto';
  scrollTo(0, 0);
  const visible = (element) => {
    const style = getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
  };
  const top = (node) => node.getBoundingClientRect().top + scrollY;
  // A marked node of the document measured at desktop width, else the node at the same path in a reloaded one.
  const find = (mark, index, path) => document.querySelector(`[${mark}="${index}"]`) ?? (path ? document.querySelector(path) : null);
  // The stretch of the page a section covers now: its own box, or a segment from its start heading to its end heading.
  const span = (index) => {
    const anchor = anchors[index] ?? {};
    const own = find('data-sf-section', index, anchor.section);
    if (own) { const box = own.getBoundingClientRect(); return { root: own, whole: true, top: box.top + scrollY, bottom: box.bottom + scrollY }; }
    const start = find('data-sf-start', index, anchor.start);
    const end = find('data-sf-end', index, anchor.end);
    const root = (start ?? end)?.closest('[data-sf-root]') ?? (anchor.root ? document.querySelector(anchor.root) : null);
    if (!root) return null;
    const box = root.getBoundingClientRect();
    return { root, whole: false, top: start ? top(start) : box.top + scrollY, bottom: end ? top(end) : box.bottom + scrollY };
  };
  return anchors.map((_, index) => {
    const part = span(index);
    if (!part || part.bottom - part.top <= 0) return { height: 0, words: 0, photo: null };
    const inside = (node) => part.whole || (top(node) >= part.top - 1 && top(node) < part.bottom - 1);
    const nodes = [...(part.whole ? [part.root] : []), ...part.root.querySelectorAll('*')].filter((node) => visible(node) && inside(node));
    const words = nodes.filter((node) => node.matches('p, li, h1, h2, h3, h4, td, th, span') && !node.closest('nav, form') && !node.querySelector('p, li, h1, h2, h3, h4'))
      .map((node) => node.innerText).join(' ').split(/\s+/).filter(Boolean).length;
    const photos = nodes.filter((node) => node.tagName === 'IMG' || /url\(/.test(getComputedStyle(node).backgroundImage))
      .map((node) => node.getBoundingClientRect()).filter((box) => box.width >= innerWidth * 0.5 && box.height > 40);
    const largest = photos.sort((a, b) => b.width * b.height - a.width * a.height)[0];
    return {
      height: Math.round(part.bottom - part.top),
      words,
      photo: largest ? { width: Math.round(largest.width), height: Math.round(largest.height), ratio: Math.round((largest.width / largest.height) * 100) / 100 } : null,
    };
  });
}
