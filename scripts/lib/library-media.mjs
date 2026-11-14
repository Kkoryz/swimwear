// The image library as the template's media (template-variants.json components.media, apply-image-library.mjs).

import { GENERAL } from './media-allocation.mjs';

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
  for (const entry of plan.entries.filter((item) => usable(item) && !item.phoneOf)) {
    const pools = (byCategory[entry.category] ||= {});
    (pools[entry.kind] ||= []).push(media(entry));
  }
  const { hero: generalHero = [], ...pools } = byCategory[GENERAL] || {};
  const routePools = {};
  const heroByRoute = {};
  let turn = 0;
  for (const [route, category] of Object.entries(plan.routes)) {
    const { hero = [], ...own } = byCategory[category] || {};
    if (category !== GENERAL && Object.keys(own).length) routePools[route] = own;
    const heroImage = category === GENERAL ? generalHero[turn++ % Math.max(1, generalHero.length)] : hero[0] ?? generalHero[0];
    if (heroImage) heroByRoute[route] = heroImage;
  }
  const { category, topic, ...hero } = generalHero[0] ?? {};
  return { pools, routePools, heroByRoute, routeCategories: plan.routes, hero: generalHero.length ? hero : null };
}
