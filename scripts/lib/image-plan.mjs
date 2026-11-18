// Stage 09 image library: one set of generated photographs per product category (shared by that category's
// manufacturer and wholesale pages) plus one site-wide set. What to make comes from what the pages place, as the
// site allocation asks for it (media-allocation.mjs): per category and class, plain photos for positions about the
// page as a whole (capped per class), and one photo per section or card topic (a card "Private Label" on the bra page
// gets a bra photo made for it). The reference template's photos are style references only.

import { GENERAL, SERVICE_HERO, allocateSite, intentKey, isThemeCategory, themeCategory, topicWords } from './media-allocation.mjs';
import { pageMediaDemand } from './media-slots.mjs';
import { CHILDREN_THEME, fitsTheme, routeThemes, themeById, themedName } from './page-theme.mjs';
import { photoClassOf } from './photo-class.mjs';
import { MEDIA_KINDS, PERSON_KINDS, REAL_ONLY_KINDS, SITE_WIDE_KINDS } from './rules.mjs';
import { SHOT_JUMP, takeTurn } from './image-style.mjs';

export const IMAGE_PLAN_SCHEMA = 'seo-site-image-plan-v1';
// Pages one site-wide hero photo opens at most (four-site audit 2026-11-17, A-10: the motel site's 5 heroes opened 18
// pages, site13's four general heroes 13): the plan asks for as many site-wide heroes as that takes, over the briefs'
// generalCaps.hero; the SEO audit reports a hero on more pages (hero_reused).
export const HERO_MAX_PAGES = 3;
// Pages one site-wide photo of a capped class shows on at most (four-site audit 2026-11-17, Fable's plan C13: site13's
// three process photos, general-process-1 to 3, stood on 11 pages each): the factory and its process, the classes a
// visitor reads as the maker's own (rules.mjs REAL_ONLY_KINDS, a portrait being one person's). As with the heroes the
// plan asks for as many site-wide photos of the class as that takes (only planned: none is made here); the SEO audit
// reports one on more pages (process_reused).
export const PHOTO_MAX_PAGES = 3;
export const REUSE_CAPPED_KINDS = Object.freeze(REAL_ONLY_KINDS.filter((kind) => !SITE_WIDE_KINDS.includes(kind)));
const CATEGORY_PAGE_TYPES = new Set(['product_manufacturer', 'product_wholesale']);
const fileName = (path) => path.replaceAll(String.fromCharCode(92), '/').split('/').at(-1);
// A reference photo of the production floor (briefs.productionSceneWords in what it shows, or in its file name).
export const mentionsAny = (words, text) => (words ?? []).some((word) => text.toLowerCase().includes(word.toLowerCase()));
export const isProductionScene = (ref, words) => mentionsAny(words, `${ref.subject ?? ''} ${fileName(ref.path)}`);
const slug = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// A product page's category from its route (/wholesale-sports-bra/ -> "sports bra"), and so for a page in ownRoutes;
// every other page is site-wide.
export function pageCategory(page, briefs, ownRoutes = null) {
  if (!CATEGORY_PAGE_TYPES.has(page.pageType) && !ownRoutes?.has(page.route)) return GENERAL;
  const stop = new Set(briefs.categoryStopWords);
  const words = page.route.split('/').filter(Boolean).at(-1).split('-').filter((word) => word && !stop.has(word));
  // A lone "s" is the possessive the slug lost (/men-s-swimwear-manufacturer/ -> "men's swimwear").
  const name = words.join(' ').replace(/(\w) s\b/g, "$1's");
  return briefs.categoryAliases?.[name] ?? (name || GENERAL);
}

// The service pages that get photos of their own: one whose borrowed site-wide photos were judged not to show its
// subject (judge-image-fit.mjs; the factory's own classes, placeholderKinds, left aside), and one that has its own
// already (previous: the plan's routes), so it keeps them (owner 2026-10-30: site10's packaging and hardware pages
// showed models in swimwear, while its embroidery and printing pages fitted the line's photos and keep them).
const SERVICE_PAGE_TYPES = new Set(['solution', 'place']);

