// Which photographs a page shows: the variant each block renders with, and the image slots (by photography class)
// that variant asks for. Shared by the renderer (PageView) and the image plan, so the images generated for a page
// are exactly the images the page will place.

import { BLOCK_VARIANTS, TEMPLATE_VARIANTS } from './authoring-contract.mjs';
import { galleryShown } from './gallery.mjs';
import { MAX_PHOTO_STEPS, MEDIA_KINDS } from './rules.mjs';
import { isChartData } from './visual-data.mjs';
import { DENSITY_EXEMPT_PAGE_TYPES, bandFor } from './density.mjs';
import { blockVisual, cardGridVariant, cardVisual } from './slot-visuals.mjs';
// The site's fitted model over the template's defaults: a module the site has not measured yet keeps its default.
import { DEFAULT_BLOCK_MODEL, planVisualBudget, varyItemRows, varySurfaces } from './visual-budget.mjs';
import { signatureBands } from './pattern-map.mjs';
import { leadBelowHero } from './heading-fit.mjs';

// Pattern variant for one block: the content's explicit request, then the page type's reference pattern (split rows
// cycle through the sequence observed on the matching reference page), then the template default. A card grid whose
// design gives its cards photos shows what the site's cards show (lib/slot-visuals.mjs cardGridVariant: icon cards for
// a trade whose cards name services).
export function resolveVariant(block, pageType, splitIndex, components) {
  // A variant the visual budget set for this page (planVisualBudget: photo cards cut to icon cards, tiles to links).
  if (block.planned && block.variant) return block.variant;
  // A split row that draws its section's chart in the photo's place is a plain text-beside row: the photo variants
  // bleed or frame a photo, not a chart (SplitMediaBlock.astro set it so alone, and the page's surfaces counted a tinted
  // band that was not there: hotel-rm 2026-11-14).
  if (block.type === 'splitMedia' && (block.visuals ?? []).some((visual) => visual.type === 'data' && isChartData(visual.data))) return 'single';
  // The site's own choice for this section (pageTypes.<type>.blocks.<block id>.variant, set by the treatment or a
  // repair) comes before the variant the section was given from the competitor's module.
  // A grid going on from another takes its first grid's choice when it has none of its own (hotel-rm's home m3-2 lost
  // m3's icon cards: 2026-11-15).
  const own = components.pageTypes?.[pageType]?.blocks;
  const chosen = own?.[block.id]?.variant ?? (block.type === 'featureGrid' && block.continues != null ? own?.[block.continues]?.variant : undefined);
  if (chosen) return chosen;
  const variant = designedVariant(block, pageType, splitIndex, components);
  // A related block's photo tiles (each page's own photo) are links on a site whose cards carry icons: cards that name
  // services carry a line icon, not a photo (motel 2026-11-14: twelve service pages' related tiles were photo panels).
  if (block.type === 'relatedPages') return variant === 'tiles' && cardVisual(components) === 'icon' ? 'links' : variant;
  if (block.type !== 'featureGrid') return variant;
  // Photo cards by the site-wide switch (components.featureGridMedia) are photo cards too.
  return variant === undefined && components.featureGridMedia && cardVisual(components) !== 'photo' ? cardGridVariant('media', components) : cardGridVariant(variant, components);
}

function designedVariant(block, pageType, splitIndex, components) {
  const patterns = components.pageTypes?.[pageType];
  // A page type whose reference sets its points out as bullet lists has cards only as title tiles (its sub-page
  // navigation): a section of points with text keeps to its lists, not to those tiles (the hotel site's service pages
  // kept grey card walls from Concord's service navigation).
  if (block.type === 'featureGrid' && block.variant === 'cards' && patterns?.featureGrid === 'bullets') return 'bullets';
  if (block.variant) return block.variant;
  if (block.type === 'intro') return components.intro ?? 'text';
  if (block.type === 'proof') return components.proof;
  if (block.type === 'splitMedia' && patterns?.splitSequence?.length) return patterns.splitSequence[splitIndex % patterns.splitSequence.length];
  // Every other block with variants (BLOCK_VARIANTS: a FAQ, a process, a table...): the page type's value, then the
  // site-wide one (components.<type>, where that key is the block's and not a template-wide treatment of another
  // meaning: components.splitMedia orders the rows, components.featureGrid outlines the cards); the renderer's own
  // default otherwise.
  if (block.type in BLOCK_VARIANTS) return patterns?.[block.type] ?? (block.type in TEMPLATE_VARIANTS ? undefined : components[block.type]);
  return undefined;
}

