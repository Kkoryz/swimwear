// The frame ratio a block's photos are shown in. A block names its usual ratio (cards 4 / 3, split rows 1 / 1); when
// the photos it shows have another orientation (the competitor's portrait model photos in a landscape card), that ratio
// would show a fraction of each (a torso, a chest), so the block takes its photos' own ratio, held between 3 / 4 and
// 3 / 2. One ratio for the whole block, from the median photo, so a row of cards stays equal.

export const RATIO_RANGE = Object.freeze([3 / 4, 3 / 2]);
// The least share of a photo a frame may show before the block follows its photos.
export const MIN_SHOWN = 0.6;

const parse = (ratio) => { const [w, h = 1] = String(ratio).split('/').map((part) => Number(part.trim())); return w > 0 && h > 0 ? w / h : null; };
const shown = (frame, photo) => Math.min(frame, photo) / Math.max(frame, photo);

/** @param {string} ratio @param {{ width?: number, height?: number, slot?: string }[]} photos @returns {string} */
export function fitRatio(ratio, photos = []) {
  const frame = parse(ratio);
  const aspects = photos.filter((photo) => photo && !photo.slot && photo.width > 0 && photo.height > 0).map((photo) => photo.width / photo.height).sort((a, b) => a - b);
  if (!frame || !aspects.length) return ratio;
  const median = aspects[Math.floor(aspects.length / 2)];
  if (shown(frame, median) >= MIN_SHOWN) return ratio;
  const fitted = Math.min(RATIO_RANGE[1], Math.max(RATIO_RANGE[0], median));
  return `${Math.round(fitted * 1000) / 1000} / 1`;
}

// Whether a photo shows at least MIN_SHOWN of itself in every frame ratio it is given (a module whose places change
// shape with the width, a banner): when it does not, the module takes a layout that follows the photo instead.
/** @param {number[]} frames @param {{ width?: number, height?: number, slot?: string } | null | undefined} photo @returns {boolean} */
export function fitsFrames(frames, photo) {
  if (!photo || photo.slot || !(photo.width > 0 && photo.height > 0)) return true;
  return frames.every((frame) => shown(frame, photo.width / photo.height) >= MIN_SHOWN);
}

// The shapes of the places whose shape does not follow their photo (width over height, at the widths it changes at):
// a wide split row's banner, and a mosaic gallery's wide and narrow places (patterns.css, 280px rows). The components
// fall back to a layout that follows the photo when it does not fit (fitsFrames); the allocation picks a photo that
// fits first (media-allocation.mjs), so the competitor's layout stays where a photo can fill it.
export const FIXED_FRAMES = Object.freeze({ wideRow: [16 / 7], mosaicWide: [1.27, 2], mosaicNarrow: [0.61, 1] });

// The ratio a block shows its photos in before they say otherwise (fitRatio): its components use it, and the
// allocation prefers photos that fit it, so a row's photos share an orientation and none is cut to a strip.
/** @param {string} type @param {string} [variant] @returns {string} */
export function usualRatio(type, variant) {
  if (type === 'splitMedia') return variant === 'dual' ? '10 / 11' : variant === 'column' ? '3 / 2' : variant === 'stacked' ? '4 / 3' : '1 / 1';
  if (type === 'gallery') return '10 / 11';
  return '4 / 3';
}
// The blocks whose photos' frames start from their usual ratio (the others show a backdrop or a figure as it is).
const USUAL_FRAMED = new Set(['splitMedia', 'gallery', 'caseStudies', 'featureGrid']);

// The frames a block's photo at a position should fit: a place whose shape is fixed (a wide row's banner, a mosaic's
// places), else the block's usual ratio; null when the block has none.
export function slotFrames(block, variant, index) {
  if (block.type === 'splitMedia' && variant === 'wide') return FIXED_FRAMES.wideRow;
  if (block.type === 'gallery' && variant === 'mosaic') return index % 3 === 0 ? FIXED_FRAMES.mosaicWide : FIXED_FRAMES.mosaicNarrow;
  return USUAL_FRAMED.has(block.type) ? [parse(usualRatio(block.type, variant))] : null;
}
