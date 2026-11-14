// The layout audit's checks of what the photos are (audit-authoring-layout.mjs): they verify what the planning decided
// (lib/media-slots.mjs, lib/slot-visuals.mjs) and fix nothing.

import subjects from '../../config/photo-subjects.json' with { type: 'json' };

// signature_missing: a page showing fewer full-width photo bands than its page type's floor (the competitor's own
// bands, media-slots signatureFloor). results: the desktop measures ({ route, fullWidthPhotos }); floorOf(route).
export function signatureMissing(results, floorOf) {
  return results.filter((result) => result.viewport === 'desktop' && Number.isFinite(result.fullWidthPhotos)).flatMap((result) => {
    const floor = floorOf(result.route);
    return floor > 0 && result.fullWidthPhotos < floor ? [{ route: result.route, viewport: result.viewport, issue: 'signature_missing', expected: floor, actual: result.fullWidthPhotos }] : [];
  });
}

const mentions = (words, text) => {
  const found = new Set((String(text).toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []));
  return words.some((word) => found.has(word) || found.has(`${word}s`) || found.has(`${word}es`));
};

// image_subject_repeat: one subject in too many of the site's photos (config/photo-subjects.json). photos: every photo
// the built pages show ({ src, alt }); each counts once.
export function subjectRepeat(photos, config = subjects) {
  const unique = [...new Map(photos.filter((photo) => photo?.src).reverse().map((photo) => [photo.src, photo])).values()];
  if (unique.length < (config.minPhotos ?? 0)) return [];
  return Object.entries(config.groups).flatMap(([group, words]) => {
    const named = unique.filter((photo) => mentions(words, photo.alt ?? ''));
    const share = named.length / unique.length;
    return share > config.maxShare ? [{ issue: 'image_subject_repeat', group, share: Math.round(share * 100) / 100, maximum: config.maxShare, count: named.length, total: unique.length, photos: named.slice(0, 20).map((photo) => photo.src) }] : [];
  });
}