// Which side of a split row its photo takes: the site's own choice for this section (pageTypes.<type>.blocks.<block
// id>.side, as the competitor's row has it), else the site-wide order (components.splitMedia: alternate by place, or
// one side throughout).
export function splitSide(block, pageType, splitIndex, components) {
  const chosen = components.pageTypes?.[pageType]?.blocks?.[block.id]?.side;
  if (chosen) return chosen;
  const order = components.splitMedia ?? 'alternate';
  return order === 'alternate' ? (splitIndex % 2 === 0 ? 'media-end' : 'media-start') : order;
}

// Image slots a block asks for: a photography class, or the block's own media when the content supplies it. A block
// whose blueprint slot declares its photography (mediaKind) uses that class, or no template photo for null.
// A gallery asks for one photo per card it shows (lib/gallery.mjs: cards for built pages).
// Whether a gallery's cards are the site's pages shown with icons, not photos (cardVisual icon).
export const pageCardIcons = (block, components = {}) => block.type === 'gallery' && block.items.length > 0 && block.items.every((item) => item.href && !item.media) && cardVisual(components) === 'icon';

export function mediaSlots(block, variant, components, { isBuilt = () => true } = {}) {
  // A split row whose section shows a chart draws it in the photo's place (SplitMediaBlock), or its steps follow with
  // a photo of their own (withSectionVisuals): no photo is made for the row. Steps shown without a photo (a list:
  // stepsKeepPhoto) leave the row its own. Specs are not drawn: the row keeps its photo.
  if (block.type === 'splitMedia' && (block.visuals ?? []).some((visual) => visual.type === 'data' && (isChartData(visual.data) || (visual.data?.shape === 'sequence' && !block.stepsKeepPhoto)))) return [];
  const slots = moduleSlots(block, variant, components, isBuilt);
  if (block.mediaKind === undefined) return slots;
  return block.mediaKind === null ? slots.filter((slot) => typeof slot !== 'string') : slots.map((slot) => (typeof slot === 'string' ? block.mediaKind : slot));
}

// What each of a block's image slots is about (same order as mediaSlots): the card's or the section's heading; the
// intro row, photo walls and the closing band are about the page as a whole (null), and a card linking to a page is
// about that page (null: it shows that page's own photo).
export function mediaTopics(block, variant, components, options) {
  const slots = mediaSlots(block, variant, components, options);
  const own = block.heading ?? null;
  if (block.type === 'featureGrid') return slots.map((_, index) => block.items[index]?.heading ?? own);
  if (block.type === 'caseStudies') return slots.map((_, index) => block.items[index]?.title ?? own);
  if (block.type === 'styleGrid') return slots.map((_, index) => block.items[index]?.name ?? own);
  if (block.type === 'gallery') {
    const cards = galleryShown(block, options?.isBuilt ?? (() => true)).cards;
    return slots.map((_, index) => (cards[index]?.item.href ? null : cards[index]?.item.caption ?? own));
  }
  if (['splitMedia', 'proof', 'band', 'figure'].includes(block.type)) return slots.map(() => own);
  return slots.map(() => null);
}

// The photo each of a block's image slots is asked to show (same order as mediaSlots): the section's photo visuals
// (Site Factory's visuals of type photo: what it shows, where) on its template photo positions in turn, null where
// none is left. A card or a linked page's photo is about that card, never the section's.
export function mediaIntents(block, variant, components, options) {
  const photos = (block.visuals ?? []).filter((visual) => visual.type === 'photo');
  if (!photos.length || ['featureGrid', 'gallery', 'caseStudies', 'styleGrid', 'testimonials'].includes(block.type)) return mediaSlots(block, variant, components, options).map(() => null);
  let next = 0;
  return mediaSlots(block, variant, components, options).map((slot) => (typeof slot === 'string' && next < photos.length ? { ...photos[next++], section: block.heading ?? null } : null));
}

// The section photo visuals no image slot of the block takes (reported: the writer asked for them, the design has no
// place for them).
export function unusedIntents(block, variant, components, options) {
  const used = new Set(mediaIntents(block, variant, components, options).filter(Boolean).map((intent) => intent.id));
  return (block.visuals ?? []).filter((visual) => visual.type === 'photo' && !used.has(visual.id));
}

