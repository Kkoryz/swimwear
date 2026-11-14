// Text contrast against what is actually painted behind it (colour, gradient or photo): the page is screenshotted with
// all text made transparent and the pixels under each text run are sampled. WCAG 2.2 AA: 4.5:1, or 3:1 for large text
// (24px, or 18.66px bold).

const luminance = ([r, g, b]) => {
  const channel = (value) => { const c = value / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};
export const contrastRatio = (a, b) => {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
};
const hex = (rgb) => `#${rgb.map((value) => Math.round(value).toString(16).padStart(2, '0')).join('')}`;

// Visible text runs with their colour, effective opacity and page position.
function textRuns() {
  const parse = (value) => { const match = value.match(/rgba?\(([^)]+)\)/); if (!match) return null; const parts = match[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [parts[0], parts[1], parts[2], parts[3] ?? 1]; };
  const path = (element) => { const parts = []; for (let node = element, depth = 0; node && node !== document.body && depth < 4; node = node.parentElement, depth += 1) parts.unshift(node.tagName.toLowerCase() + (node.classList.length ? `.${[...node.classList].slice(0, 2).join('.')}` : '')); return parts.join(' > '); };
  const runs = [];
  const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const element = node.parentElement;
    if (!node.textContent.trim() || !element || seen.has(element) || ['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE'].includes(element.tagName)) continue;
    if (!element.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    // Only the part that shows: a clamped excerpt's hidden lines (line-clamp, overflow hidden) ran over the dark section
    // below the hotel blog's cards and failed the excerpt at 1.13:1 while its shown text was 17:1.
    const full = range.getBoundingClientRect();
    let [left, top, right, bottom] = [full.left, full.top, full.right, full.bottom];
    for (let ancestor = element; ancestor && ancestor !== document.body; ancestor = ancestor.parentElement) {
      const clip = getComputedStyle(ancestor);
      if (clip.overflowX === 'visible' && clip.overflowY === 'visible') continue;
      const box = ancestor.getBoundingClientRect();
      if (clip.overflowX !== 'visible') { left = Math.max(left, box.left); right = Math.min(right, box.right); }
      if (clip.overflowY !== 'visible') { top = Math.max(top, box.top); bottom = Math.min(bottom, box.bottom); }
    }
    const rect = { left, top, width: right - left, height: bottom - top };
    if (rect.width < 4 || rect.height < 4) continue;
    seen.add(element);
    let opacity = 1;
    for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) opacity *= Number(getComputedStyle(ancestor).opacity);
    const style = getComputedStyle(element);
    // SVG text is painted with fill, not color.
    const color = parse(element instanceof SVGElement ? style.fill : style.color);
    if (!color || opacity < 0.05) continue;
    runs.push({ text: node.textContent.trim().slice(0, 60), selector: path(element), color, opacity, size: Number.parseFloat(style.fontSize), weight: Number(style.fontWeight) || 400,
      x: rect.left + scrollX, y: rect.top + scrollY, width: rect.width, height: rect.height });
  }
  return runs;
}

// Every text run below AA on the open page. The page is left with transparent text: measure last.
export async function measureContrast(page) {
  const { default: sharp } = await import('sharp');
  const runs = await page.evaluate(textRuns);
  await page.addStyleTag({ content: '*,*::before,*::after,*::placeholder,*::marker{color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important;text-decoration-color:transparent!important}text,tspan{fill:transparent!important;stroke:transparent!important}' });
  const shot = await page.screenshot({ fullPage: true, type: 'png', animations: 'disabled' });
  const { data, info } = await sharp(shot, { limitInputPixels: false }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const low = [];
  for (const run of runs) {
    const x0 = Math.max(0, Math.floor(run.x)); const y0 = Math.max(0, Math.floor(run.y));
    const x1 = Math.min(info.width, Math.ceil(run.x + run.width)); const y1 = Math.min(info.height, Math.ceil(run.y + run.height));
    if (x1 <= x0 || y1 <= y0) continue;
    const step = Math.max(1, Math.floor(Math.sqrt(((x1 - x0) * (y1 - y0)) / 400)));
    const alpha = run.color[3] * run.opacity;
    const samples = [];
    for (let y = y0; y < y1; y += step) for (let x = x0; x < x1; x += step) {
      const index = (y * info.width + x) * 3;
      const background = [data[index], data[index + 1], data[index + 2]];
      const foreground = [0, 1, 2].map((k) => run.color[k] * alpha + background[k] * (1 - alpha));
      samples.push({ ratio: contrastRatio(foreground, background), background });
    }
    samples.sort((a, b) => a.ratio - b.ratio);
    const median = samples[Math.floor(samples.length / 2)];
    const p10 = samples[Math.floor(samples.length * 0.1)].ratio;
    const large = run.size >= 24 || (run.size >= 18.66 && run.weight >= 700);
    const minimum = large ? 3 : 4.5;
    // The worst tenth may dip a little (anti-aliasing, a bright patch in a photo), not the typical pixel.
    if (median.ratio < minimum || p10 < minimum * 0.8) {
      low.push({ text: run.text, selector: run.selector, color: hex(run.color.slice(0, 3)), alpha: Math.round(alpha * 100) / 100, background: hex(median.background), size: run.size, large, ratio: Math.round(median.ratio * 100) / 100, worst: Math.round(p10 * 100) / 100, minimum });
    }
  }
  return low;
}
