// Maps measured reference sections to named patterns (module designs), and each pattern to a block type and variant
// of the pattern library. Page structure comes from the page blueprints (page-blueprints.mjs), not from here.

// Every reference pattern the classifier can name, with the library block that renders it (or why it is skipped).
export const PATTERN_DECISIONS = Object.freeze({
  'hero-overlay': 'hero:media-overlay', 'hero-split': 'hero:media-split', 'hero-banner': 'hero:media-banner', 'hero-plain': 'hero:plain',
  form: 'form', faq: 'faq', logos: 'logos', testimonials: 'testimonials', table: 'table', stats: 'stats', band: 'band',
  'numbered-cards': 'featureGrid:numbered', 'numbered-cards+mosaic': 'featureGrid:numbered + gallery:mosaic',
  checklist: 'iconList:checks', 'icon-features': 'iconList:icons', 'media-cards': 'featureGrid:media', 'contact-cards': 'contactChannels:cards',
  columns: 'featureGrid:columns', 'split-dual': 'splitMedia:dual', 'split-column': 'splitMedia:column', mosaic: 'gallery:mosaic', gallery: 'gallery:grid',
  figure: 'figure', 'split-tinted': 'splitMedia:tinted', split: 'splitMedia:single', 'split-video': 'splitMedia:single (video shown as a photo)',
  tabs: 'splitMedia:tinted (tab panels collapse to the first panel)', 'button-row': 'cta:inline', text: 'intro/proof',
  'heading-only': 'skip: a heading-only row is carried by the next section',
  social: 'skip: social profile links need real accounts',
  spacer: 'skip: spacer or decoration without content',
  // Excluded on purpose (not counted in coverage): a third-party map embed loads the provider's tracking before consent
  // and adds page weight; the address is shown as text in the contact channels.
  map: 'exclude: third-party map embed (the address is shown as text)',
});

const varies = (widths) => widths.length >= 3 && Math.max(...widths) / Math.max(1, Math.min(...widths)) > 1.3;

export function classifyPattern(shape, index, { pageType } = {}) {
  if (index === 0 && shape.largeImages >= 1 && shape.words < 80) {
    if (shape.words === 0) return 'hero-banner';
    return shape.coverBackground || (shape.coversSection && !shape.backgroundOnly) ? 'hero-overlay' : 'hero-split';
  }
  if (index === 0 && shape.largeImages === 0 && shape.words < 60 && shape.headings >= 1) return 'hero-plain';
  if (shape.map && shape.words < 40) return 'map';
  if (shape.hasForm) return 'form';
  if (shape.accordionItems >= 2) return 'faq';
  if (shape.marquee || (shape.largeImages >= 4 && shape.height < 320 && shape.words < 20) || (shape.smallImages >= 5 && shape.largeImages <= 1 && shape.words < 40)
    // a short static row of four or more small marks with hardly any words (a logo strip that does not move)
    || (shape.largeImages === 0 && shape.smallImages >= 4 && shape.words < 30 && shape.headings <= 1 && shape.height < 240)) return 'logos';
  if (shape.carousel && (shape.quotes >= 2 || shape.words >= 100)) return 'testimonials';
  if (shape.tabs >= 3) return 'tabs';
  if (shape.hasTable) return 'table';
  if (shape.stats >= 3 && shape.words < 80 && shape.largeImages === 0) return 'stats';
  if (index > 0 && shape.coverBackground && shape.words >= 8) return 'band';
  if (shape.numbered >= 2 && shape.largeImages >= 4) return 'numbered-cards+mosaic';
  if (shape.numbered >= 2 && shape.headings >= 3) return 'numbered-cards';
  if (shape.largeImages === 0 && (shape.checkItems >= 3 || shape.listItems >= 4) && shape.words >= 20) return 'checklist';
  if (shape.largeImages === 0 && shape.icons >= 3 && shape.headings >= 3 && pageType === 'contact') return 'contact-cards';
  if (shape.largeImages === 0 && shape.icons >= 3 && shape.words >= 40) return 'icon-features';
  if (shape.largeImages >= 2 && shape.headings >= 2 && shape.headings === shape.largeImages) return 'media-cards';
  // Two photos beside the copy: side by side, or one above the other in the photo column.
  if (shape.largeImages === 2 && shape.words >= 25) return shape.imagesPerRow === 1 ? 'split-column' : 'split-dual';
  if (shape.largeImages >= 3 && shape.words < 25 * shape.largeImages) return varies(shape.imageWidths) ? 'mosaic' : 'gallery';
  if (shape.largeImages === 1 && shape.words < 90 && Math.max(0, ...shape.imageWidths) >= shape.width * 0.55) return 'figure';
  if (shape.largeImages >= 1 && shape.words >= 25) return shape.video ? 'split-video' : shape.background ? 'split-tinted' : 'split';
  if (shape.video && shape.words >= 25) return 'split-video';
  if (shape.largeImages === 0 && shape.headings >= 3 && shape.words >= 40) return 'columns';
  if (shape.largeImages === 0 && shape.words <= 8 && shape.buttons >= 1) return 'button-row';
  if (shape.words >= 20) return 'text';
  if (shape.largeImages === 0 && shape.headings >= 1 && shape.words <= 8 && shape.icons < 2) return 'heading-only';
  if (shape.icons >= 2 && shape.words <= 8) return 'social';
  if (shape.largeImages >= 1) return 'figure';
  return 'spacer';
}