// The image slots of the module design a block renders with (the reference's pattern).
function moduleSlots(block, variant, components, isBuilt) {
  switch (block.type) {
    case 'intro': return variant === 'gallery' ? ['product', 'product', 'product', 'product'] : [];
    case 'splitMedia': return block.media ? [block.media] : ['dual', 'column', 'stacked'].includes(variant) ? ['process', 'product'] : ['process'];
    // Cards naming the site's own pages take icons where its cards do (a service business: its services are no scene a
    // photo can tell apart; the hotel site's sixteen service tiles were front desks, beds and walkways in turn).
    case 'gallery': return pageCardIcons(block, components) ? [] : galleryShown(block, isBuilt).cards.map(({ item }) => item.media ?? 'product');
    // A client project shows the product it made (the photo of its product page's category).
    case 'caseStudies': return block.items.map(() => 'product');
    // A style card shows the style (a product photo of the page's line).
    case 'styleGrid': return block.items.map(() => 'product');
    // Who said it: the client's own photo when supplied; no generated faces for invented people (the owner, 2026-09-26),
    // so a stand-in testimonial never looks like a real person's endorsement.
    case 'testimonials': return block.items.map((item) => item.media ?? null);
    // Photo cards only: icon cards and every other card variant show no photo (lib/slot-visuals.mjs).
    case 'featureGrid': return variant === 'media' || (!variant && components.featureGridMedia) ? block.items.map(() => 'product') : [];
    case 'proof': return variant === 'panel-media' ? ['material'] : [];
    case 'cta': return ['image-band', 'form'].includes(variant ?? components.cta) ? ['lifestyle'] : [];
    case 'band': return [block.media ?? 'lifestyle'];
    case 'figure': return [block.media ?? 'material'];
    // The photo-and-form module: a lifestyle photo beside the enquiry.
    case 'form': return variant === 'media' ? ['lifestyle'] : [];
    // Outlined step cards over a darkened photo of the work (the manufacturer's own photo class).
    case 'process': return variant === 'photo-cards' ? ['process'] : [];
    default: return [];
  }
}

// How many template photographs of each class one page places (content-supplied media excluded), plus its hero.
export function pageMediaDemand(page, components, options) {
  const demand = Object.fromEntries(MEDIA_KINDS.map((kind) => [kind, 0]));
  let splitIndex = 0;
  for (const block of withMediaModules(page, components, options)) {
    const variant = resolveVariant(block, page.pageType, block.type === 'splitMedia' ? splitIndex++ : 0, components);
    for (const slot of mediaSlots(block, variant, components, options)) if (typeof slot === 'string') demand[slot] += 1;
  }
  const heroVariant = components.heroByPageType?.[page.pageType] ?? components.hero;
  return { ...demand, hero: heroShowsPhoto(heroVariant) ? 1 : 0, heroVariant };
}

// What each block of a page shows as planned (lib/slot-visuals.mjs: photo, icon, data or none), in page order with the
// photo walls in place: [{ blockId, type, variant, visual }].
export function pageVisuals(page, components, options) {
  let splitIndex = 0;
  return withMediaModules(page, components, options).map((block) => {
    const variant = resolveVariant(block, page.pageType, block.type === 'splitMedia' ? splitIndex++ : 0, components);
    return { blockId: block.id, type: block.type, variant, visual: blockVisual(block, variant, mediaSlots(block, variant, components, options)) };
  });
}

// A hero variant that shows its photo: every one but plain (the renderer's hero, src/lib/media.ts, and the image plan).
export const heroShowsPhoto = (variant) => TEMPLATE_VARIANTS.hero.includes(variant) && variant !== 'plain';

// The photo a page's hero shows (the renderer's resolution, src/lib/media.ts pageHero): the owner's own hero photo
// (for this page when it names pages), then the template's for the route, the page type, the site; the privacy
// policy, legal text, shows none.
// A legal page opens without a photo unless the site sets its own hero for it (components.heroByPageType.privacy: the
// competitor's privacy page opens on a photo masthead; the hotel review asked twice for the configured hero to show).
export const privacyHero = (page, components = {}) => page.pageType !== 'privacy' || Boolean(components.heroByPageType?.privacy);
export function heroPhoto(page, components, sitePhotos = []) {
  if (!privacyHero(page, components)) return null;
  const own = sitePhotos.find((photo) => photo.class === 'hero' && photo.pages?.includes(page.route)) ?? sitePhotos.find((photo) => photo.class === 'hero' && !photo.pages);
  if (own) return { src: own.src, srcset: own.srcset, width: own.width, height: own.height, alt: own.alt };
  const media = components.media ?? {};
  return media.heroByRoute?.[page.route] ?? media.heroByPageType?.[page.pageType] ?? media.hero ?? null;
}

