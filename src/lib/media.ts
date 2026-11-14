// Every page's photos and its hero, for the renderer.
import { allocateSite } from '../../scripts/lib/media-allocation.mjs';
import { PHONE_MEDIA } from '../../scripts/lib/library-media.mjs';
import { heroPhoto, heroShowsPhoto, privacyHero } from '../../scripts/lib/media-slots.mjs';
import { isTrialBuild, trialFramed, trialHero } from '../../scripts/lib/trial-build.mjs';
import { isBuilt, pages, phoneHeroes, sitePhotos, variants } from './site-data';
import type { AuthoringPage, Media } from './types';

// Every page's photos, allocated for the whole site at once by section topic and product category
// (scripts/lib/media-allocation.mjs, shared with the image plan): route -> per-block media (null: no photo).
const allocation = allocateSite({ pages, components: variants, sitePhotos, isBuilt: (href: string) => isBuilt(href) });
// A gallery card linking to an unbuilt page has no photo (null at its position). A trial build (calibrate-plan.mjs)
// shows a grey frame where no photo fills a position yet (lib/trial-build.mjs).
const trial = isTrialBuild();
export const pageMedia = (route: string) => (trial ? trialFramed(allocation.byRoute[route] ?? []) : allocation.byRoute[route] ?? []) as Media[][];

// The crop a photo shows on phones in one of the frames that follow the competitor's phone shape (derive-phone-heroes:
// the page type's ratio for the frame), as the photo's phone source; the photo itself when it has none (it fills the
// frame, or the competitor's page has no such frame).
export function withPhoneCrop(photo: Media | null, frame: 'hero' | 'cta', pageType: string): Media | null {
  const ratio = phoneHeroes.frames?.[frame]?.byPageType[pageType];
  const crop = photo && !photo.sources?.length && ratio ? phoneHeroes.crops[photo.src]?.[ratio.toFixed(2)] : null;
  return photo && crop ? { ...photo, sources: [{ media: PHONE_MEDIA, ...crop }] } : photo;
}

// The hero's photo (this page's own, then the page type's, then the template default; scripts/lib/media-slots.mjs
// heroPhoto, shared with derive-phone-heroes) and treatment; without a photo the hero is plain.
export function pageHero(page: AuthoringPage) {
  const asked = variants.heroByPageType?.[page.pageType] ?? variants.hero;
  const own = heroPhoto(page, variants, sitePhotos) as Media | null;
  const media = withPhoneCrop(trial ? (trialHero(own, privacyHero(page, variants) && heroShowsPhoto(asked)) as Media | null) : own, 'hero', page.pageType);
  const variant = media ? asked : 'plain';
  return { media, variant, showsImage: Boolean(media) && heroShowsPhoto(variant) };
}
