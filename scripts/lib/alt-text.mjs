// Alt text rules (claude-seo v2.4.1 skills/seo-images, passed on by Site Factory 2026-09-30; the owner: images and their
// alt belong to stage 08 onwards). Whoever makes or picks an image writes its alt when the image enters the site (the
// generated library, the site's own photos, the reference placeholders); pages use that alt. The rules:
//   - what the image actually shows, 10-125 characters; a decorative image has alt="";
//   - no "image of" / "picture of" / "photo of";
//   - no company claims: prices, minimum orders, lead times, guarantees, certificates;
//   - every image on a page has its own alt, and the page's main keyword is in at most one of them.

import { ALT_MAX_CHARS, ALT_MIN_CHARS } from './rules.mjs';

const IMAGE_OF = /\b(image|picture|photo|photograph)\s+of\b/i;
const CLAIM = /[$€£¥]|\b(moq|minimum order|lead time|guarantee[sd]?|certified|best|leading|no\.\s*1|cheapest)\b|\b\d[\d,.]*\s*(pcs|pieces|units|days|weeks|%)/i;

// What is wrong with one alt text: [] when it keeps the rules.
export function altProblems(alt, { decorative = false } = {}) {
  const text = (alt ?? '').trim();
  if (decorative) return text ? ['decorative_with_alt'] : [];
  if (!text) return ['missing'];
  const problems = [];
  if (text.length < ALT_MIN_CHARS) problems.push('too_short');
  if (text.length > ALT_MAX_CHARS) problems.push('too_long');
  if (IMAGE_OF.test(text)) problems.push('image_of');
  if (CLAIM.test(text)) problems.push('claim');
  return problems;
}

// The page's images together: each image's problems, the same alt twice, the main keyword in more than one alt.
// images: [{ src, alt, decorative }]; returns [{ src, alt, problem }].
export function pageAltProblems(images, { keyword = null } = {}) {
  const found = [];
  const seen = new Map();
  const needle = keyword?.trim().toLowerCase() || null;
  let withKeyword = 0;
  for (const image of images) {
    for (const problem of altProblems(image.alt, { decorative: image.decorative })) found.push({ src: image.src, alt: image.alt, problem });
    const text = (image.alt ?? '').trim();
    if (image.decorative || !text) continue;
    if (seen.has(text.toLowerCase())) found.push({ src: image.src, alt: text, problem: 'duplicate' });
    seen.set(text.toLowerCase(), image.src);
    if (needle && text.toLowerCase().includes(needle) && ++withKeyword > 1) found.push({ src: image.src, alt: text, problem: 'keyword_repeated' });
  }
  return found;
}

// A description written while analysing a reference photo, made into alt text: working notes are dropped (bracketed
// asides such as "(portrait; mobile banner)", clauses about crops, gradients and page placement), then a leading
// "image of" and a lowercase start are fixed. It never adds words.
const NOTE = /\b(crop(ped)?|banner|hero|mobile|desktop|gradient|darken(ed)?|overlay|baked|layout|copy space|text space|left third|right third|portrait|landscape)\b/i;
export function altFromDescription(text) {
  let alt = (text ?? '').replace(/\s*\([^)]*\)/g, '');
  alt = alt.split(';').map((clause) => clause.trim()).filter((clause, index) => index === 0 || !NOTE.test(clause)).join('; ');
  alt = alt.replace(/^(an?\s+)?(image|picture|photo|photograph)\s+of\s+/i, '').replace(/\s+/g, ' ').trim();
  return alt ? alt.charAt(0).toUpperCase() + alt.slice(1) : '';
}
