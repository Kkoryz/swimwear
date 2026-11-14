// Font licensing for templates: a template may ship open-licensed fonts (SIL OFL / Apache 2.0) or rely on
// system fonts. A commercial or unknown-licence face from the reference is replaced by a similar open font from the
// substitution table below; the fonts step (scripts/install-fonts.mjs) installs it and records it in
// docs/research/installed-fonts.json as { family: <open font>, substituteFor: <reference font> }.

export const OPEN_FONTS = Object.freeze([
  'Barlow', 'Cabin', 'DM Sans', 'Fira Sans', 'IBM Plex Sans', 'IBM Plex Serif', 'Inter', 'Josefin Sans', 'Jost', 'Karla', 'Lato',
  'Libre Franklin', 'Lora', 'Manrope', 'Merriweather', 'Montserrat', 'Mulish', 'Noto Sans', 'Noto Serif', 'Nunito',
  'Nunito Sans', 'Open Sans', 'Oswald', 'Outfit', 'Playfair Display', 'Plus Jakarta Sans', 'Poppins', 'PT Sans',
  'PT Serif', 'Raleway', 'Roboto', 'Roboto Condensed', 'Roboto Slab', 'Rubik', 'Source Sans 3', 'Source Sans Pro',
  'Source Serif 4', 'Space Grotesk', 'Work Sans',
]);

export const SYSTEM_FONTS = Object.freeze([
  '-apple-system', 'Arial', 'BlinkMacSystemFont', 'Georgia', 'Helvetica', 'Helvetica Neue', 'sans-serif', 'Segoe UI',
  'serif', 'system-ui', 'Times', 'Times New Roman', 'ui-sans-serif', 'ui-serif',
]);

// Commercial faces the references use and the open font that stands in for each, with its generic fallback. A name
// matches its key and the key's longer cuts ("freight text" matches "freight-text-pro" and "Freight Text Pro Book").
// Every substitute is a Google Fonts family (the fonts step downloads it from there).
export const SUBSTITUTES = Object.freeze({
  'freight text': { family: 'Source Serif 4', category: 'serif' },
  'freight display': { family: 'Playfair Display', category: 'serif' },
  'freight sans': { family: 'Source Sans 3', category: 'sans-serif' },
  'futura': { family: 'Jost', category: 'sans-serif' },
  'maison neue': { family: 'DM Sans', category: 'sans-serif' },
  'proxima nova': { family: 'Montserrat', category: 'sans-serif' },
  'gotham': { family: 'Montserrat', category: 'sans-serif' },
  'avenir': { family: 'Nunito Sans', category: 'sans-serif' },
  'graphik': { family: 'Inter', category: 'sans-serif' },
  'circular': { family: 'DM Sans', category: 'sans-serif' },
  'neue haas': { family: 'Inter', category: 'sans-serif' },
});

const normalise = (family) => String(family || '').replace(/["']/g, '').trim().toLowerCase();
const OPEN = new Set(OPEN_FONTS.map(normalise));
const SYSTEM = new Set(SYSTEM_FONTS.map(normalise));

export function fontLicence(family) {
  const name = normalise(family);
  if (OPEN.has(name)) return 'open';
  if (SYSTEM.has(name)) return 'system';
  return 'unknown';
}

// The first family of a CSS font-family stack, unquoted.
export const primaryFamily = (stack) => String(stack || '').split(',')[0].trim().replace(/^['"]|['"]$/g, '');

// A family name as the table keys it: lower case, hyphens and underscores as spaces.
const tableName = (family) => normalise(family).replace(/[-_\s]+/g, ' ').trim();
const KEYS = Object.keys(SUBSTITUTES).sort((left, right) => right.length - left.length);

// The open substitute for a commercial family, or null.
export function substituteFor(family) {
  const name = tableName(family);
  const key = KEYS.find((candidate) => name === candidate || name.startsWith(`${candidate} `));
  return key ? SUBSTITUTES[key] : null;
}

// What the site uses for a family the reference shows: a system font as it is (no file), a commercial one through
// the table, any other by its own name from Google Fonts (one Google Fonts does not have fails the download, with a
// pointer to this table).
export function resolveFamily(observed) {
  const family = primaryFamily(observed);
  if (fontLicence(family) === 'system') return { family, source: 'system' };
  const substitute = substituteFor(family);
  if (substitute) return { family: substitute.family, substituteFor: family, category: substitute.category, source: 'google-fonts' };
  return { family, source: 'google-fonts' };
}

// Roles whose family is neither open nor a system font; the template must substitute them. A family the fonts step
// installed from Google Fonts is open (every Google Fonts family is OFL, Apache or UFL).
export function unlicensedRoles(fontLock) {
  return Object.entries(fontLock?.roles || {})
    .filter(([, role]) => role?.family && role.source !== 'google-fonts' && fontLicence(role.family) === 'unknown')
    .map(([name, role]) => ({ role: name, family: role.family }));
}