// Image-only modules (mosaic and gallery walls) the reference page type carries (components.pageTypes[type].mediaModules,
// from pattern-map authoredPatterns): their number and kind come from the reference, their place from this page. Each
// wall goes into the middle of the page's longest run of blocks without a photo, so long authored copy is broken up
// where it needs it and a page that already alternates copy and photos gets none. They carry no copy, only photos.
// A content page type whose reference has none gets one mosaic; utility pages, the home page (its structure is the
// blueprint's) and the hubs (a photo card per child page already) get none. A wall follows a copy section: between
// two proof sections (certificates, testimonials...) a photo wall has no purpose, so a run of proof gets none.
const MEDIA_MODULE_EXEMPT = new Set(['contact', 'privacy', 'home', 'products_hub', 'solutions_hub', 'wholesale_hub', 'blog_hub', 'blog_post']);
export const PROOF_BLOCKS = new Set(['certifications', 'testimonials', 'caseStudies', 'logos', 'stats', 'table', 'orderCase', 'orderRoutes', 'styleGrid', 'relatedPages', 'sources', 'trustBar', 'gallery', 'pricing', 'swatches']);
// A text section that asks for a photo of its own (Site Factory's visuals of type photo) shows it beside its text, as
// a split row (the competitor's photo-beside-text module) (owner 2026-10-30: a photo where the writer asked for one;
// the density audit keeps the page within the competitor's share of photos). Renderer, allocation and plan all see it.
const TEXT_SECTIONS = new Set(['intro', 'proof']);
const askedPhoto = (block) => (TEXT_SECTIONS.has(block.type) && !block.continues && (block.visuals ?? []).some((visual) => visual.type === 'photo')
  ? { ...block, type: 'splitMedia', paragraphs: block.paragraphs ?? [], variant: 'single', askedPhotoOf: block.type }
  : block);
// A section's steps in order (data of shape sequence) follow it as the site's own process module, in the style the
// competitor's process takes (components.process), else numbered cards over a photo of the work (owner 2026-10-30:
// the competitor's styles, a generated photo behind, the words the page's own text).
// The data's caption names the steps ("From your enquiry to your sample"): it is their heading, as written; a caption of
// more than CAPTION_HEADING_WORDS words is a sentence and leads them (swimwear 2026-11-15: five step sections stood
// without a heading, the caption a small line in an empty column).
const CAPTION_HEADING_WORDS = 12;
const captionOf = (caption) => (!caption?.trim() ? {} : caption.trim().split(/\s+/).length <= CAPTION_HEADING_WORDS ? { heading: caption.trim() } : { paragraphs: [caption.trim()] });
const stepsOf = (block, components, pageType) => (block.visuals ?? []).filter((visual) => visual.type === 'data' && visual.data?.shape === 'sequence').map((visual, index) => ({
  id: `${block.id}-steps${index ? `-${index + 1}` : ''}`,
  type: 'process',
  ...captionOf(visual.caption),
  steps: visual.data.items.map((item) => (item.detail ? { heading: item.label, text: item.detail } : item.label)),
  variant: stepsVariant(components.pageTypes?.[pageType]?.process ?? components.process ?? 'photo-cards', visual.data.items.length),
  ...(block.type === 'cta' ? {} : { continues: block.id }),
}));
// Steps over a photo of the work stack on a phone with the photo stretched behind them all: past MAX_PHOTO_STEPS
// (lib/rules.mjs) they are a list (hotel-rm 2026-11-14: four and five steps over one photo, 1,240-1,510px on a phone,
// the photo "severely cropped").
function stepsVariant(variant, count) { return variant === 'photo-cards' && count > MAX_PHOTO_STEPS ? 'list' : variant; }
// The closing band's steps come before it, the page's last word staying the band (owner 2026-11-09 via Site Factory:
// a closing section's steps were dropped; its charts are drawn before it too, PageView.astro).
// A section split into grids of cards (sf-kinds chunkCards) that renders as a bullet list is one list again: its
// grids after the first join it (a list has no rows to balance).
function joinedLists(blocks, components, pageType) {
  const joined = [];
  for (const block of blocks) {
    const last = joined.at(-1);
    if (block.type === 'featureGrid' && block.continues && last?.type === 'featureGrid' && [last.id, last.continues].includes(block.continues) && resolveVariant(last, pageType, 0, components) === 'bullets') joined[joined.length - 1] = { ...last, items: [...last.items, ...block.items] };
    else joined.push(block);
  }
  return joined;
}
export const withSectionVisuals = (blocks, components = {}, pageType = '') => joinedLists(blocks, components, pageType).flatMap((block) => {
  if (block.type === 'cta') return [...stepsOf(block, components, pageType), block];
  const steps = stepsOf(block, components, pageType);
  // Steps that take no photo of their own leave the section its photo.
  const own = steps.length && steps.every((item) => item.variant !== 'photo-cards') ? { ...askedPhoto(block), stepsKeepPhoto: true } : askedPhoto(block);
  return [own, ...steps];
});

