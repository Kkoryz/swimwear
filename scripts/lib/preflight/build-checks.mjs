// Preflight checks on the release build: competitor files, placeholder and AI photos, alt text, the LCP image.
import { pageAltProblems } from '../alt-text.mjs';
import { decode, isDecorative, parsePage } from '../built-site.mjs';
import { LEGACY_LIBRARY_PATH, LIBRARY_PATH, REFERENCE_PATHS } from '../release-guard.mjs';
import { REVIEW_SIGNOFF, reviewMarkup } from '../review-markup.mjs';
import { isIndexable } from '../seo-head.mjs';
import { acrossPages, builtPages, found, planBySrc, routesWhere } from './findings.mjs';

// Largest eagerly loaded (above-the-fold) image in bytes: a budget for LCP on mobile connections.
const LCP_IMAGE_BYTES = 350 * 1024;
// Words the template writes only where content is missing (the placeholder badge, a placeholder post's copy).
const PLACEHOLDER_TEXT = /\[Placeholder\]|Placeholder copy/i;
// Chinese, Japanese or Korean script: on a page in another language, text left untranslated (site10's alt text).
const CJK = /[぀-ヿ㐀-鿿豈-﫿가-힯]+/;
const inCjkLanguage = (lang) => /^(zh|ja|ko)\b/i.test(lang ?? '');
const around = (text) => { const match = text.match(CJK); return match ? text.slice(Math.max(0, match.index - 12), match.index + match[0].length + 12).trim() : ''; };
// What a visitor reads on the page: its body's text, scripts and styles left out.
const visibleText = (html) => decode((html.match(/<body\b[\s\S]*<\/body>/)?.[0] ?? html).replace(/<(script|style)\b[\s\S]*?<\/\1>/g, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ');
const routeFile = (route) => (route === '/' ? 'index.html' : `${route.replace(/^\/|\/$/g, '')}/index.html`);

export const BUILD_CHECKS = [
  // The built pages: competitor files and placeholder photos, image slots, AI images, forms, links, LCP image.
  { code: 'not_built', level: 'hold', run: (ctx) => !ctx.hasDist && { detail: 'run pnpm build:release first' } },
  { code: 'reference_asset_present', level: 'hold', run: (ctx) => found('competitor files are in dist (use pnpm build:release)', REFERENCE_PATHS.filter((path) => ctx.distStat(path))) },
  { code: 'page_not_built', level: 'hold', run: (ctx) => ctx.hasDist && found('pages of the site with no built file (rebuild with pnpm build:release)', ctx.pages.filter((page) => !ctx.built.get(page.route)).map((page) => page.route)) },
  // A page the site plan only names (a menu heading, nav_only) or holds back (withheld) is never built.
  { code: 'undelivered_page_built', level: 'hold', run: (ctx) => found('pages the site plan does not deliver (nav_only, withheld) are built', (ctx.sitePlan?.pages ?? []).filter((row) => (row.nav_only || row.withheld) && ctx.distStat(routeFile(row.url))).map((row) => row.url)) },
  // Placeholder words on a page that is not a placeholder page (those are held by placeholder_page_present).
  { code: 'placeholder_text_present', level: 'hold', run: (ctx) => found('placeholder text on pages that are not placeholder pages', routesWhere(ctx, (html, page) => page.status !== 'placeholder' && PLACEHOLDER_TEXT.test(visibleText(html)))) },
  // Text and alt text in the page's language (html lang): no Chinese, Japanese or Korean on a page in another one.
  { code: 'text_not_in_page_language', level: 'hold', run: (ctx) => found('text or alt text in another script than the page language (html lang)', builtPages(ctx).flatMap(([page, html]) => {
    const parsed = parsePage(html);
    if (inCjkLanguage(parsed.lang)) return [];
    return [
      ...[['title', parsed.title ?? ''], ['description', parsed.description ?? ''], ['text', visibleText(html)]].filter(([, text]) => CJK.test(text)).map(([where, text]) => `${page.route} ${where}: ${around(text)}`),
      ...parsed.images.filter((image) => CJK.test(image.alt ?? '')).map((image) => `${page.route} alt ${image.src?.split('/').at(-1)}: ${around(image.alt)}`),
    ];
  })) },
  // A photo judged not to show its page's subject (judge-image-fit.mjs) never ships.
  { code: 'image_wrong_subject', level: 'hold', run: (ctx) => found('photos that do not show their page\'s subject (docs/research/image-fit.json)', (ctx.imageFit?.pages ?? []).flatMap((page) => page.images.filter((image) => image.fit === 'wrong_subject').map((image) => `${page.route} ${image.src.split('/').at(-1)}`))) },
  { code: 'image_register_missing', level: 'hold', run: (ctx) => !ctx.plan && found('generated photos in use but no docs/research/image-plan.json: their review and approval cannot be checked', routesWhere(ctx, (html) => html.includes(`/${LIBRARY_PATH}/`) || html.includes(`/${LEGACY_LIBRARY_PATH}/`))) },
  { code: 'reference_photo_in_use', level: 'hold', run: (ctx) => found('pages still show competitor placeholder photos', routesWhere(ctx, (html) => html.includes('/media/reference/'))) },
  // The pre-launch handoff (scripts/handoff.mjs) lists what the owner replaces before launch, factory, staff and client
  // photos included; the owner replaces them, so it is a reminder, not a hold (owner, 2026-10-24).
  { code: 'handoff_missing', level: 'notice', run: (ctx) => !ctx.handoff && { detail: 'no pre-launch handoff (docs/research/handoff.json): run pnpm handoff before launch' } },
  { code: 'image_slot_present', level: 'hold', run: (ctx) => found('indexable pages still show image slots (supply real or approved photos)', routesWhere(ctx, (html, page) => isIndexable(page) && html.includes('data-media-slot='))) },
  { code: 'image_not_approved', level: 'hold', run: (ctx) => {
    const bySrc = planBySrc(ctx);
    return found('AI images in use without review approval (pnpm approve:images)', acrossPages(ctx, (page) => page.images.map((image) => bySrc.get(image.src)).filter((entry) => entry && entry.review !== 'approved').map((entry) => `${entry.id} (${entry.review ?? entry.status})`)));
  } },
  { code: 'image_alt_missing', level: 'hold', run: (ctx) => {
    const bySrc = planBySrc(ctx);
    return found('AI images in use without alt text', acrossPages(ctx, (page) => page.images.filter((image) => bySrc.has(image.src) && !(image.alt ?? '').trim() && !isDecorative(image)).map((image) => bySrc.get(image.src).id)));
  } },
  // Alt text of the images that ship (lib/alt-text.mjs): what the image shows, 10-125 characters, no "image of", no
  // claims, each once on its page, the page's main keyword in at most one.
  { code: 'image_alt_rules', level: 'hold', run: (ctx) => found('images whose alt text breaks the alt rules (lib/alt-text.mjs)', acrossPages(ctx, (parsed, page) => pageAltProblems(parsed.images.filter((image) => image.inMain).map((image) => ({ src: image.src, alt: image.alt, decorative: isDecorative(image) })), { keyword: ctx.keywords?.get(page.route) }).map(({ src, problem }) => `${page.route} ${src.split('/').at(-1)}: ${problem}`))) },
  // Image library diversity (check:image-diversity). A library less diverse than the reference's is the owner's call
  // from the contact sheet (look-alikes are sent back).
  { code: 'image_library_less_diverse_than_reference', level: 'notice', run: (ctx) => ctx.diversity && ctx.diversity.vendi < ctx.diversity.minVendi && { detail: `Vendi ${ctx.diversity.vendi} below ${ctx.diversity.minVendi} for ${ctx.diversity.photos} photos` } },
  // Reviews and ratings in the shipped structured data the owner has not confirmed as from real buyers (sign-off
  // review-source), whether or not Site Factory marked them placeholders.
  { code: 'review_markup_unconfirmed', level: 'hold', run: (ctx) => {
    const confirmed = (ctx.signoff?.items || []).some((entry) => entry.id === REVIEW_SIGNOFF && entry.status === 'confirmed');
    return !confirmed && found(`review or rating markup the owner has not confirmed as from real buyers (pnpm signoff --confirm ${REVIEW_SIGNOFF})`, acrossPages(ctx, (parsed, page) => parsed.jsonLd.flatMap((block) => reviewMarkup(block.data)).map((where) => `${page.route} ${where}`)));
  } },
  { code: 'lcp_image_over_budget', level: 'hold', run: (ctx) => found(`eager images above ${LCP_IMAGE_BYTES / 1024} KB`, acrossPages(ctx, (page) => page.images.filter((image) => image.src?.startsWith('/') && image.loading === 'eager').map((image) => [image.src, ctx.distStat(image.src.slice(1))?.size ?? 0]).filter(([, bytes]) => bytes > LCP_IMAGE_BYTES).map(([src, bytes]) => `${src} ${Math.round(bytes / 1024)} KB`))) },
];
