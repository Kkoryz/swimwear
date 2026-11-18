// The site's data for the renderer, loaded once at build time: the pages (Site Factory, placeholders, the blog), the
// template variants and the optional site files (identity, runtime, contact, trust bar, own photos).
import { assertAuthoringPages, type BLOG_VARIANTS } from '../../scripts/lib/authoring-contract.mjs';
import { blogPages } from '../../scripts/lib/blog.mjs';
import { chatProblems } from '../../scripts/lib/chat-config.mjs';
import { withPhotoBriefs } from '../../scripts/lib/photo-briefs.mjs';
import { legalName } from '../../scripts/lib/legal-name.mjs';
import { copyStrings } from '../../scripts/lib/proof-consistency.mjs';
import { isIndexable } from '../../scripts/lib/seo-head.mjs';
import { sitePeople, withPostAuthors } from '../../scripts/lib/site-people.mjs';
import { isChartData } from '../../scripts/lib/visual-data.mjs';
import authoredData from '../data/authoring-pages.json';
import placeholderData from '../data/placeholder-pages.json';
import variantsData from '../data/template-variants.json';
import type { AuthoringPage, SectionVisual, SiteCompany, SiteContact, SiteIdentity, SitePhoto, SiteRuntime, SiteTrust, TeamMember, TemplateVariants } from './types';

// An optional data file (import.meta.glob of its literal path, eager): its content, or the fallback without one.
const optional = <T>(modules: Record<string, { default: T }>, fallback: T) => Object.values(modules)[0]?.default ?? fallback;

// The blog's posts and copy (optional files; without posts there is no blog).
const blogPostData = optional<unknown[]>(import.meta.glob('../data/blog-posts.json', { eager: true }), []);
export const blogData = optional<unknown>(import.meta.glob('../data/blog.json', { eager: true }), null);
// What each section's photo shows where Site Factory said nothing (src/data/photo-briefs.json, plan-photo-briefs.mjs:
// a trade that plans its photos from the page copy), laid on the sections as the image plan has them.
const photoBriefs = optional<Record<string, Record<string, unknown[]>> | null>(import.meta.glob('../data/photo-briefs.json', { eager: true }), null);
// A post signed by the company is signed by the team's writer when the about page names one (lib/site-people.mjs).
export const pages = assertAuthoringPages(withPhotoBriefs(withPostAuthors([...authoredData, ...placeholderData, ...blogPages(blogPostData, blogData)]), photoBriefs)) as AuthoringPage[];
// The people the about page's team section names, each with the link to their place on it (none: null).
export const people = sitePeople(pages) as { route: string; people: (TeamMember & { href: string })[] } | null;
export const builtRoutes = new Set(pages.map((page) => page.route));

export const variants = variantsData.components as unknown as TemplateVariants;
// The blog's design from the reference blog (hub header and cards, post layout); a site without it gets the plainest.
type Blog = typeof BLOG_VARIANTS;
export const blogVariants = { hub: { header: 'plain', card: 'wide', ...variants.blog?.hub }, post: { layout: 'narrow', ...variants.blog?.post } } as { hub: { header: Blog['hub']['header'][number]; card: Blog['hub']['card'][number] }; post: { layout: Blog['post']['layout'][number] } };

// Site identity (src/data/site-identity.json: stage 00's brand via import-brand-kit, or the build-brand-kit fallback).
// Optional: without it the shell shows a marked brand placeholder.
export const siteIdentity = optional<SiteIdentity | null>(import.meta.glob('../data/site-identity.json', { eager: true }), null);

// Site runtime (src/data/site-runtime.json, optional): per-site services such as analytics. Umami is first-party and
// cookieless; its script is loaded only when configured. `chat`: the corner launcher (scripts/lib/chat-config.mjs).
export const siteRuntime = optional<SiteRuntime | null>(import.meta.glob('../data/site-runtime.json', { eager: true }), null);

// The name the footer's copyright line states (scripts/lib/legal-name.mjs): the site's name; the company's legal name is
// not shown for now (owner 2026-11-17), so the company record is not passed.
export const siteLegalName = legalName({ identity: siteIdentity });

// The owner's proof (src/data/site-proof.json, optional): the privacy facts the privacy page's module states.
export const siteProof = optional<{ standIn?: boolean; privacy?: { retention?: string | null; contact?: string | null } } | null>(import.meta.glob('../data/site-proof.json', { eager: true }), null);

// When each page's content last changed (src/data/page-dates.json, pnpm page-dates, run by the importer): the sitemap's
// lastmod and a content page's "Last updated".
export const pageDates = optional<Record<string, { hash: string; modified: string }> | null>(import.meta.glob('../data/page-dates.json', { eager: true }), null);

