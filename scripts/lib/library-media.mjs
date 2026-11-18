// The image library as the template's media (template-variants.json components.media, apply-image-library.mjs).

import { GENERAL, SERVICE_HERO, isThemeCategory } from './media-allocation.mjs';

// The width below which a hero's portrait twin replaces it (as apply-reference-analysis.mjs pairs the competitor's).
export const PHONE_MEDIA = '(max-width: 767px)';

// Template media from the library's usable photos (generated or approved, never retired or sent back): site-wide pools,
// each product route's own pools, a hero per route and the site-wide default hero.
export function libraryMedia(plan, usable = (entry) => entry.status === 'generated' || entry.status === 'approved') {
  // Each photo carries its category and, when it was made for one section, that section's topic (media-allocation).
  // A hero's portrait twin (phoneOf) is no photo of its own: phones show it in the hero's place (art direction).
  const phones = new Map(plan.entries.filter((entry) => entry.phoneOf && usable(entry)).map((entry) => [entry.phoneOf, entry]));
  const phoneSource = (entry) => { const phone = phones.get(entry.id); return phone ? { sources: [{ media: PHONE_MEDIA, src: phone.web.src, srcset: phone.web.srcset, width: phone.web.width, height: phone.web.height }] } : {}; };
  const media = (entry) => ({ src: entry.web.src, srcset: entry.web.srcset, width: entry.web.width, height: entry.web.height, alt: entry.alt, category: entry.category, ...(entry.topic ? { topic: entry.topic } : {}), ...(entry.intent ? { intent: entry.intent.key } : {}), ...phoneSource(entry) });
  const byCategory = {};
  // A page's own opening photo (an ask: serviceHeroes) is that page's alone, never a turn of the site-wide heroes.
  for (const entry of plan.entries.filter((item) => usable(item) && !item.phoneOf && !(item.kind === 'hero' && item.intent?.id === SERVICE_HERO))) {
    const pools = (byCategory[entry.category] ||= {});
    (pools[entry.kind] ||= []).push(media(entry));
  }
  const { hero: generalHero = [], ...pools } = byCategory[GENERAL] || {};
  // A theme's shared set (image-plan.mjs, page-theme.mjs), for the pages of that theme (routeThemes).
  const themePools = Object.fromEntries(Object.entries(byCategory).filter(([category]) => isThemeCategory(category)));
  // A service page's own opening photo (image-plan.mjs serviceHeroes), made as its hero's ask.
  const serviceHero = new Map(plan.entries.filter((entry) => usable(entry) && !entry.phoneOf && entry.kind === 'hero' && entry.intent?.id === SERVICE_HERO).map((entry) => [entry.intent.route, entry]));
  const routePools = {};
  const heroByRoute = {};
  // The home page's opening photo is the home's alone (owner 2026-11-18: the FAQ page and a city page opened on the home
  // page's photo; lib/usability-checks.mjs hero_shared): the other pages take the other site-wide heroes in turn, past
  // HERO_MAX_PAGES each if they must (the SEO audit's hero_reused warning, and the plan asks for more). With one
  // site-wide hero, or no home among the pages, the turns go round all.
  const homeOwn = plan.routes['/'] === GENERAL && !serviceHero.has('/') && generalHero.length > 1;
  let turn = 0;
  const nextGeneral = (route) => {
    if (!homeOwn) return generalHero[turn++ % Math.max(1, generalHero.length)];
    return route === '/' ? generalHero[0] : generalHero[1 + (turn++ % (generalHero.length - 1))];
  };
  for (const [route, category] of Object.entries(plan.routes)) {
    const { hero = [], ...own } = byCategory[category] || {};
    if (category !== GENERAL && Object.keys(own).length) routePools[route] = own;
    const { intent: _intent, ...asked } = serviceHero.has(route) ? media(serviceHero.get(route)) : {};
    const heroImage = serviceHero.has(route) ? asked : category === GENERAL ? nextGeneral(route) : hero[0] ?? generalHero[0];
    if (heroImage) heroByRoute[route] = heroImage;
  }
  const { category, topic, ...hero } = generalHero[0] ?? {};
  return { pools, ...(Object.keys(themePools).length ? { themePools } : {}), routePools, heroByRoute, routeCategories: plan.routes, ...(plan.themes ? { routeThemes: plan.themes } : {}), hero: generalHero.length ? hero : null };
}