// Coverage: share of the reference page (by section height) rendered by a library pattern rather than skipped.
// Sections excluded on purpose ("exclude:" decisions) are left out of the page height.
export function coverage(sections) {
  const counted = sections.filter((section) => !PATTERN_DECISIONS[section.pattern]?.startsWith('exclude'));
  const total = counted.reduce((sum, section) => sum + section.height, 0) || 1;
  const covered = counted.filter((section) => !PATTERN_DECISIONS[section.pattern]?.startsWith('skip')).reduce((sum, section) => sum + section.height, 0);
  return Math.round((100 * covered) / total);
}

export function inventory(shapes, options = {}) {
  return shapes.map((shape, index) => {
    const pattern = classifyPattern(shape, index, options);
    // phone: the section's shape at a phone's width (measurePhoneSections), when the capture measured it.
    return { index: index + 1, pattern, decision: PATTERN_DECISIONS[pattern], height: shape.height, words: shape.words, largeImages: shape.largeImages, firstHeading: shape.firstHeading, ...(shape.phone ? { phone: shape.phone } : {}), shape };
  });
}

// Split-row variants in reference order (each pattern's splitMedia decision; a figure, a wide photo with little copy,
// is a wide row): authored split rows cycle through them on the matching page type.
export function splitSequence(sections) {
  return sections.map((section) => (section.pattern === 'figure' ? 'wide' : /^splitMedia:(\S+)/.exec(PATTERN_DECISIONS[section.pattern] ?? '')?.[1])).filter(Boolean);
}

// The competitor's signature of a page type: its full-width photo bands (figure sections, recorded as its photo walls
// of type band by authoredPatterns, a run of them as one). The floor of the bands its pages show: the image planning
// never places fewer (lib/media-slots.mjs withMediaModules, lib/visual-budget.mjs) and the layout audit checks it
// (signature_missing). A page type with no patterns has none.
export const signatureBands = (patterns) => (patterns?.mediaModules ?? []).filter((module) => module.type === 'band').length;

// The keys of a page type's patterns (template-variants.json components.pageTypes.<type>) that authoredPatterns sets:
// a new classification replaces them; every other key there (a section's variant, cta, testimonials, …) is the site's.
export const AUTHORED_PATTERN_KEYS = Object.freeze(['splitSequence', 'mediaModules', 'featureGrid', 'gallery', 'process']);

// Patterns an authored page type takes from its reference page: the split-row sequence, the card and gallery variants.
// Cards take the reference's own card pattern only: a reference with photo rows and no cards gives its cards no
// photos (owner 2026-11-12: the hotel site's home cards were photo cards by that rule, each "a laptop showing a chart";
// what a card shows is the site's rule, lib/slot-visuals.mjs). One that sets its points out as bullet lists (checklist)
// and has no cards gives them its list instead: a heading and lead beside the points (owner 2026-11-12: the hotel
// site's service pages were grey card walls, Concord's are bullet lists beside a heading). A reference with no process
// module shows steps in that list too, numbered.
const PROCESS_PATTERNS = /process|timeline|steps|circles|numbered/;
export function authoredPatterns(sections) {
  const sequence = splitSequence(sections);
  const cards = sections.find((section) => /cards|columns/.test(section.pattern));
  const gallery = sections.find((section) => section.pattern === 'mosaic' || section.pattern === 'gallery');
  const lists = sections.some((section) => section.pattern === 'checklist');
  const featureGrid = cards
    ? { 'numbered-cards': 'numbered', 'numbered-cards+mosaic': 'numbered', 'media-cards': 'media', 'contact-cards': 'boxed', columns: 'columns' }[cards.pattern]
    : lists ? 'bullets' : undefined;
  const process = lists && !sections.some((section) => PROCESS_PATTERNS.test(section.pattern)) ? 'list' : undefined;
  // Photo walls placed without copy, at their relative position among the reference page's sections (hero excluded). A
  // full-width photo (figure) is the reference's own photo band: its walls are bands, not a mosaic it never shows.
  const body = sections.slice(1);
  // At most two per page, a quarter of the page apart: a run of photo rows reads as one wall.
  const mediaModules = [];
  const wall = (section) => ['mosaic', 'gallery', 'numbered-cards+mosaic', 'figure'].includes(section?.pattern);
  // A full-width photo carrying a button (Concord's home: EXPLORE on the photo's lower edge, LEARN MORE under the next)
  // is a way on to a page, not a picture alone: its band leads on too (action, media-slots.mjs bandLink); a run of
  // photo rows is one wall, which leads on where any of its full-width photos does.
  const leads = (section) => section.pattern === 'figure' && (section.shape?.buttons ?? 0) > 0;
  let run = null;
  body.forEach((section, index) => {
    if (!wall(section)) { run = null; return; }
    if (wall(body[index - 1])) { if (run && leads(section)) run.action = true; return; }
    const at = Math.round((100 * index) / Math.max(1, body.length - 1)) / 100;
    run = null;
    if (mediaModules.length < 2 && mediaModules.every((module) => at - module.at >= 0.25)) {
      run = { at, type: { gallery: 'grid', figure: 'band' }[section.pattern] ?? 'mosaic', ...(leads(section) ? { action: true } : {}) };
      mediaModules.push(run);
    }
  });
  // A wall without a button carries no action key at all.
  for (const module of mediaModules) if (module.type !== 'band') delete module.action;
  return {
    ...(sequence.length ? { splitSequence: sequence } : {}),
    ...(mediaModules.length ? { mediaModules } : {}),
    ...(featureGrid ? { featureGrid } : {}),
    ...(process ? { process } : {}),
    ...(gallery ? { gallery: gallery.pattern === 'mosaic' ? 'mosaic' : 'grid' } : {}),
  };
}