// The company's contact details (src/data/site-contact.json, from Site Factory's package). placeholder: true until the
// owner replaces them (shown, marked and stated in the structured data; the launch preflight holds).
export const siteContact = optional<SiteContact | null>(import.meta.glob('../data/site-contact.json', { eager: true }), null);
// The company behind the site (src/data/site-company.json, scaffold-site-company.mjs and lib/site-company.mjs): legal
// name and form, address, founding date, service area, profiles; the Organization and Service markup, the footer's legal
// line and the privacy page read it. Its standIns hold the launch until the owner replaces them.
const companyRecord = optional<SiteCompany | null>(import.meta.glob('../data/site-company.json', { eager: true }), null);
// The founding year goes into the markup only where a page states it (site12 claude-seo audit 2026-11-17, S-1: "2016" in
// the Organization, no page saying so): structured data states what the pages show.
const shownText = pages.flatMap((page) => copyStrings({ hero: page.hero, blocks: page.blocks })).join('\n');
const foundedYear = String(companyRecord?.foundingDate ?? '').match(/\d{4}/)?.[0];
export const siteCompany = companyRecord && foundedYear && !shownText.includes(foundedYear) ? { ...companyRecord, foundingDate: undefined } : companyRecord;
// The site-wide trust bar (src/data/site-trust.json, lib/site-trust.mjs): the company's size facts from Site Factory.
export const siteTrust = optional<SiteTrust | null>(import.meta.glob('../data/site-trust.json', { eager: true }), null);
// Each page's own figures for that band (src/data/page-figures.json, derive-page-figures.mjs): route -> figures.
// The reference blog's article rhythm (src/data/article-rhythm.json, measure-reference-article.mjs): the article
// text's CSS custom properties (line height, gaps, characters per line); without it the template's defaults.
const articleRhythm = optional<{ vars?: Record<string, string> } | null>(import.meta.glob('../data/article-rhythm.json', { eager: true }), null);
export const articleRhythmStyle = articleRhythm?.vars ? Object.entries(articleRhythm.vars).filter(([name]) => name.startsWith('--article-')).map(([name, value]) => `${name}: ${value}`).join('; ') : undefined;
export const pageFigures = optional<Record<string, { value: string; label: string }[]> | null>(import.meta.glob('../data/page-figures.json', { eager: true }), null);

// A chat channel that cannot work (a malformed number, no https) fails the build instead of rendering a dead link.
const chatErrors = siteRuntime?.chat ? chatProblems(siteRuntime.chat) : [];
if (chatErrors.length) throw new Error(`Invalid chat in src/data/site-runtime.json:\n${chatErrors.join('\n')}`);

// The site's own photos (src/data/site-media.json via import-site-media, optional): they fill the placeholder classes.
export const sitePhotos = optional<{ photos: SitePhoto[] }>(import.meta.glob('../data/site-media.json', { eager: true }), { photos: [] }).photos;

// Phone crops of the photos in the frames that follow the competitor's phone shape (src/data/phone-heroes.json via
// derive-phone-heroes, optional): frame (hero, cta) -> page type -> ratio, and photo src -> ratio -> crop.
type PhoneCrop = { src: string; width: number; height: number };
// Each photo's subject as fractions of its width and height (src/data/photo-focus.json, judged by the photo-focus step):
// a frame that cuts the photo puts that point where it sits in the photo (object-position), so the cut keeps it.
const photoFocus = optional<Record<string, { x: number; y: number }>>(import.meta.glob('../data/photo-focus.json', { eager: true }), {});
export const focusStyle = (src?: string) => { const point = src ? photoFocus[src] : undefined; return point ? `object-position: ${Math.round(point.x * 100)}% ${Math.round(point.y * 100)}%` : undefined; };
export const phoneHeroes = optional<{ frames?: Partial<Record<'hero' | 'cta', { byPageType: Record<string, number> }>>; crops: Record<string, Record<string, PhoneCrop>> }>(import.meta.glob('../data/phone-heroes.json', { eager: true }), { crops: {} });

// A section's data visuals (Site Factory's visuals of type data) drawn as charts (SectionChart.astro); its steps in
// order are the site's process module after it instead (lib/media-slots.mjs withSectionVisuals), and its specs stay
// in its text (lib/visual-data.mjs isChartData).
export const dataVisuals = (block: { visuals?: SectionVisual[] }) => (block.visuals ?? []).filter((visual): visual is Extract<SectionVisual, { type: 'data' }> => visual.type === 'data' && isChartData(visual.data));

// A link to a place on a page (a person's profile on the about page: /about/#team-...) is built when its page is.
export const isBuilt = (href: string) => !href.startsWith('/') || builtRoutes.has(href.split('#')[0]);
// A page a card or a related link sends visitors to: built and indexable (site13 blind audit 2026-11-17 H-4: the home
// page's related links named the blog hub held as noindex while it has no post).
const indexableRoutes = new Set(pages.filter((page) => isIndexable(page)).map((page) => page.route));
export const isLinkable = (href: string) => !href.startsWith('/') || indexableRoutes.has(href.split('#')[0]);
