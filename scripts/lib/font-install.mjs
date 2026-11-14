// The site's fonts, from what the reference uses to the files the site ships (scripts/install-fonts.mjs, site:run step
// "fonts"): which family each type role uses (docs/research/raw/font-lock.json) and in which weights and styles
// (docs/research/analysis/font-roles.json), commercial families replaced (lib/font-licenses.mjs), the faces downloaded
// from the Google Fonts CSS2 API, and the @font-face rules and role tokens generated from that record.

import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { primaryFamily, resolveFamily } from './font-licenses.mjs';

export const INSTALLED_FONTS_SCHEMA = 'seo-site-installed-fonts-v1';
export const INSTALLED_FONTS = 'docs/research/installed-fonts.json';
export const FONTS_CSS = 'src/styles/fonts.css';
export const FONTS_DIR = 'public/fonts';
export const GOOGLE_CSS2 = 'https://fonts.googleapis.com/css2';
// The scripts the site's pages are written in; the other subsets Google serves are left out.
export const SUBSETS = Object.freeze(['latin', 'latin-ext']);
// The font-lock role of each type token the template's styles read.
export const ROLE_TOKENS = Object.freeze({ body: '--font-body', hero: '--font-hero', display: '--font-display', subheading: '--font-subheading', navigation: '--font-ui' });
// Google Fonts answers a browser's user agent with woff2 files (another gets TrueType).
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const GENERIC = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded']);
const SERIF_SYSTEM = new Set(['georgia', 'times', 'times new roman', 'ui-serif', 'serif']);

