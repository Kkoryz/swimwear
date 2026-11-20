// A page title's limits, one statement for the SEO audit (lib/seo-audit.mjs) and the blog gates (lib/blog-gates.mjs).
// TITLE_MAX: Site Factory's rule for every page title (its kw_head and its delivery check, contracts.head_limits): at
// most 60 characters with spaces and the " | Brand", counted as a reader sees them (owner 2026-11-19: 14 MotelPilot and
// 7 Tapa Works titles of 61-73 characters went live; the audit counted the raw HTML, &amp; as five, and warned at 65).
// TITLE_PX_MAX: where a desktop result cuts a title, Arial at 20px near 600px: a title of wide letters under 60
// characters may still be cut. titlePx estimates it from Arial's advance widths (per 1000 em; a letter the table lacks
// counts as an "n"); a warning, never a failure.

export const TITLE_MAX = 60;
export const TITLE_PX_MAX = 600;
const FONT_PX = 20;
const ARIAL = {
  ' ': 278, '!': 278, '"': 355, '#': 556, '$': 556, '%': 889, '&': 667, "'": 191, '(': 333, ')': 333, '*': 389, '+': 584,
  ',': 278, '-': 333, '.': 278, '/': 278, ':': 278, ';': 278, '<': 584, '=': 584, '>': 584, '?': 556, '@': 1015, '[': 278,
  '\\': 278, ']': 278, '^': 469, '_': 556, '`': 333, '|': 260, '\u2018': 222, '\u2019': 222, '\u201c': 333, '\u201d': 333,
  '\u2013': 556, '\u2014': 1000, '\u2026': 1000,
  ...Object.fromEntries([...'0123456789'].map((digit) => [digit, 556])),
  ...Object.fromEntries([...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map((letter, index) => [letter, [667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611][index]])),
  ...Object.fromEntries([...'abcdefghijklmnopqrstuvwxyz'].map((letter, index) => [letter, [556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500][index]])),
};

// A title's characters as Site Factory counts them (Python's len: code points, not UTF-16 units), of the title as a
// reader sees it: page data holds it as text; a built page's is decoded first (lib/built-site.mjs decode).
export const titleChars = (title) => [...String(title ?? '')].length;

// A decoded title's estimated width in a desktop result, in px.
export const titlePx = (title) => Math.round([...String(title ?? '')].reduce((sum, char) => sum + (ARIAL[char] ?? 556), 0) * FONT_PX / 1000);