// The service pages whose hero shows the service itself (site13 claude-seo audit 2026-11-17, M-13: the embroidery,
// printing, launch and consulting pages opened on the line's model in swimwear; image search and buyers saw nothing of
// the work): each solution or place page that shows a hero photo and has no photos of its own (ownRoutes) asks for one
// photo of its service (briefs.serviceSubjects.hero, with the page's title), made as a section's own ask is (intent);
// its other positions keep the line's photos. Route -> { category, intent }; none without serviceSubjects.
export function serviceHeroes(pages, components, briefs, ownRoutes = null, line = '') {
  const template = briefs.serviceSubjects?.hero;
  const heroes = new Map();
  // A page's own opening photo the site names (site.json pagePhotos[route].hero, any page type; coordinator 2026-11-18:
  // the about, FAQ and case study pages opened on the line's model, a quote page on aloha shirts worn), made as its ask.
  for (const page of pages) {
    const content = briefs.pagePhotos?.[page.route]?.hero;
    if (!content || page.status === 'placeholder' || !pageMediaDemand(page, components).hero) continue;
    heroes.set(page.route, { category: pageCategory(page, briefs, ownRoutes), intent: { key: intentKey(page.route, SERVICE_HERO), route: page.route, id: SERVICE_HERO, content, setting: null, caption: page.hero?.heading ?? null, purpose: "the page's opening photo, under or beside its title: it shows what the page is about", section: page.hero?.heading ?? null } });
  }
  if (!template) return heroes;
  for (const page of pages) {
    if (heroes.has(page.route)) continue;
    if (!SERVICE_PAGE_TYPES.has(page.pageType) || ownRoutes?.has(page.route) || page.status === 'placeholder' || !pageMediaDemand(page, components).hero) continue;
    const category = pageCategory(page, briefs, new Set([page.route]));
    if (category === GENERAL) continue;
    const title = page.hero?.heading ?? null;
    const content = template.replaceAll('{category}', category).replaceAll('{line}', line);
    heroes.set(page.route, { category, intent: { key: intentKey(page.route, SERVICE_HERO), route: page.route, id: SERVICE_HERO, content, setting: null, caption: title, purpose: "the page's opening photo, under or beside its title: it shows the service the page offers, being done", section: title } });
  }
  return heroes;
}

export function ownPhotoRoutes(pages, imageFit, briefs, previous = null) {
  const placeholder = (src) => (briefs.placeholderKinds ?? []).some((kind) => src.includes(`-${kind}-`));
  const misfit = new Set((imageFit?.pages ?? []).filter((page) => page.images.some((image) => image.fit === 'wrong_subject' && image.src.includes(`/${GENERAL}-`) && !placeholder(image.src))).map((page) => page.route));
  return new Set(pages.filter((page) => SERVICE_PAGE_TYPES.has(page.pageType) && (misfit.has(page.route) || (previous?.routes?.[page.route] ?? GENERAL) !== GENERAL)).map((page) => page.route));
}

const words = (text) => new Set(text.toLowerCase().split(/[^a-z]+/).filter((word) => word.length > 1).map((word) => word.replace(/s$/, '')));
// A product made for children (briefs.childCategoryWords in its category name) is never shown on a person: site10's
// baby and toddler photos were planned on adult models, which the image model refused or which showed adults. Its
// photos show the product alone (owner 2026-10-27).
export const forChildren = (category, briefs) => [...words(category)].some((word) => (briefs.childCategoryWords ?? []).includes(word));

// Style references for one entry: the class's own reference photos (all photos when it has none), the least used so
// far first, so entries spread over the references instead of sharing a pair; among equally used ones, those showing
// the entry's product. The first reference is the scene the entry follows.
export function pickReferences(pool, category, usage, count = 2) {
  const wanted = words(category);
  const relevance = (ref) => [...words(ref.subject)].filter((word) => wanted.has(word)).length;
  const picked = [];
  for (let slot = 0; slot < Math.min(count, pool.length); slot += 1) {
    const ranked = pool.filter((ref) => !picked.includes(ref)).map((ref, order) => ({ ref, order }))
      .sort((left, right) => (usage.get(left.ref.path) ?? 0) - (usage.get(right.ref.path) ?? 0) || relevance(right.ref) - relevance(left.ref) || left.order - right.order);
    picked.push(ranked[0].ref);
    usage.set(ranked[0].ref.path, (usage.get(ranked[0].ref.path) ?? 0) + 1);
  }
  return picked;
}

const sameIntent = (left, right) => JSON.stringify(left ?? null) === JSON.stringify(right ?? null);

// Every image position the site asks a photo for: the site allocation run on an empty library ({ route, blockId, kind,
// category, topic, intent }, in page order). What the image steps work from (Fable's plan, stage 3: site-run hashes it as
// the images step's input, plan:photo-slots), so a setting that moves no photo position (a heading's fit, a colour; the
// block model only where it moves a wall) makes no photo again.
// nav (site-nav.json): the menu items above each page, which name its theme (lib/page-theme.mjs) when its category
// does not; a themed page's factory and process positions ask for its theme's photos.
export function photoDemand({ pages, components, briefs, ownRoutes = null, nav = null, line = null }) {
  const routes = Object.fromEntries(pages.map((page) => [page.route, pageCategory(page, briefs, ownRoutes)]));
  const built = new Set(pages.map((page) => page.route));
  const probe = allocateSite({ pages, components: { ...components, media: { placeholders: briefs.placeholderKinds ?? [], routeCategories: routes, routeThemes: routeThemes(pages, routes, briefs, nav, line), ...(briefs.pagePhotos ? { pagePhotos: briefs.pagePhotos } : {}) } }, isBuilt: (href) => !href.startsWith('/') || built.has(href) });
  return probe.unfilled.map(({ route, status, blockId, kind, category, topic, intent = null }) => ({ route, status, blockId, kind, category, topic, intent }));
}

