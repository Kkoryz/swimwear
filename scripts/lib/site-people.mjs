// The site's named people (four-site audit 2026-11-17: no named person anywhere, E-E-A-T 45-55; claude-seo
// seo-content "Who created it?": a visible byline and an author bio page). They are the owner's data, the team group of
// src/data/site-proof.json (stand-ins made per site until the owner gives real ones, listed for sign-off); the about
// page shows them as its team section (lib/site-proof.mjs proofBlock), and that section is the one place the rest
// reads them from: each person's anchor on it is their profile, a post's author links there, and their Person
// structured data (claude-seo seo-geo: Person schema for authors) names them with their role and the company. Without
// people nothing renders.

export const TEAM_HEADING = 'Meet the team';

const slug = (text) => text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
// A person's anchor on the team section, from their name.
export const personAnchor = (name) => `team-${slug(name)}`;

// The team section's items from the proof's team: name, role, years of experience, what they do, the blog's writer.
export function teamItems(team = []) {
  return team.filter((person) => person?.name?.trim() && person?.role?.trim()).map((person) => ({
    anchor: personAnchor(person.name),
    name: person.name.trim(),
    role: person.role.trim(),
    ...(Number.isInteger(person.years) && person.years > 0 ? { years: person.years } : {}),
    ...(person.bio?.trim() ? { bio: person.bio.trim() } : {}),
    ...(person.blogAuthor ? { blogAuthor: true } : {}),
    ...(Array.isArray(person.reviews) && person.reviews.length ? { reviews: person.reviews.filter((type) => typeof type === 'string') } : {}),
  }));
}

// The page types a person of the team reviews (four-site audit 2026-11-17, C10/G6; claude-seo seo-content "Who created
// it?", seo-geo "Author byline with credentials"): a product or service page names the person responsible for its
// subject, "Reviewed by", linked to their place on the team section, and its page node states them as reviewedBy. The
// person's `reviews` (src/data/site-proof.json team; a stand-in takes its role's from the trade's config/demo-proof
// team) names the page types; a page type nobody reviews names no one (no reviewer is guessed). The same list as
// lib/seo-head.mjs SERVICE_PAGE_TYPES (a test keeps them one).
export const REVIEWED_PAGE_TYPES = Object.freeze(['product_manufacturer', 'product_wholesale', 'solution', 'service', 'place', 'location']);
/** @param {any} page @param {{ people: any[] } | null} team sitePeople's */
// A page whose subject is a person's job (its address names every longer word of their role: /quality-control/ and the
// "Quality control lead", /product-development/ and the "Head of development") is theirs, whatever its page type
// (aloha claude-seo audit 2026-11-18, L-13: one person signed all 39 product and service pages, the shipping and the
// quality pages among them).
const ROLE_WORD = 5;
const roleWords = (role) => String(role ?? '').toLowerCase().split(/[^a-z]+/).filter((word) => word.length >= ROLE_WORD);
const pageWords = (page) => new Set(String(page?.route ?? '').toLowerCase().split(/[^a-z]+/).filter(Boolean));
export function pageReviewer(page, team) {
  if (!team || !REVIEWED_PAGE_TYPES.includes(page?.pageType) || page.status === 'placeholder') return null;
  const words = pageWords(page);
  const ownJob = team.people.find((person) => { const role = roleWords(person.role); return role.length > 0 && role.every((word) => words.has(word)); });
  return ownJob ?? team.people.find((person) => person.reviews?.includes(page.pageType)) ?? null;
}

// The people the built pages show: the team section of the about page (else of any page), each with the link to their
// place on it. null without one.
export function sitePeople(pages = []) {
  const holder = (page) => (page.blocks ?? []).find((block) => block.type === 'team' && block.items?.length);
  const page = pages.find((item) => item.pageType === 'about' && holder(item)) ?? pages.find(holder);
  if (!page) return null;
  return { route: page.route, people: holder(page).items.map((person) => ({ ...person, href: `${page.route}#${person.anchor}` })) };
}

// "12 years' experience" under a person's role.
export const experience = (years) => (years ? `${years} ${years === 1 ? "year's" : "years'"} experience` : null);

// The blog's posts signed by a person of the team: a post that names one of them gets their role and profile link; a
// post signed by the company is signed by the team's writer (blogAuthor) when the site has one. Other posts as written.
export function withPostAuthors(pages) {
  const team = sitePeople(pages);
  if (!team) return pages;
  const writer = team.people.find((person) => person.blogAuthor) ?? null;
  return pages.map((page) => {
    if (page.pageType !== 'blog_post' || !page.article) return page;
    const { author } = page.article;
    const person = author?.type === 'Person' ? team.people.find((item) => item.name === author.name) : writer;
    if (!person) return page;
    return { ...page, article: { ...page.article, author: { type: 'Person', name: person.name, url: person.href, jobTitle: person.role, ...(person.bio ? { description: person.bio } : {}), ...(person.years ? { years: person.years } : {}) } } };
  });
}

// A person as structured data: their profile on the team section is their @id and url, the company their employer.
export function personSchema(person, { absolute, organization }) {
  return {
    '@type': 'Person',
    '@id': absolute(person.url),
    name: person.name,
    url: absolute(person.url),
    ...(person.jobTitle ? { jobTitle: person.jobTitle } : {}),
    ...(person.description ? { description: person.description } : {}),
    worksFor: { '@id': organization },
  };
}

// Person structured data for each person the page's team section shows.
export function teamSchemas(page, { absolute, organization }) {
  return (page.blocks ?? []).filter((block) => block.type === 'team').flatMap((block) => block.items).map((person) => ({
    '@context': 'https://schema.org',
    ...personSchema({ name: person.name, url: `${page.route}#${person.anchor}`, jobTitle: person.role, description: person.bio }, { absolute, organization }),
  }));
}
