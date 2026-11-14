// The subject of every photo the site shows, judged once per photo by a vision judge (the photo-focus step,
// config/agent-steps/photo-focus.md): a point as fractions of the photo's width and height. A frame that cuts a photo
// centres on it (the renderer's object-position, from src/data/photo-focus.json) and a phone hero crop is cut around
// it (derive-phone-heroes.mjs); a centred cut loses a subject that sits to one side (a model reclining by the sea).

import { createHash } from 'node:crypto';
import { basename, extname } from 'node:path';

// Where a photo's judged subject is kept: one file per photo, named after it.
export const focusPath = (src) => `docs/research/photo-focus/${basename(src, extname(src)).replace(/[^\w-]/g, '_')}-${createHash('sha1').update(src).digest('hex').slice(0, 8)}.json`;

// Photos judged in one run (one Codex call): fewer calls for a library of thirty or forty photos.
export const FOCUS_BATCH = 8;

// Every photo the site may show, once each: the template's heroes and pools (site-wide and per route) and the owner's
// own photos; content placeholders (slot) and photos without a known size are left out.
export function photosInUse(components, sitePhotos = []) {
  const media = components.media ?? {};
  const pools = [media.pools ?? {}, ...Object.values(media.routePools ?? {})].flatMap((byKind) => Object.values(byKind).flat());
  const all = [media.hero, ...Object.values(media.heroByPageType ?? {}), ...Object.values(media.heroByRoute ?? {}), ...(media.heroOptions ?? []), ...pools, ...sitePhotos];
  const bySrc = new Map(all.filter((photo) => photo?.src && !photo.slot && photo.width > 0 && photo.height > 0).map((photo) => [photo.src, photo]));
  return [...bySrc.values()];
}