// The words a page renders as the density measure counts them (lib/density.mjs: p, li, h1-h4, summary, outside nav,
// forms and tables; a closed accordion's text is not rendered): its copy without the labels of buttons and fields,
// eyebrows, captions, a table's cells, a person's name and role, and the answers under a FAQ's closed questions. Over
// the two sites' 34 measured pages this is within about 15% of the count the audit measured; copyWords, which counts
// every string, ran 6-49% over (the FAQ answers).
const NOT_RENDERED = new Set(['id', 'type', 'variant', 'href', 'src', 'srcset', 'media', 'mediaKind', 'continues', 'sourceSectionIds', 'visuals', 'factIds', 'slot', 'eyebrow', 'cta', 'secondaryCta', 'label', 'submitLabel', 'table', 'alt', 'caption', 'author', 'role', 'name', 'issuer', 'scope', 'number', 'validUntil', 'unit', 'value', 'fields', 'answer', 'photoBrief', 'brief']);
export function renderedWords(value) {
  if (typeof value === 'string') return (value.replace(/\]\([^)]*\)/g, ']').match(/[\p{L}\p{N}][\p{L}\p{N}'’.-]*/gu) ?? []).length;
  if (Array.isArray(value)) return value.reduce((sum, item) => sum + renderedWords(item), 0);
  if (value && typeof value === 'object') return Object.entries(value).reduce((sum, [key, item]) => sum + (NOT_RENDERED.has(key) ? 0 : renderedWords(item)), 0);
  return 0;
}

// A block's words as the trial build and the layout audit measure them (lib/density.mjs measureBlocks), the words the
// block model is fitted on: its rendered copy, and an FAQ's answers only where its variant shows them open (open-list
// and cards every one; the others the first under a heading, unless the site's FAQ starts closed: FaqBlock.astro).
// hotel-rm /ota-optimization/ 2026-11-14: every answer counted made an accordion 2,456px for 832px measured.
// Whether a section's data is drawn as charts after it (PageView.astro: a split row draws them in its photo's place).
export const drawsCharts = (block) => block.type !== 'splitMedia' && (block.visuals ?? []).some((visual) => visual.type === 'data' && isChartData(visual.data));

export function blockWords(block, variant, components = {}) {
  const words = renderedWords(block);
  if (block.type !== 'faq') return words;
  const items = block.items ?? [];
  const open = ['open-list', 'cards'].includes(variant) ? items : components.faqFirst !== 'closed' && block.heading ? items.slice(0, 1) : [];
  return words + open.reduce((sum, item) => sum + renderedWords(item.answer ?? ''), 0);
}


// The words of a section's copy (every string but ids, links and settings), as a stand-in for how tall its text renders.
const NOT_COPY = new Set(['id', 'type', 'variant', 'href', 'src', 'srcset', 'media', 'mediaKind', 'continues', 'sourceSectionIds', 'visuals', 'factIds', 'slot']);
export function copyWords(value) {
  if (typeof value === 'string') return (value.replace(/\]\([^)]*\)/g, ']').match(/[\p{L}\p{N}][\p{L}\p{N}'’.-]*/gu) ?? []).length;
  if (Array.isArray(value)) return value.reduce((sum, item) => sum + copyWords(item), 0);
  if (value && typeof value === 'object') return Object.entries(value).reduce((sum, [key, item]) => sum + (NOT_COPY.has(key) ? 0 : copyWords(item)), 0);
  return 0;
}

// Whether a page takes photo walls at all: with the reference's density band (components.densityBands) every page the
// band applies to (the visual budget, lib/visual-budget.mjs); without, every page but the exempt ones. The home page
// takes the reference home's own photo walls when it has some (Concord's home is a run of full-width photos); without,
// it keeps its blueprint's structure.
function takesWalls(page, components) {
  if (components.densityBands) return !DENSITY_EXEMPT_PAGE_TYPES.includes(page.pageType);
  const ownWalls = page.pageType === 'home' && components.pageTypes?.home?.mediaModules?.length;
  return !MEDIA_MODULE_EXEMPT.has(page.pageType) || Boolean(ownWalls);
}

// The full-width photo bands a page must show (the competitor's signature, pattern-map signatureBands): its page type's,
// on a page that takes photo walls; none on any other. What withMediaModules guarantees and the layout audit checks.
export const signatureFloor = (page, components) => (takesWalls(page, components) ? signatureBands(components.pageTypes?.[page.pageType]) : 0);

// The page's blocks as the renderer places them: its sections with their visuals, the photo walls, and then no two rows
// of short items one under the other and no two tinted split rows (lib/visual-budget.mjs varyItemRows, varySurfaces),
// on every page.
export function withMediaModules(page, components, options) {
  const blocks = placeMediaModules(page, components, options);
  const variantOf = (block) => modelVariant(block, page, blocks, components, options);
  return varySurfaces(varyItemRows(blocks, variantOf), variantOf);
}

function placeMediaModules(page, components, options) {
  const budget = components.densityBands ?? null;
  if (!takesWalls(page, components)) return withSectionVisuals(page.blocks, components, page.pageType);
  // The competitor's photo modules for the page type, and the photo rows the run's density audit added or took away
  // (photoBreaks, an older site's data from the audit's rule fix, retired for the trial build calibrate-plan.mjs: more
  // where the text ran on too long or the page showed too little, fewer
  // where it showed too much; a negative number takes that many of the competitor's modules off the page).
  const breaks = budget ? 0 : components.photoBreaks?.[page.route] ?? 0;
  const competitor = components.pageTypes?.[page.pageType]?.mediaModules ?? (budget ? [] : [{ at: 0.5, type: 'mosaic' }]);
  // The competitor's signature: its full-width photo bands on this page type (pattern-map signatureBands), the floor
  // of the page's bands (owner 2026-11-12: Concord's pages are full-width photo after full-width photo; the hotel
  // site's home showed small card photos and none of them).
  const floor = signatureFloor(page, components);
  // An extra row takes the reference's own kind of photo row: a band where its walls are bands, else a grid.
  const extra = Array.from({ length: Math.max(0, breaks) }, () => ({ type: competitor.some((module) => module.type === 'band') ? 'band' : 'grid', extra: true }));
  // Rows the audit took off (a negative photoBreaks): the last first, a signature band only while more than the floor stay.
  const kept = [...competitor];
  for (let cut = Math.max(0, -breaks); cut > 0; cut -= 1) {
    const other = kept.findLastIndex((module) => module.type !== 'band');
    if (other >= 0) kept.splice(other, 1);
    else if (kept.length > floor) kept.pop();
    else break;
  }
  const modules = [...kept, ...extra];
  const blocks = withSectionVisuals(page.blocks, components, page.pageType);
  // How much a section holds, as a stand-in for how tall it renders (an extra row splits the run where it is tallest).
  const weight = (block) => JSON.stringify(block).length;
  // How many photos of a kind this page can show: a site's own library never repeats on a page, so a slot past what
  // its pools hold stays empty (site10's development page had seven process slots for three process photos, and its
  // photo rows went where the empty slots were counted as photos). Every caller sees the same pools, so the renderer,
  // the allocation and the audits place the walls alike. Unknown without a library: every slot counts.
  const media = components.media ?? {};
  const counted = media.origin !== 'reference-placeholder' && Boolean(media.pools || media.routePools);
  const available = (kind) => (media.routePools?.[page.route]?.[kind]?.length ?? 0) + (media.pools?.[kind]?.length ?? 0);
  modules.forEach((module, index) => {
    const closing = blocks.findIndex((block) => block.type === 'cta' || block.type === 'form');
    const body = closing < 0 ? blocks.length : closing;
    // A signature band always goes in: where the rules below put it, else at its place on the reference page.
    const signature = !module.extra && module.type === 'band';
    const made = () => wall(`media-module-${index + 1}`, module.type, { competitor: !module.extra, signature, action: Boolean(module.action) });
    const atReference = () => {
      const at = referencePlace(blocks, body, module.at);
      if (at !== undefined) blocks.splice(at, 0, made());
    };
    // Which body blocks show a photo (split rows take their variants in order, as the renderer does).
    let splitIndex = 0;
    const taken = {};
    const shows = (slot) => typeof slot !== 'string' ? Boolean(slot) : !counted || (taken[slot] = (taken[slot] ?? 0) + 1) <= available(slot);
    const photo = blocks.slice(0, body).map((block) => mediaSlots(block, resolveVariant(block, page.pageType, block.type === 'splitMedia' ? splitIndex++ : 0, components), components, options).map(shows).some(Boolean));
    // The competitor's modules take the run of most sections; an extra row the run of most content.
    const size = (start, end) => (module.extra ? blocks.slice(start, end).reduce((sum, block) => sum + weight(block), 0) : end - start);
    let best = { start: 0, length: 0, size: 0 };
    for (let start = 0; start < body;) {
      if (photo[start]) { start += 1; continue; }
      let end = start;
      while (end < body && !photo[end]) end += 1;
      if (size(start, end) > best.size) best = { start, length: end - start, size: size(start, end) };
      start = end;
    }
    if (best.length < 2) return signature ? atReference() : undefined;
    // A competitor's module breaks a run of text only when the run holds more words than the reference lets a
    // picture-less run hold (components.textRunWords, measure-reference-density.mjs): a short page needs no photo wall
    // (owner 2026-11-12: careers had 138 words and a mosaic, 52% of it pictures). An extra row is the audit's answer and
    // always goes in, and so does the competitor's signature band (that measure is for the walls added for density).
    // Without the measure, every page gets the competitor's modules.
    if (!module.extra && !signature && components.textRunWords && copyWords(blocks.slice(best.start, best.start + best.length)) <= components.textRunWords) return;
    // A competitor's module: the place nearest the run's middle right after a copy section. An extra row: the place
    // that splits the run's content most evenly, after any section but a photo one (it is there to break the text).
    const middle = best.start + Math.floor(best.length / 2);
    const inner = Array.from({ length: best.length - 1 }, (_, offset) => best.start + offset + 1);
    const places = (module.extra ? inner.filter((at) => !['gallery', 'trustBar'].includes(blocks[at - 1].type)) : inner.filter((at) => !PROOF_BLOCKS.has(blocks[at - 1].type))).filter((at) => !splitsSection(blocks, at));
    if (!places.length) return signature ? atReference() : undefined;
    const uneven = (at) => (module.extra ? Math.abs(size(best.start, at) - size(at, best.start + best.length)) : Math.abs(at - middle));
    const at = places.sort((left, right) => uneven(left) - uneven(right))[0];
    blocks.splice(at, 0, made());
  });
  if (budget) {
    // The site's kind of wall: a band where the reference's walls are bands on any page type, else a grid.
    const banded = Object.values(components.pageTypes ?? {}).some((patterns) => (patterns.mediaModules ?? []).some((module) => module.type === 'band'));
    const variantOf = (block) => modelVariant(block, page, blocks, components, options);
    const heroVariant = components.heroByPageType?.[page.pageType] ?? components.hero;
    const heroShown = privacyHero(page, components) && heroShowsPhoto(heroVariant);
    // The variants the page renders, before the walls are planned on them (withMediaModules varies the rows again after,
    // for the rows the walls now stand between): steps set out as a list beside a card row hold no picture (motel
    // /our-process/ 2026-11-14: planned as circles over a photo, no wall, 16% for a band from 19%).
    varySurfaces(varyItemRows(blocks, variantOf), variantOf);
    const below = page.hero ? leadBelowHero(page, heroShown ? heroVariant : 'plain', components) : false;
    const hero = page.hero ? { block: { type: 'hero' }, variant: heroShown ? heroVariant : 'plain', words: renderedWords(below ? { ...page.hero, lead: null } : page.hero) } : null;
    const lead = below ? { words: renderedWords(page.hero.lead) } : null;
    planVisualBudget(blocks, { bands: bandFor(budget, page.pageType), floor, model: components.blockModel ? { ...DEFAULT_BLOCK_MODEL, ...components.blockModel } : DEFAULT_BLOCK_MODEL, variantOf, wordsOf: (block) => blockWords(block, variantOf(block), components), lead, chartsOf: drawsCharts, wall: (id) => wall(id, banded ? 'band' : 'grid'), isWall: (block) => String(block.id).startsWith('media-module-'), apart: (before, after) => !(PROOF_BLOCKS.has(before?.type) && PROOF_BLOCKS.has(after?.type)), hero, pageType: page.pageType });
  } else if (components.textRunWords) breakLongRuns(blocks, page, components, options, competitor);
  return blocks;
}

// The variant a block renders with as the block model names it (lib/visual-budget.mjs; the layout audit measures it
// so): a renderer's own default where none is set, a featureGrid's pattern, a closing band showing its photo (image-band,
// form) apart from one without. blocks: the page's blocks, for a split row's place among them. Shared with the layout
// plan (lib/layout-plan.mjs).
export function modelVariant(block, page, blocks, components, options) {
  const splitIndex = block.type === 'splitMedia' ? Math.max(0, blocks.filter((item) => item.type === 'splitMedia').indexOf(block)) : 0;
  const variant = resolveVariant(block, page.pageType, splitIndex, components);
  if (block.type === 'featureGrid') return variant ?? (mediaSlots(block, variant, components, options).length ? 'media' : 'cards');
  const shown = variant ?? { process: 'circles', cta: components.cta, relatedPages: 'links', iconList: 'checks', faq: components.faq }[block.type];
  return block.type === 'cta' && mediaSlots(block, shown, components, options).length ? `${shown}+photo` : shown;
}

// A photo wall of a kind: a band is one landscape photo across the page (lifestyle, made 3:2, so the page-wide frame
// does not cut a square to a strip), a grid four photos, a mosaic three. competitor: one of the competitor's own walls
// (its mediaModules); signature: one of its full-width photo bands, which the visual budget keeps to the floor.
function wall(id, type, { competitor = false, signature = false, action = false } = {}) {
  const photos = { band: 1, grid: 4 }[type] ?? 3;
  return { id, type: 'gallery', variant: ['band', 'grid'].includes(type) ? type : 'mosaic', items: Array.from({ length: photos }, () => (type === 'band' ? { media: 'lifestyle' } : {})), ...(competitor ? { competitor: true } : {}), ...(signature ? { signature: true } : {}), ...(action && type === 'band' ? { action: true } : {}) };
}

// Whether a wall at this place would cut a section in two: the block there goes on from the one before it (continues),
// as the hotel home's first band stood between its service cards and the rest of them.
export const splitsSection = (blocks, at) => blocks[at]?.continues != null && [blocks[at - 1]?.id, blocks[at - 1]?.continues].includes(blocks[at].continues);

// The page a band with a button leads to (the reference's photo band carrying one: pattern-map mediaModules action):
// the last link to another page in the copy of the section the band follows, its words the button's (our own copy,
// nothing written for the button). null: that section links nowhere, and the band stays a photo alone.
/** @param {any[]} blocks @param {number} index @param {string | null} [route] @returns {{ label: string, href: string } | null} */
export function bandLink(blocks, index, route = null) {
  const before = blocks[index - 1];
  if (!blocks[index]?.action || !before) return null;
  const links = [...JSON.stringify(before).matchAll(/\[([^[\]"]+)\]\((\/[^)\s#"]*)\)/g)].filter(([, , href]) => href !== route);
  if (!links.length) return null;
  const [, label, href] = links.at(-1);
  return { label: label.charAt(0).toUpperCase() + label.slice(1), href };
}

// Where a wall goes at its relative place on the reference page (at, 0 to 1 over the body before the closing call):
// between two body blocks or before the closing call, never next to another wall; after a copy section where one is
// near, else after any. undefined when the page has no such place.
function referencePlace(blocks, body, at = 0.5) {
  const isWall = (block) => String(block?.id).startsWith('media-module-');
  const places = Array.from({ length: body }, (_, offset) => offset + 1).filter((place) => !isWall(blocks[place - 1]) && !isWall(blocks[place]) && !splitsSection(blocks, place));
  if (!places.length) return undefined;
  const wanted = Math.max(1, Math.round(at * body));
  return places.sort((left, right) => Number(PROOF_BLOCKS.has(blocks[left - 1].type)) - Number(PROOF_BLOCKS.has(blocks[right - 1].type)) || Math.abs(left - wanted) - Math.abs(right - wanted))[0];
}

// The photos follow the content (owner 2026-11-12): after the reference's own walls, every run of picture-less sections
// holding more words than the reference lets a run hold (components.textRunWords) gets a wall of the reference's kind
// where it splits the run's words most evenly, until none does (a run inside one section cannot be split; at most
// MAX_CONTENT_WALLS a page). The hotel site's service pages, two to three times Concord's copy as its bullet lists, ran
// 4,000 to 13,000px without a picture. A wall placed here counts as a photo whatever the library holds, so the plan,
// the allocation and the renderer place the same walls.
const MAX_CONTENT_WALLS = 12;
function breakLongRuns(blocks, page, components, options, competitor) {
  const type = competitor.some((module) => module.type === 'band') ? 'band' : 'grid';
  for (let added = 0; added < MAX_CONTENT_WALLS; added += 1) {
    const closing = blocks.findIndex((block) => block.type === 'cta' || block.type === 'form');
    const body = closing < 0 ? blocks.length : closing;
    let splitIndex = 0;
    const photo = blocks.slice(0, body).map((block) => String(block.id).startsWith('media-module-') || mediaSlots(block, resolveVariant(block, page.pageType, block.type === 'splitMedia' ? splitIndex++ : 0, components), components, options).some(Boolean));
    let run = null;
    for (let start = 0; start < body && !run;) {
      if (photo[start]) { start += 1; continue; }
      let end = start;
      while (end < body && !photo[end]) end += 1;
      const places = Array.from({ length: end - start - 1 }, (_, offset) => start + offset + 1).filter((at) => !['gallery', 'trustBar'].includes(blocks[at - 1].type) && !splitsSection(blocks, at));
      if (places.length && copyWords(blocks.slice(start, end)) > components.textRunWords) run = { start, end, places };
      start = end;
    }
    if (!run) return;
    const words = (from, to) => copyWords(blocks.slice(from, to));
    const at = run.places.sort((left, right) => Math.abs(words(run.start, left) - words(left, run.end)) - Math.abs(words(run.start, right) - words(right, run.end)))[0];
    blocks.splice(at, 0, wall(`media-module-run-${added + 1}`, type));
  }
}