const key = (family) => String(family || '').replace(/["']/g, '').trim().toLowerCase().replace(/[-_\s]+/g, ' ');

export function normaliseWeight(value) {
  if (value === 'normal') return 400;
  if (value === 'bold') return 700;
  const weight = Number.parseFloat(value);
  return Number.isFinite(weight) && weight >= 1 && weight <= 1000 ? Math.round(weight) : null;
}
export const normaliseStyle = (value) => (/^(italic|oblique)/.test(String(value || '').trim()) ? 'italic' : 'normal');

// Every observed run of font-roles.json (any nesting of roles, viewports and lists: the analysis writes it): an object
// with a family and a weight. By family (its first name in the stack): the weights, styles and full stacks seen.
export function observedFaces(fontRoles) {
  const seen = new Map();
  const visit = (value) => {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!value || typeof value !== 'object') return;
    if (typeof value.family === 'string' && value.weight !== undefined) {
      const family = primaryFamily(value.family);
      const weight = normaliseWeight(value.weight);
      if (family && weight) {
        const entry = seen.get(key(family)) ?? { observed: family, weights: new Set(), styles: new Set(), stacks: new Set() };
        entry.weights.add(weight);
        entry.styles.add(normaliseStyle(value.style ?? value.fontStyle ?? value['font-style']));
        entry.stacks.add(value.family);
        seen.set(key(family), entry);
      }
    }
    for (const [name, child] of Object.entries(value)) if (name !== 'evidence') visit(child);
  };
  visit(fontRoles?.roles);
  return seen;
}

const quote = (family) => (GENERIC.has(family.toLowerCase()) || family.startsWith('-') || family === 'BlinkMacSystemFont' ? family : `"${family}"`);
// The generic fallback after a family: the substitute's own, else the one the reference's stack names, else by kind.
function generic(resolved, stacks) {
  if (resolved.category) return resolved.category;
  for (const stack of stacks) for (const name of String(stack).split(',').map((part) => part.trim().replace(/^['"]|['"]$/g, '').toLowerCase())) if (GENERIC.has(name)) return name;
  return SERIF_SYSTEM.has(key(resolved.family)) ? 'serif' : 'sans-serif';
}

// Which family each role uses and which families the site installs, in which weights and styles. A role recorded
// with substituteFor (a font lock edited by hand) is taken as the reference's family it stands for. Families the
// reference shows that no role uses are listed (unused), not installed: the template's styles reach fonts through
// the role tokens only.
export function fontPlan({ fontRoles, fontLock }) {
  const seen = observedFaces(fontRoles);
  const roles = {};
  const families = new Map();
  for (const [role, token] of Object.entries(ROLE_TOKENS)) {
    const locked = fontLock?.roles?.[role];
    if (!locked?.family) throw new Error(`docs/research/raw/font-lock.json has no family for the ${role} role (the capture step writes it)`);
    const observed = primaryFamily(locked.substituteFor ?? locked.family);
    const resolved = resolveFamily(observed);
    const faces = seen.get(key(observed));
    const weight = normaliseWeight(locked.weight) ?? 400;
    const stack = GENERIC.has(resolved.family.toLowerCase()) ? resolved.family : `${quote(resolved.family)}, ${generic(resolved, faces?.stacks ?? [])}`;
    roles[role] = { token, observed, family: resolved.family, ...(resolved.substituteFor ? { substituteFor: resolved.substituteFor } : {}), source: resolved.source, weight, stack };
    const family = families.get(resolved.family) ?? { family: resolved.family, source: resolved.source, substituteFor: new Set(), weights: new Set(), styles: new Set(), observed: new Set() };
    if (resolved.substituteFor) family.substituteFor.add(resolved.substituteFor);
    family.observed.add(key(observed));
    family.weights.add(weight);
    for (const value of faces?.weights ?? []) family.weights.add(value);
    family.styles.add('normal');
    for (const value of faces?.styles ?? []) family.styles.add(value);
    families.set(resolved.family, family);
  }
  const used = new Set([...families.values()].flatMap((family) => [...family.observed]));
  const unused = [...seen.entries()].filter(([name]) => !used.has(name)).map(([, entry]) => {
    const resolved = resolveFamily(entry.observed);
    return { observed: entry.observed, family: resolved.family, ...(resolved.substituteFor ? { substituteFor: resolved.substituteFor } : {}), weights: [...entry.weights].sort((a, b) => a - b) };
  });
  const sorted = (set) => [...set].sort((a, b) => (typeof a === 'number' ? a - b : String(a).localeCompare(String(b))));
  return {
    roles,
    families: [...families.values()].sort((a, b) => a.family.localeCompare(b.family)).map((family) => ({ family: family.family, source: family.source, ...(family.substituteFor.size ? { substituteFor: sorted(family.substituteFor) } : {}), weights: sorted(family.weights), styles: sorted(family.styles) })),
    unused,
  };
}

// The CSS2 API request for one family's weights and styles (one family a request: an error names it). The API takes
// the axis tuples in ascending order only (upright before italic, light before bold).
export function googleCssUrl({ family, weights, styles }) {
  const name = family.trim().replace(/\s+/g, '+');
  const sorted = [...weights].sort((a, b) => a - b);
  const axes = styles.includes('italic')
    ? `ital,wght@${[0, 1].filter((ital) => styles.includes(ital ? 'italic' : 'normal')).flatMap((ital) => sorted.map((weight) => `${ital},${weight}`)).join(';')}`
    : `wght@${sorted.join(';')}`;
  return `${GOOGLE_CSS2}?family=${name}:${axes}&display=swap`;
}

// The @font-face rules of a CSS2 answer, each with the subset its comment names.
export function parseFaces(css) {
  const faces = [];
  for (const match of css.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*@font-face\s*\{([^}]*)\}/g)) {
    const body = match[2];
    const field = (name) => body.match(new RegExp(`${name}\\s*:\\s*([^;]+);`))?.[1]?.trim() ?? null;
    const url = body.match(/url\(\s*['"]?([^'")]+)['"]?\s*\)/)?.[1] ?? null;
    faces.push({ subset: match[1], family: primaryFamily(field('font-family')), style: normaliseStyle(field('font-style')), weight: normaliseWeight(field('font-weight')), unicodeRange: field('unicode-range'), url });
  }
  return faces;
}

const sha = (value) => createHash('sha256').update(value).digest('hex');

// A download kept in the cache folder by its URL (the CSS2 answer pins its files' versions, and the files' URLs are
// versioned): the same request is never made twice. A network error or an error status throws; nothing is cached then.
export async function fetchCached({ url, cacheDir, kind, fetch }) {
  const path = join(cacheDir, kind, `${sha(url).slice(0, 24)}${kind === 'css' ? '.css' : '.woff2'}`);
  const hit = await readFile(path).catch(() => null);
  if (hit) return { body: hit, cached: true };
  let response;
  try {
    response = await fetch(url, { headers: { 'user-agent': USER_AGENT } });
  } catch (error) {
    throw new Error(`could not reach ${url}: ${error.cause?.message ?? error.message}`);
  }
  if (!response.ok) throw Object.assign(new Error(`${url} answered HTTP ${response.status}`), { status: response.status });
  const body = Buffer.from(await response.arrayBuffer());
  await mkdir(join(cacheDir, kind), { recursive: true });
  await writeFile(path, body);
  return { body, cached: false };
}

const WOFF2 = Buffer.from('wOF2');

// The faces of every Google Fonts family of the plan in its weights and styles, the site's subsets only, each with its
// file's bytes. Fails, saying what to do, when a family or one of its weights is not on Google Fonts or the network is
// down: the site never falls back to a system font without saying so.
export async function downloadFaces({ plan, cacheDir, fetch = globalThis.fetch, subsets = SUBSETS }) {
  const faces = [];
  const requests = {};
  let downloads = 0;
  for (const family of plan.families.filter((item) => item.source === 'google-fonts')) {
    const url = googleCssUrl(family);
    requests[family.family] = url;
    let css;
    try {
      const answer = await fetchCached({ url, cacheDir, kind: 'css', fetch });
      css = answer.body.toString('utf8');
      if (!answer.cached) downloads += 1;
    } catch (error) {
      const from = family.substituteFor ? ` (it stands in for ${family.substituteFor.join(', ')})` : '';
      if (error.status === 400) throw new Error(`fonts: Google Fonts has no "${family.family}"${from} in weights ${family.weights.join(', ')} and styles ${family.styles.join(', ')} (HTTP 400). A commercial family needs its open substitute in SUBSTITUTES (scripts/lib/font-licenses.mjs); a weight the family does not have is a wrong observation in docs/research/analysis/font-roles.json.`);
      throw new Error(`fonts: the faces of "${family.family}" could not be downloaded: ${error.message}. Nothing was installed and no system font is used instead; run the step again when Google Fonts can be reached.`);
    }
    const found = parseFaces(css).filter((face) => subsets.includes(face.subset));
    for (const style of family.styles) for (const weight of family.weights) {
      if (!found.some((face) => face.style === style && face.weight === weight && face.subset === subsets[0])) throw new Error(`fonts: Google Fonts answered no ${subsets[0]} face of "${family.family}" ${weight} ${style} (${url})`);
    }
    for (const face of found) {
      if (!face.url) throw new Error(`fonts: a face of "${family.family}" has no file (${url})`);
      let file;
      try {
        file = await fetchCached({ url: face.url, cacheDir, kind: 'files', fetch });
      } catch (error) {
        throw new Error(`fonts: the file of "${family.family}" ${face.weight} ${face.style} (${face.subset}) could not be downloaded: ${error.message}. Nothing was installed; run the step again when Google Fonts can be reached.`);
      }
      if (!file.body.subarray(0, 4).equals(WOFF2)) throw new Error(`fonts: ${face.url} is not a woff2 file`);
      if (!file.cached) downloads += 1;
      faces.push({ ...face, family: family.family, bytes: file.body });
    }
  }
  return { faces, requests, downloads };
}

export const fontSlug = (family) => family.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// The record the site keeps of its fonts: each role's family and stack, each family's weights, styles and source, and
// every face with its file (public path), source URL and checksum. Faces in a fixed order (the same fonts give the same
// record and stylesheet).
export function installedFonts({ plan, faces, requests }) {
  const order = (face) => [face.family, face.style, String(face.weight).padStart(4, '0'), String(SUBSETS.indexOf(face.subset)).padStart(2, '0')].join('|');
  const records = faces.map((face) => {
    const checksum = sha(face.bytes);
    return { family: face.family, style: face.style, weight: face.weight, subset: face.subset, unicodeRange: face.unicodeRange, file: `/fonts/${fontSlug(face.family)}-${face.subset}-${checksum.slice(0, 10)}.woff2`, url: face.url, sha256: checksum, bytes: face.bytes.length };
  }).sort((a, b) => order(a).localeCompare(order(b)));
  return {
    schemaVersion: INSTALLED_FONTS_SCHEMA,
    source: 'Google Fonts CSS2 API (fonts.googleapis.com/css2), files from fonts.gstatic.com',
    subsets: [...SUBSETS],
    roles: plan.roles,
    families: plan.families.map((family) => ({ ...family, ...(requests[family.family] ? { request: requests[family.family] } : {}) })),
    faces: records,
    unused: plan.unused,
  };
}

// src/styles/fonts.css from the record: the site's only @font-face rules, and the role tokens. The tokens' selector
// outranks every other :root definition (global.css defaults, the treatment's :root:root): the families are this
// step's, never a hand's or an agent's.
export function fontsCss(lock) {
  const lines = ['/* Generated by scripts/install-fonts.mjs (site:run step "fonts") from docs/research/installed-fonts.json: do not', '   edit. The site\'s only @font-face rules, and the type role tokens, which win over any other definition. */'];
  for (const face of lock?.faces ?? []) {
    lines.push(`@font-face { font-family: "${face.family}"; font-style: ${face.style}; font-weight: ${face.weight}; font-display: swap; src: url("${face.file}") format("woff2");${face.unicodeRange ? ` unicode-range: ${face.unicodeRange};` : ''} }`);
  }
  const roles = Object.values(lock?.roles ?? {});
  if (roles.length) lines.push(':root:root:root {', ...roles.map((role) => `  ${role.token}: ${role.stack};`), '}');
  return `${lines.join('\n')}\n`;
}

// A stylesheet without @font-face rules (the treatment's stylesheet: faces are the fonts step's).
export const stripFontFaces = (css) => css.replace(/^[ \t]*@font-face\s*\{[^}]*\}[ \t]*\r?\n?/gm, '').replace(/@font-face\s*\{[^}]*\}/g, '');
export const hasFontFaces = (css) => /@font-face\s*\{/.test(css.replace(/\/\*[\s\S]*?\*\//g, ''));

// global.css importing fonts.css after the treatment (an older site's global.css does not yet).
export const FONTS_IMPORT = '@import "./fonts.css";';
export function withFontsImport(css) {
  if (css.includes(FONTS_IMPORT)) return css;
  const eol = css.includes('\r\n') ? '\r\n' : '\n';
  const reference = css.match(/^@import\s+["']\.\/reference\.css["'];[^\n]*\n/m);
  const imports = [...css.matchAll(/^@import[^\n]*\n/gm)];
  const after = reference ?? imports.at(-1);
  if (!after) return `${FONTS_IMPORT}${eol}${css}`;
  const at = after.index + after[0].length;
  return `${css.slice(0, at)}${FONTS_IMPORT}${eol}${css.slice(at)}`;
}

// The reference's font lock (docs/research/raw/font-lock.json, the home page's capture), a role the home page does not
// show taken from the competitor's other pages (their own captures' font locks, by page type): Concord's home opens on
// a video with no title, and its hero role was added to the font lock by hand, lost again with the next capture (motel
// 2026-11-14). The home page's roles stay first.
export function withPageRoles(fontLock, pageLocks = []) {
  const roles = { ...fontLock.roles };
  for (const [role, value] of Object.entries(roles)) {
    if (value?.family) continue;
    const found = pageLocks.map((lock) => lock?.roles?.[role]).find((item) => item?.family);
    if (found) roles[role] = { ...found, note: 'from the reference pages (the home page shows none)' };
  }
  return { ...fontLock, roles };
}
const readLock = async (path) => { try { return JSON.parse(await readFile(path, 'utf8')); } catch { return null; } };
/** @param {string} root @returns {Promise<any>} the font lock with its roles filled from the page types', or null */
export async function referenceFontLock(root) {
  const lock = await readLock(join(root, 'docs/research/raw/font-lock.json'));
  if (!lock) return null;
  const dir = join(root, 'docs/research/reference-pages');
  const types = (await readdir(dir).catch(() => [])).sort();
  return withPageRoles(lock, await Promise.all(types.map((type) => readLock(join(dir, type, 'raw/font-lock.json')))));
}
