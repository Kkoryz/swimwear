// The site's own font files a first screen needs, preloaded (RateHarbor claude-seo audit 2026-11-17, M-3/M-21: desktop
// CLS 0.24 on /blog/; a post's phone title went down a line 94 ms in, the web font swapped in after the fallback was
// painted). The files are found in src/styles/fonts.css (scripts/install-fonts.mjs writes it): the basic Latin subset of
// each family (its unicode-range starts at U+0000), at most MAX_PRELOADS files; every weight of a family is one variable
// file there, so one file a family.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const MAX_PRELOADS = 2;
export function fontPreloads(css: string | null = null): string[] {
  const text = css ?? (existsSync(resolve('src/styles/fonts.css')) ? readFileSync(resolve('src/styles/fonts.css'), 'utf8') : '');
  const files: string[] = [];
  for (const face of text.match(/@font-face\s*\{[^}]*\}/g) ?? []) {
    const file = face.match(/url\("?(\/fonts\/[^")]+\.woff2)"?\)/)?.[1];
    if (file && /unicode-range:\s*U\+0000-/i.test(face) && !files.includes(file)) files.push(file);
  }
  return files.slice(0, MAX_PRELOADS);
}