// The plan: library entries with subjects, sizes and style references, and each route's category. Classes listed in
// briefs.placeholderKinds are not generated (they stay image slots until real photos are supplied).
// ownRoutes: the service pages that get photos of their own (ownPhotoRoutes).
// gaps: the positions the site's own library leaves empty as the renderer lays the pages out with it (libraryGaps): a
// page lays out more photo walls when some of its positions show no photo, so the demand probed on an empty library
// can fall short of what the built page asks (aloha 2026-11-18: the one-piece page rendered three lifestyle walls for
// the two photos planned).
// notWorn: the categories whose photos show an item nobody wears (docs/research/image-types.json products.worn false:
// packaging, buttons, labels): their photos of a person's class are planned from briefs.itemSubjects, the item itself.
export function planLibrary({ pages, components, line, lineName = null, briefs, styleRefs, previous = null, ownRoutes = null, nav = null, replaceScenes = false, gaps = [], notWorn = [] }) {
  const routes = Object.fromEntries(pages.map((page) => [page.route, pageCategory(page, briefs, ownRoutes)]));
  // Each page's theme (lib/page-theme.mjs), and so each category's: its first page's (a manufacturer and a wholesale
  // page of one product sit under the same menu item).
  const themes = routeThemes(pages, routes, briefs, nav, line);
  const categoryTheme = new Map();
  for (const page of pages) if (themes[page.route] && !categoryTheme.has(routes[page.route])) categoryTheme.set(routes[page.route], themeById(themes[page.route], briefs));
  categoryTheme.delete(GENERAL);
  for (const id of new Set(Object.values(themes))) categoryTheme.set(themeCategory(id), themeById(id, briefs));
  // What a category's photos name as their product: the line's for the site-wide set, a theme's set the line as the
  // theme has it ("men's swimwear"), a category the name its theme gives it ("men's boardshorts").
  const named = lineName || line;
  const nameOf = (category) => (category === GENERAL ? named : isThemeCategory(category) ? categoryTheme.get(category)?.product ?? themedName(named, categoryTheme.get(category)) : themedName(category, categoryTheme.get(category)));
  // A service page's own opening photo (serviceHeroes); the page no longer takes a turn of the site-wide heroes.
  const serviceHero = serviceHeroes(pages, components, briefs, ownRoutes, named);
  // Every image position the site asks for (photoDemand).
  const probe = { unfilled: photoDemand({ pages, components, briefs, ownRoutes, nav, line }) };
  const demand = {};
  const topics = {};
  const perPage = new Map();
  // The site-wide positions of each capped class (REUSE_CAPPED_KINDS), on all pages.
  const placements = new Map();
  // Positions whose section asks for a photo of its own (Site Factory's visuals): one photo each, made from that ask.
  const asked = [];
  for (const request of probe.unfilled) {
    if ((briefs.placeholderKinds ?? []).includes(request.kind)) continue;
    if (request.intent) { asked.push(request); continue; }
    demand[request.category] ||= Object.fromEntries([...MEDIA_KINDS, 'hero'].map((kind) => [kind, 0]));
    // A class with no topic photos (briefs.topicCaps) counts every position as a plain one, as does a placeholder page
    // (its headings are stand-ins).
    if (request.topic && request.status !== 'placeholder' && briefs.topicCaps?.[request.kind]) {
      const list = ((topics[request.category] ||= {})[request.kind] ||= new Map());
      const key = [...topicWords(request.topic)].sort().join(' ');
      if (key && !list.has(key)) list.set(key, request.topic);
      // A topic beyond the class's topic photos (briefs.topicCaps: the first ones get one) takes a plain photo, which
      // the page then needs besides its plain positions (aloha 2026-11-18: the swimwear page asked 20 product photos,
      // 16 were made and its wall of four stayed grey).
      if (key && [...list.keys()].indexOf(key) < briefs.topicCaps[request.kind]) continue;
    }
    const counter = `${request.route}|${request.category}|${request.kind}`;
    perPage.set(counter, (perPage.get(counter) ?? 0) + 1);
    demand[request.category][request.kind] = Math.max(demand[request.category][request.kind], perPage.get(counter));
    // A theme's set is shared by its pages as the site-wide one is (M-13), so it is capped the same way.
    if ((request.category === GENERAL || isThemeCategory(request.category)) && REUSE_CAPPED_KINDS.includes(request.kind)) placements.set(`${request.category}|${request.kind}`, (placements.get(`${request.category}|${request.kind}`) ?? 0) + 1);
  }
  // A site-wide photo of a capped class shows on PHOTO_MAX_PAGES pages at most (C13): as many photos as the site's
  // positions of the class take at that, so the pages beyond one photo's share ask for photos of their own (a photo
  // never repeats on a page, so its positions are its pages).
  for (const [key, count] of placements) { const [category, kind] = key.split('|'); demand[category][kind] = Math.max(demand[category][kind], Math.ceil(count / PHOTO_MAX_PAGES)); }
  for (const page of pages) {
    const category = routes[page.route];
    demand[category] ||= Object.fromEntries([...MEDIA_KINDS, 'hero'].map((kind) => [kind, 0]));
    // A product line's pages share its hero; the general pages (home, about, hubs, solutions) take turns over up to
    // generalCaps.hero heroes, so one photo does not open every page. A service page with its own opening photo
    // (serviceHeroes) takes none.
    const hero = serviceHero.has(page.route) ? 0 : pageMediaDemand(page, components).hero;
    demand[category].hero = category === GENERAL ? demand[category].hero + hero : Math.max(demand[category].hero, hero);
  }
  const kept = new Map((previous?.entries || []).filter((entry) => entry.status !== 'retired').map((entry) => [entry.id, entry]));
  const placeholders = briefs.placeholderKinds || [];
  const allRefs = [...new Map(Object.values(styleRefs).flat().map((ref) => [ref.path, ref])).values()];
  // A recorded entry with its references at their current paths, matched by file name (a workspace made by copying
  // another records the other's absolute paths: site10's 34 made photos were planned again), or null when one is gone.
  const byName = new Map(allRefs.map((ref) => [fileName(ref.path), ref.path]));
  const withCurrentRefs = (entry) => (entry?.styleRefs?.length && entry.styleRefs.every((path) => byName.has(fileName(path))) ? { ...entry, styleRefs: entry.styleRefs.map((path) => byName.get(fileName(path))) } : null);
  const usage = new Map();
  // Plain photos already made stay (up to the cap) even when fewer positions need a plain photo now: they still fill
  // positions about the page as a whole and spread reuse.
  // A section's own photo (intent) is no plain photo of its class.
  const made = (category, kind) => [...kept.values()].filter((entry) => entry.category === category && entry.kind === kind && !entry.topic && !entry.intent && ['generated', 'approved'].includes(entry.status)).length;
  // A class's cap bounds the library, never below what one page shows of it (a photo never repeats on a page, so a cap
  // under that left image slots empty: the hotel site's about page had eight process cards for three process photos;
  // owner 2026-11-12: no slot stays empty, a stand-in is made). Heroes are one a page: the general pages take turns.
  // The site-wide heroes are enough for each to open HERO_MAX_PAGES pages at most (A-10): the pages beyond the cap's
  // share ask for heroes of their own.
  // The positions the library leaves empty on a built page ask for photos besides the ones made.
  const gapsOnPage = new Map();
  for (const gap of gaps) { const key = `${gap.route}|${gap.category}|${gap.kind}`; gapsOnPage.set(key, (gapsOnPage.get(key) ?? 0) + 1); }
  for (const [key, count] of gapsOnPage) {
    const [, category, kind] = key.split('|');
    demand[category] ||= Object.fromEntries([...MEDIA_KINDS, 'hero'].map((name) => [name, 0]));
    if (kind in demand[category]) demand[category][kind] = Math.max(demand[category][kind], made(category, kind) + count);
  }
  const cap = (category, kind) => {
    const given = (category === GENERAL ? briefs.generalCaps?.[kind] : undefined) ?? briefs.caps[kind];
    if (kind === 'hero') return category === GENERAL ? Math.max(given, Math.ceil(demand[category].hero / HERO_MAX_PAGES)) : given;
    return Math.max(given, demand[category][kind]);
  };
  const kindCount = (category, kind) => Math.min(cap(category, kind), Math.max(demand[category][kind], made(category, kind)));
  const kinds = ['hero', ...MEDIA_KINDS].filter((name) => !placeholders.includes(name));
  const kindTotals = Object.fromEntries(kinds.map((kind) => [kind, Object.keys(demand).reduce((sum, category) => sum + kindCount(category, kind), 0)]));
  // A product, worn or on its own, is never staged in the reference's factory or warehouse scene
  // (the site's other reference photos when the class has only such scenes; never a generated factory).
  const staged = (list) => list.filter((ref) => !isProductionScene(ref, briefs.productionSceneWords));
  // What a class's plain photos show. On a service site every one is of the online-service class (a de-identified
  // report, a working screen, a delivered file; owner 2026-11-17: no more generic scenes on a service site, which
  // replaces 0a455cd's every other photo): a site's own subjects (site.json imageSubjects) that are generic scenes (a
  // lobby, a facade, guests arriving) are left out, and a class left with none takes the trade's. A class left with
  // fewer of its own than the photos it plans site-wide is topped up with the trade's (site14 2026-11-17: one of its
  // four hero subjects was of the class, so the three heroes sent back as look-alikes, and the category heroes, were
  // all planned on that one subject, the subject of the hero they had been sent back for looking like).
  const classSubjects = (kind) => {
    const list = briefs.subjects[kind] ?? [];
    if (briefs.photoClasses?.default !== 'service') return list;
    const own = list.filter((subject) => photoClassOf({ kind, subject }, briefs) === 'service');
    if (!own.length) return briefs.tradeSubjects?.[kind] ?? list;
    return own.length >= (kindTotals[kind] ?? 0) ? own : [...own, ...(briefs.tradeSubjects?.[kind] ?? []).filter((subject) => !own.includes(subject))];
  };
  const slots = [];
  for (const [order, [category]] of Object.entries(demand).entries()) {
    const subjectName = nameOf(category);
    const plainName = category === GENERAL || isThemeCategory(category) ? subjectName : category;
    const theme = categoryTheme.get(category) ?? null;
    for (const kind of kinds) {
      const classPool = styleRefs[kind]?.length ? styleRefs[kind] : allRefs;
      const pool = !PERSON_KINDS.includes(kind) ? classPool : staged(classPool).length ? staged(classPool) : staged(allRefs).length ? staged(allRefs) : classPool;
      // Scenes: each photo of a class follows a scene no other photo of that class follows yet. A class with fewer
      // references than the photos it needs site-wide borrows the site's other references as scenes (its own first),
      // so four heroes do not repeat one scene. A process photo borrows production scenes only (site10's sewing-floor
      // stand-ins were planned on beach and bikini references).
      const borrowable = kind === 'process' ? allRefs.filter((ref) => isProductionScene(ref, briefs.productionSceneWords)) : PERSON_KINDS.includes(kind) ? staged(allRefs) : allRefs;
      const extra = borrowable.filter((ref) => !pool.some((own) => own.path === ref.path));
      const scenePool = pool.length < kindTotals[kind] ? [...pool, ...extra] : pool;
      // An item nobody wears is planned as itself, never "a model wearing packaging" (aloha 2026-11-18, claude-seo audit 3
      // M-17: the packaging page's lifestyle photos, planned so, came out as boxes and bags in a pool and on grass).
      // A service trade's photos are its work and its deliverables already (classSubjects): nobody wears anything there, and
      // its own subjects stand (RateHarbor 2026-11-18: every photo had become "the handover pack of a finished job").
      const itemOnly = briefs.photoClasses?.default !== 'service' && new Set(notWorn).has(category) && PERSON_KINDS.includes(kind) && kind !== 'portrait' && briefs.itemSubjects;
      const subjects = itemOnly ? briefs.itemSubjects[kind] ?? briefs.itemSubjects.product : classSubjects(kind);
      // A product under a children's menu item is one for children whatever its own name (page-theme.mjs).
      const productOnly = PERSON_KINDS.includes(kind) && (forChildren(category, briefs) || theme?.id === CHILDREN_THEME);
      // Who wears it and where, as the page's theme says (M-13): a photo of a model on a themed page.
      const modelled = PERSON_KINDS.includes(kind) && kind !== 'portrait' && !productOnly;
      const themed = { theme, ...(modelled && theme?.wearer ? { wearer: theme.wearer } : {}), ...(modelled && theme?.placeWords ? { placeWords: theme.placeWords } : {}) };
      for (let index = 0; index < kindCount(category, kind); index += 1) {
        // Categories start at different subjects so the same slot on two product pages is not the same picture.
        const subject = subjects[(index + order) % subjects.length].replaceAll('{category}', subjectName);
        slots.push({ id: `${slug(category)}-${kind}-${index + 1}`, category, kind, index, subjectName, pool, scenePool, subject, productOnly, ...themed, variety: slots.length });
        // A competitor that shows a portrait hero on phones (components.phoneHeroes): each hero gets its portrait
        // twin, the same subject, which phones show instead (library-media.mjs).
        if (kind === 'hero' && components.phoneHeroes) slots.push({ ...slots.at(-1), id: `${slots.at(-1).id}-phone`, phoneOf: slots.at(-1).id, variety: slots.length });
      }
      // One photo per section or card topic, named after it (stable while the topic stays): the product shown the way
      // that section talks about it. A reworded heading keeps the photo made for the old wording when most of its words
      // are the same (the photo still shows what the section says), so a copy revision does not remake the library.
      const made = (previous?.entries ?? []).filter((entry) => entry.category === category && entry.kind === kind && entry.topic && ['generated', 'approved'].includes(entry.status));
      const claimed = new Set();
      const similar = (left, right) => { const a = topicWords(left); const b = topicWords(right); const shared = [...a].filter((word) => b.has(word)).length; return shared / Math.max(1, new Set([...a, ...b]).size); };
      for (const wanted of [...(topics[category]?.[kind]?.values() ?? [])].slice(0, briefs.topicCaps?.[kind] ?? 0)) {
        const same = made.find((entry) => entry.topic === wanted);
        // A reworded heading keeps its photo; a portrait is one person's and is never passed to another.
        const close = same ?? (SITE_WIDE_KINDS.includes(kind) ? null : made.filter((entry) => !claimed.has(entry.id)).map((entry) => ({ entry, score: similar(entry.topic, wanted) })).filter((item) => item.score >= 0.5).sort((left, right) => right.score - left.score)[0]?.entry);
        const topic = close && !claimed.has(close.id) ? close.topic : wanted;
        if (close) claimed.add(close.id);
        // A trade whose photos are scenes says how a section's topic is shown (briefs.topicSubject).
        const subjectFor = (name) => (kind === 'portrait' ? `a head-and-shoulders portrait of the client quoted as "${topic}"` : briefs.topicSubject ? briefs.topicSubject.replaceAll('{category}', name).replaceAll('{topic}', topic) : `${name}, photographed for the page section "${topic}"`);
        // plainSubject: the subject before the theme named the product, which a photo made then still answers when it
        // shows the theme (fitsTheme), so naming the theme alone remakes no photo.
        slots.push({ id: `${slug(category)}-${kind}-${slug(topic)}`, category, kind, index: kindCount(category, kind), topic, subjectName, pool, scenePool, subject: subjectFor(subjectName), plainSubject: subjectFor(plainName), productOnly, ...themed, variety: slots.length });
      }
    }
  }
  // A service page's own opening photo (serviceHeroes), with its phone twin where heroes have one.
  for (const [route, { category, intent }] of serviceHero) {
    const pool = styleRefs.hero?.length ? styleRefs.hero : allRefs;
    slots.push({ id: `${slug(route) || 'home'}-${SERVICE_HERO}`, category, kind: 'hero', index: 0, subjectName: category, pool, scenePool: pool, subject: intent.content, intent, productOnly: false, variety: slots.length });
    if (components.phoneHeroes) slots.push({ ...slots.at(-1), id: `${slots.at(-1).id}-phone`, phoneOf: slots.at(-1).id, variety: slots.length });
  }
  // A section's own photo: what it shows and where (its intent), on its class's references for the site's look.
  for (const request of asked) {
    const { kind, category } = request;
    const pool = styleRefs[kind]?.length ? styleRefs[kind] : allRefs;
    const { key, id: visualId, content, setting = null, caption = null, purpose = null, section = null } = request.intent;
    slots.push({ id: `${slug(request.route) || 'home'}-${slug(visualId)}`, category, kind, index: 0, subjectName: category === GENERAL ? line : category, pool, scenePool: pool, subject: content, intent: { key, route: request.route, id: visualId, content, setting, caption, purpose, section }, productOnly: false, variety: slots.length });
  }
  // One slot per id: two headings that slug alike ask for one photo.
  const seenIds = new Set();
  for (let index = slots.length - 1; index >= 0; index -= 1) if (seenIds.has(slots[index].id)) slots.splice(index, 1); else seenIds.add(slots[index].id);
  // First the photos already made: one stays while its subject is unchanged and its references still exist, unless
  // an earlier photo of its class already follows its scene and the class has as many scenes as photos (then it is
  // planned again on an unused one; with more photos than scenes, a shared scene cannot be avoided and is kept).
  const sceneUses = Object.fromEntries(kinds.map((kind) => [kind, new Map()]));
  const count = (map, path) => map.set(path, (map.get(path) ?? 0) + 1);
  const keep = new Map();
  const slotsOfKind = slots.reduce((counts, slot) => ({ ...counts, [slot.kind]: (counts[slot.kind] ?? 0) + 1 }), {});
  for (const slot of slots) {
    const found = kept.get(slot.id);
    const scenes = sceneUses[slot.kind];
    // A plain photo's subject only rotates for variety (it shifts with the order of the site's categories), so a photo
    // made for the same position stays; a topic photo stays while its topic (its section or person) is the same, the
    // wording of the trade's subjects aside (its id names its category, class and topic).
    // A photo of a product for children made on a person is made again without one.
    // A section's own photo stays while what it asks for is the same.
    // A photo of a model on a themed page stays while its alt shows the theme's audience and place (page-theme.mjs
    // fitsTheme: site13's boardshorts hero, a woman, is made again; its man in boardshorts stays).
    // A photo made before its class was planned (a service site's generic scene of 2026-11-17 and before) stays: a new
    // rule for what photos show plans the photos still to be made, never the library again (owner 2026-11-17: the
    // libraries made again after the four-site audit, RateHarbor's 20 and MotelPilot's 30). replaceScenes (plan-images
    // --replace-scenes) plans such scenes again, the owner's decision; the remake cap still holds them for a go-ahead.
    const modelled = PERSON_KINDS.includes(slot.kind) && slot.kind !== 'portrait';
    if (!['generated', 'approved'].includes(found?.status) || (found.topic ?? null) !== (slot.topic ?? null) || (slot.productOnly && !found.productOnly) || !sameIntent(found.intent, slot.intent)
      || !fitsTheme(found, slot.theme, briefs, { person: modelled }) || (replaceScenes && photoClassOf(found, briefs) === 'scene')) continue;
    const before = withCurrentRefs(found);
    if (!before) continue;
    if (scenes.has(before.styleRefs[0]) && slotsOfKind[slot.kind] <= slot.scenePool.length && slot.scenePool.some((ref) => !scenes.has(ref.path))) continue;
    count(scenes, before.styleRefs[0]);
    for (const path of before.styleRefs) count(usage, path);
    // A section's own photo goes with its page's category.
    keep.set(slot.id, slot.intent ? { ...before, category: slot.category } : before);
  }
  const attributes = { garmentColours: briefs.garmentColours, casting: briefs.casting };
  const entries = [];
  for (const slot of slots) {
    if (keep.has(slot.id)) { entries.push(keep.get(slot.id)); continue; }
    const { id, category, kind, index, subjectName, pool, scenePool, subject, variety, topic = null, intent = null } = slot;
    const scenes = sceneUses[kind];
    const before = withCurrentRefs(kept.get(id)) ?? kept.get(id);
    // A photo not yet made (planned, failed) keeps its record while its subject and references hold and its scene is
    // still one its class may follow (a plan made before a scene rule keeps nothing of it).
    if (before && ['planned', 'failed'].includes(before.status) && before.subject === subject && (before.topic ?? null) === topic && sameIntent(before.intent, intent) && withCurrentRefs(before) && scenePool.some((ref) => ref.path === before.styleRefs[0]) && (!slot.productOnly || before.productOnly)
      && (before.wearer ?? null) === (before.productOnly ? null : slot.wearer ?? null) && sameIntent(before.placeWords, before.productOnly ? undefined : slot.placeWords)) {
      count(scenes, before.styleRefs[0]);
      for (const path of before.styleRefs) count(usage, path);
      entries.push(before);
      continue;
    }
    // A photo sent back (look-alike, review, near-copy of a reference) is planned again on a scene it has not tried,
    // with the next colour, model and shot (and, shown without a person, the next product-only subject).
    const retry = before && REJECTED_STATUSES.includes(before.status) ? before : null;
    const tried = new Set(retry ? [...(retry.triedScenes || []), retry.styleRefs?.[0]].filter(Boolean) : []);
    const untried = scenePool.filter((ref) => !tried.has(ref.path));
    const wanted = words(subjectName);
    const relevance = (ref) => [...words(ref.subject)].filter((word) => wanted.has(word)).length;
    const scene = (untried.length ? untried : scenePool).map((ref) => ({ ref, position: scenePool.indexOf(ref) }))
      .sort((left, right) => (scenes.get(left.ref.path) ?? 0) - (scenes.get(right.ref.path) ?? 0)
        || Number(right.position < pool.length) - Number(left.position < pool.length)
        || relevance(right.ref) - relevance(left.ref) || left.position - right.position)[0]?.ref;
    if (scene) { count(scenes, scene.path); count(usage, scene.path); }
    const refs = scene ? [scene, ...pickReferences(pool.filter((ref) => ref.path !== scene.path && !tried.has(ref.path)), subjectName, usage, 1)] : [];
    // Variety across the library: each photo gets its own product colour and, when a person is shown, its own model,
    // so a site is not the same three colours on the same face (framing and pose come from the reference's shot list
    // when the photo is made: generate-images.mjs).
    const colours = briefs.garmentColours || [];
    const castings = briefs.casting || [];
    // Shown without a person: a product for children, or a photo the image model would only make that way.
    const productOnly = slot.productOnly || Boolean(before?.productOnly);
    const onPerson = PERSON_KINDS.includes(kind) && !productOnly;
    const look = kind === 'portrait' ? { colour: null, casting: null } : retry && !(slot.productOnly && !retry.productOnly) ? rotateVariety(retry, attributes) : {
      colour: colours.length ? colours[variety % colours.length] : null,
      // Stepped so every model of the list comes round (stepped by 3, a list of 12 gave four models only).
      casting: onPerson && castings.length ? takeTurn(castings, variety, 3) : null,
    };
    const { colour, casting } = look;
    entries.push({
      id, category, kind, index: index + 1,
      size: slot.phoneOf ? briefs.sizes['hero-phone'] ?? '1024x1536' : briefs.sizes[kind],
      ...(slot.phoneOf ? { phoneOf: slot.phoneOf } : {}),
      subject,
      ...(topic ? { topic } : {}),
      ...(intent ? { intent } : {}),
      ...(colour ? { colour } : {}),
      ...(casting ? { casting } : {}),
      ...(productOnly ? { productOnly: true } : {}),
      // Who wears it and where its place is (the page's theme), never on a product shown on its own.
      ...(slot.wearer && !productOnly ? { wearer: slot.wearer } : {}),
      ...(slot.placeWords && !productOnly ? { placeWords: slot.placeWords } : {}),
      scene: refs[0]?.subject ?? '',
      styleRefs: refs.map((ref) => ref.path),
      // The brief names reference files by name, so moving the workspace does not change it.
      brief: [subject, topic, colour, casting, ...refs.map((ref) => fileName(ref.path))].filter(Boolean).join(' | '),
      // How often the image-fit judge sent it back (send-back-misfits.mjs) goes with it, so it is sent back once only.
      ...(retry ? { triedScenes: [...tried], shotShift: (retry.shotShift ?? 0) + SHOT_JUMP, ...(retry.productOnly ? { productOnly: true, subjectShift: (retry.subjectShift ?? 0) + 1 } : {}), ...(retry.fitRemakes ? { fitRemakes: retry.fitRemakes } : {}) } : {}),
      status: 'planned',
    });
  }
  // A generated image the plan no longer uses stays in the register as retired (its record and master are kept).
  const planned = new Set(entries.map((entry) => entry.id));
  const retired = (previous?.entries || []).filter((entry) => !planned.has(entry.id) && (entry.master || entry.status === 'retired')).map((entry) => ({ ...entry, status: 'retired' }));
  // Each photo's class, decided here before any photo is made (lib/photo-class.mjs): what the text check, the samples
  // and the handoff's 必须实拍替换 list read.
  const classed = entries.map((entry) => ({ ...entry, photoClass: photoClassOf(entry, briefs) }));
  return { schemaVersion: IMAGE_PLAN_SCHEMA, line, ...(briefs.trade && briefs.trade !== 'apparel' ? { trade: briefs.trade } : {}), siteKind: briefs.siteKind, productOnlySubjects: briefs.productOnlySubjects, variety: attributes, routes, ...(Object.keys(themes).length ? { themes } : {}), ...(briefs.pagePhotos ? { pagePhotos: briefs.pagePhotos } : {}), placeholders, entries: [...classed, ...retired] };
}

