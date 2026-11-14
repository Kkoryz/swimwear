// What each image position shows, decided when the page is planned, before anything is photographed (owner
// 2026-11-12: the hotel site's service cards were all "a laptop on a desk showing a chart": revenue management,
// accounting and IT are no scene a photo can show, so the image model drew a computer each time). Every position takes
// one of four visuals:
//   photo  the position's subject is a person, a place or a thing (a split row, a photo band, the hero, the closing band)
//   icon   the subject is a service or an idea (a card naming what the business does): a line icon, no photo
//   data   the section carries figures to draw (Site Factory's data visuals: a chart takes the photo's place)
//   none   the position shows no picture
// Only photo positions reach the image plan (lib/image-plan.mjs), the photo briefs (lib/photo-briefs.mjs) and the
// allocation: they all read the image slots of lib/media-slots.mjs, and an icon or data position has none.

import { isChartData } from './visual-data.mjs';

export const VISUAL_TYPES = Object.freeze(['photo', 'icon', 'data', 'none']);

// What the cards of a card grid show where the design gives them a picture (the competitor's photo cards):
// - components.ownerChoices.cardVisual, the owner's own choice, over everything;
// - components.cardVisual when the site sets it (a treatment's or a repair's choice: photo, icon or none), except photo
//   on a service business, whose cards stay icons (below);
// - icon for a trade whose photos are scenes of its work (components.tradePhotos "scenes", from the trade's
//   config/image-briefs.<trade>.json photos: a service business). Its cards name the services it sells, which no photo
//   shows; its photos are kept for the split rows, the photo bands, the hero and the closing band, where they show the
//   place, the people and the work;
// - photo otherwise: a trade whose photos are its products shows on each card the product the card is about.
// A service business's cards carry icons whatever a treatment or a repair writes (owner 2026-11-12; hotel-rm's treatment
// copied the competitor's photo cards as cardVisual "photo", and its service and related cards showed large photos:
// 2026-11-15, Fable's ruling). Only the owner's own choice (components.ownerChoices.cardVisual) sets photo there.
export function cardVisual(components = {}) {
  const owner = components.ownerChoices?.cardVisual;
  if (['photo', 'icon', 'none'].includes(owner)) return owner;
  if (components.tradePhotos === 'scenes' && components.cardVisual === 'photo') return 'icon';
  if (['photo', 'icon', 'none'].includes(components.cardVisual)) return components.cardVisual;
  return components.tradePhotos === 'scenes' ? 'icon' : 'photo';
}

// The card grid variant a design's photo cards render as on this site: icon cards where its cards take icons, plain
// cards where they take no picture, the photo cards otherwise. Any other variant shows no picture and is kept.
export function cardGridVariant(variant, components = {}) {
  if (variant !== 'media') return variant;
  return { photo: 'media', icon: 'icons', none: 'cards' }[cardVisual(components)];
}

// The photos of the trade (config/image-briefs*.json photos): "scenes" for a trade whose photos show its work, else
// none (its photos show its products). What the blueprint step writes to components.tradePhotos.
export const tradePhotos = (briefs) => (briefs?.photos === 'scenes' ? 'scenes' : undefined);

// The visual of one block's image positions (variant: the one it renders with; slots: its image slots, from
// mediaSlots): icon for icon cards, photo where it asks for a template photo, data where it draws its figures and asks
// for none (a split row's chart takes its photo's place), none otherwise.
export function blockVisual(block, variant, slots) {
  if (block.type === 'featureGrid' && variant === 'icons') return 'icon';
  if (slots.some((slot) => typeof slot === 'string')) return 'photo';
  if ((block.visuals ?? []).some((visual) => visual.type === 'data' && (isChartData(visual.data) || (block.type === 'splitMedia' && visual.data?.shape === 'sequence')))) return 'data';
  return 'none';
}
