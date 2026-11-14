// Site identity: the site name, canonical origin, logo, favicons and share image every page and schema uses.
// Stage 00 owns the brand (projects/<line>/brand/, template-independent); scripts/import-brand-kit.mjs brings it in.
// scripts/build-brand-kit.mjs is only a fallback that typesets a monogram and wordmark from the template's tokens.
// Both write the same files at the site root, so Organization JSON-LD (logo = <origin>/icon-512.png) never disagrees.

export const SITE_IDENTITY_SCHEMA = 'seo-site-identity-v1';

// Canonical origin: https, lower-case host without "www." (www redirects to it at the web server).
export function canonicalOrigin(domain) {
  const host = String(domain).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) throw new Error(`not a domain: ${domain}`);
  return `https://${host}`;
}

// Monogram letters: the first letter of each word (two at most), or the first two letters of a single word.
export function monogram(name) {
  const words = String(name).trim().split(/\s+/).filter(Boolean);
  if (!words.length) throw new Error('site name is empty');
  const letters = words.length > 1 ? words.slice(0, 2).map((word) => word[0]) : [...words[0].slice(0, 2)];
  return letters.join('').toUpperCase();
}

// The identity record from the brand files at the site root (files: name -> { width, height }).
export function identityFromFiles({ siteName, origin, source, files }) {
  const image = (name) => (files[name] ? { src: `/${name}`, ...files[name] } : null);
  const logo = image('logo.svg') ?? image('logo.png');
  const icons = [
    files['favicon.ico'] && { rel: 'icon', src: '/favicon.ico', sizes: '16x16 32x32 48x48', type: 'image/x-icon' },
    files['favicon.svg'] && { rel: 'icon', src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' },
    !files['favicon.ico'] && files['favicon-48.png'] && { rel: 'icon', src: '/favicon-48.png', sizes: '48x48', type: 'image/png' },
    files['apple-touch-icon.png'] && { rel: 'apple-touch-icon', src: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
  ].filter(Boolean);
  return {
    schemaVersion: SITE_IDENTITY_SCHEMA,
    source,
    siteName,
    origin,
    logo,
    schemaLogo: image('icon-512.png'),
    icons,
    manifest: files['site.webmanifest'] ? '/site.webmanifest' : null,
    ogImage: image('og-image.png'),
  };
}

// Problems with a site identity record. Google needs the Organization logo at least 112x112 and a favicon of 48px
// or more (an .ico listing several sizes counts by its largest).
export function identityErrors(identity) {
  const errors = [];
  if (identity?.schemaVersion !== SITE_IDENTITY_SCHEMA) errors.push('site-identity.json schemaVersion is invalid');
  if (!identity?.siteName?.trim()) errors.push('site-identity.json needs siteName');
  try { if (canonicalOrigin(identity?.origin) !== identity?.origin) errors.push(`site-identity.json origin must be ${canonicalOrigin(identity.origin)}`); }
  catch { errors.push('site-identity.json origin is not a domain'); }
  if (!identity?.logo?.src) errors.push('site-identity.json needs logo.src');
  const schemaLogo = identity?.schemaLogo;
  if (!schemaLogo?.src || !(schemaLogo.width >= 112 && schemaLogo.height >= 112)) errors.push('site-identity.json schemaLogo needs src and a size of at least 112x112');
  const largest = (sizes = '') => Math.max(0, ...sizes.split(/\s+/).map((size) => { const [width, height] = size.split('x').map(Number); return width === height ? width : 0; }));
  if (!identity?.icons?.some((icon) => icon.rel === 'icon' && largest(icon.sizes) >= 48)) errors.push('site-identity.json needs a favicon of 48x48 or larger');
  return errors;
}

// First family of a CSS custom property in the given CSS (the last declaration wins, as in the cascade).
export function tokenValue(css, name) {
  const matches = [...css.matchAll(new RegExp(`${name.replace(/[-]/g, '\\-')}\\s*:\\s*([^;]+);`, 'g'))];
  return matches.length ? matches.at(-1)[1].trim() : null;
}

export function resolveToken(css, name, depth = 0) {
  const value = tokenValue(css, name);
  const reference = value?.match(/^var\((--[\w-]+)\)$/);
  return reference && depth < 5 ? resolveToken(css, reference[1], depth + 1) : value;
}

// The @font-face source file for a family, if the template ships it (url is a public path such as /fonts/x.woff2).
export function fontFaceUrl(css, family) {
  const clean = family.replace(/["']/g, '').trim().toLowerCase();
  for (const block of css.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
    const declared = block[1].match(/font-family:\s*["']?([^;"']+)["']?/)?.[1]?.trim().toLowerCase();
    const url = block[1].match(/url\(["']?([^"')]+)["']?\)/)?.[1];
    if (declared === clean && url) return url;
  }
  return null;
}