// Statuses of a photo sent back to generation.
export const REJECTED_STATUSES = Object.freeze(['rejected-duplicate', 'rejected-review', 'rejected-near-copy']);

// A photo sent back as a look-alike gets the next colour, model and shot (or setting) instead of a "must differ" note
// (image models handle negative instructions poorly; concrete positive attributes are what diversifies them).
export function rotateVariety(entry, variety = {}) {
  const next = (list, value, step) => (list?.length && value ? list[(list.indexOf(value) + step) % list.length] : value);
  return { ...entry, colour: next(variety.garmentColours, entry.colour, 1), casting: next(variety.casting, entry.casting, 1), shotShift: (entry.shotShift ?? 0) + SHOT_JUMP, workerShift: (entry.workerShift ?? 0) + 1 };
}

// The positions the site's own library (components.media as applied) leaves empty when the pages are laid out with it:
// plain photos only (not a section's own photo, a portrait, nor a class left to the site's own photos).
export function libraryGaps({ pages, components, briefs, sitePhotos = [] }) {
  if (!components.media?.pools && !components.media?.routePools) return [];
  const built = new Set(pages.map((page) => page.route));
  const { unfilled } = allocateSite({ pages, components, sitePhotos, isBuilt: (href) => !href.startsWith('/') || built.has(href) });
  return unfilled.filter((item) => !item.intent && !(briefs.placeholderKinds ?? []).includes(item.kind) && MEDIA_KINDS.includes(item.kind)).map(({ route, kind, category }) => ({ route, kind, category }));
}
