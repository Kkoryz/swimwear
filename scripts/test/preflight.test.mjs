import assert from 'node:assert/strict';
import test from 'node:test';

import { CHECKS, runChecks } from '../preflight.mjs';

const page = (route, extra = {}) => ({ route, pageType: 'product', status: 'authored', seo: { canonical: route }, ...extra });
const html = (body) => `<html lang="en"><head><title>T</title></head><body><main>${body}</main></body></html>`;
// A site ready for release: every check passes.
const context = (overrides = {}) => ({
  pages: [page('/'), page('/contact/', { pageType: 'contact' }), page('/privacy/')],
  built: new Map([['/', html('<img src="/media/generated/a-960.webp" alt="A leggings sample" loading="eager"><a href="/contact/">Contact</a>')], ['/contact/', html('<a href="mailto:sales@knitpace.com">Email</a>')], ['/privacy/', html('<p>Privacy</p>')]]),
  hasDist: true,
  distStat: (path) => ({ 'media/generated/a-960.webp': { size: 120 * 1024 } })[path] ?? null,
  identity: { siteName: 'Knit Pace', origin: 'https://knitpace.com', source: 'stage-00' },
  runtime: { site: { id: 'knitpace', status: 'active' }, chat: false, analytics: { scriptSrc: 'https://stats.knitpace.com/script.js', websiteId: 'w1' } },
  plan: { entries: [{ id: 'a', status: 'approved', review: 'approved', web: { srcset: '/media/generated/a-480.webp 480w, /media/generated/a-960.webp 960w' } }] },
  siteMedia: null,
  handoff: { realPhotos: [] },
  imported: { upstream: { codeVersion: 'abc123' }, skipped: [], pages: [] },
  signoff: { items: [] },
  diversity: null,
  form: { consent: { privacyRoute: '/privacy/' } },
  contact: null,
  redirects: [],
  crossSite: { threshold: 0.5, duplicates: [] },
  drift: [],
  nginx: { configs: ['knitpace.com.conf', 'knitpace.com-headers.conf'], own: 'server {\n  root /srv/knitpace/current;\n}' },
  seoAuditError: null,
  ...overrides,
});
const run = (code, ctx) => runChecks(ctx, CHECKS.filter((check) => check.code === code));
const holds = (code, ctx) => run(code, ctx).holds;

test('a ready site has no holds and no notices', () => {
  assert.deepEqual(runChecks(context()), { holds: [], notices: [] });
});

test('every check has a code and a level, and codes are unique', () => {
  assert.ok(CHECKS.every((check) => check.code && ['hold', 'notice'].includes(check.level) && typeof check.run === 'function'));
  assert.equal(new Set(CHECKS.map((check) => check.code)).size, CHECKS.length);
});

test('Site Factory holds come first, unchanged, one per reason', () => {
  const ctx = context({ imported: { upstream: {}, skipped: [{ pageId: 'bras', reason: 'release_status:hold', holdReasons: ['facts_unapproved', 'thin'] }, { pageId: 'faq', reason: 'release_status:hold' }], pages: [] }, runtime: { ...context().runtime, analytics: null } });
  assert.deepEqual(runChecks(ctx).holds.map((hold) => hold.code), ['inherited:facts_unapproved', 'inherited:thin', 'inherited:release_status:hold', 'analytics_not_configured']);
  assert.deepEqual(holds('inherited', ctx)[0], { code: 'inherited:facts_unapproved', detail: 'Site Factory held bras', items: ['bras'] });
});

test('a missing import record holds authored pages; an uncommitted upstream or another slot manifest holds', () => {
  assert.equal(holds('import_record_missing', context({ imported: null }))[0].code, 'import_record_missing');
  assert.deepEqual(holds('import_record_missing', context({ imported: null, pages: [page('/blog/x/', { pageType: 'blog_post' })] })), []);
  assert.match(holds('upstream_uncommitted', context({ imported: { upstream: { codeVersion: 'abc-dirty' }, skipped: [] } }))[0].detail, /abc-dirty/);
  assert.match(holds('slot_manifest_mismatch', context({ imported: { upstream: { slotManifestMatches: false, plannedSlotManifest: 's07/slot-manifest.json' }, skipped: [] } }))[0].detail, /s07\/slot-manifest\.json/);
});

test('owner sign-off: a missing file holds, each open item holds with the pages citing its fact', () => {
  assert.equal(holds('release_signoff_missing', context({ signoff: null })).length, 1);
  const ctx = context({ signoff: { items: [{ id: 'founded', description: 'Founding year', factId: 'f1' }, { id: 'certs', description: 'Certificates' }, { id: 'done', description: 'x', status: 'confirmed' }] }, imported: { skipped: [], pages: [{ route: '/', citedFacts: ['f1'] }] } });
  assert.deepEqual(holds('owner_signoff_pending', ctx), [{ code: 'owner_signoff_pending', detail: 'founded: Founding year', items: ['/'] }, { code: 'owner_signoff_pending', detail: 'certs: Certificates' }]);
});

test('placeholder pages and unbuilt pages hold; without dist only not_built holds', () => {
  const ctx = context({ pages: [...context().pages, page('/about/', { status: 'placeholder' })] });
  assert.deepEqual(holds('placeholder_page_present', ctx)[0].items, ['/about/']);
  assert.deepEqual(holds('page_not_built', ctx)[0].items, ['/about/']);
  assert.deepEqual(holds('page_not_built', { ...ctx, hasDist: false }), []);
  assert.equal(holds('not_built', { ...ctx, hasDist: false }).length, 1);
});

test('competitor files and photos, placeholder photos and image slots on indexable pages hold', () => {
  const ctx = context({
    built: new Map([...context().built, ['/', html('<img src="/media/reference/p.webp" alt="x"><img src="/media/site/floor-960.webp" alt="x"><div data-media-slot="process"></div>')]]),
    distStat: (path) => (path === 'media/reference' ? {} : null),
    siteMedia: { photos: [{ class: 'process', src: '/media/site/floor-960.webp', srcset: '/media/site/floor-960.webp 960w', sourceFile: 'floor.png' }] },
  });
  assert.deepEqual(holds('reference_asset_present', ctx)[0].items, ['media/reference']);
  assert.deepEqual(holds('reference_photo_in_use', ctx)[0].items, ['/']);
  assert.deepEqual(holds('image_slot_present', ctx)[0].items, ['/']);
  // Factory, staff and client photos are handled like any other: the owner replaces them before launch (no hold); a
  // missing handoff is a reminder.
  assert.deepEqual(runChecks(ctx).holds.map((hold) => hold.code).filter((code) => code.includes('placeholder_photo')), []);
  assert.deepEqual(run('handoff_missing', context({ handoff: null })), { holds: [], notices: [{ code: 'handoff_missing', detail: 'no pre-launch handoff (docs/research/handoff.json): run pnpm handoff before launch' }] });
});

test('what a visitor must not see: pages the plan does not deliver, placeholder words, text in another language (site10)', () => {
  // A menu heading (nav_only) and a withheld page are never built.
  const sitePlan = { pages: [{ url: '/' }, { url: '/products/', nav_only: true }, { url: '/fabrics/', withheld: 'owner' }] };
  const built = (paths) => (path) => (paths.includes(path) ? { size: 1 } : null);
  assert.deepEqual(holds('undelivered_page_built', context({ sitePlan, distStat: built(['index.html', 'products/index.html']) }))[0].items, ['/products/']);
  assert.deepEqual(holds('undelivered_page_built', context({ sitePlan, distStat: built(['index.html']) })), []);
  // Placeholder words on an authored page hold; a placeholder page is held by placeholder_page_present instead.
  const pages = [page('/'), page('/draft/', { status: 'placeholder' })];
  const placeholder = context({ pages, built: new Map([['/', html('<p>[Placeholder] Company</p>')], ['/draft/', html('<p>Placeholder copy</p>')]]) });
  assert.deepEqual(holds('placeholder_text_present', placeholder)[0].items, ['/']);
  // Chinese alt text or copy on an English page holds; on a Chinese page it is the page's language.
  const foreign = context({ built: new Map([...context().built, ['/', html('<img src="/m/a.webp" alt="粉色比基尼的近景"><p>Our fabric 面料 is tested.</p>')]]) });
  assert.deepEqual(holds('text_not_in_page_language', foreign)[0].items, ['/ text: Our fabric 面料 is tested.', '/ alt a.webp: 粉色比基尼的近景']);
  const chinese = context({ built: new Map([['/', '<html lang="zh-CN"><head><title>T</title></head><body><main><p>面料</p></main></body></html>']]) });
  assert.deepEqual(holds('text_not_in_page_language', chinese), []);
  // A photo judged not to show its page's subject holds.
  const imageFit = { pages: [{ route: '/wetsuit/', images: [{ src: '/media/photos/a-960.webp', fit: 'wrong_subject' }, { src: '/media/photos/b-960.webp', fit: 'fits' }] }] };
  assert.deepEqual(holds('image_wrong_subject', context({ imageFit }))[0].items, ['/wetsuit/ a-960.webp']);
});

test('AI images: unregistered, unapproved and alt-less ones hold; decorative ones may have an empty alt', () => {
  const images = '<img src="/media/generated/a-960.webp" alt=""><img class="hero__backdrop" src="/media/generated/b-960.webp" alt=""><img src="/media/generated/c-960.webp" alt data-decorative><div data-media-origin="generated"></div>';
  const plan = { entries: ['a', 'b', 'c'].map((id) => ({ id, status: 'generated', review: 'pending', web: { srcset: `/media/generated/${id}-960.webp 960w` } })) };
  const ctx = context({ built: new Map([...context().built, ['/', html(images)]]), plan });
  assert.deepEqual(holds('image_not_approved', ctx)[0].items, ['a (pending)', 'b (pending)', 'c (pending)']);
  assert.deepEqual(holds('image_alt_missing', ctx)[0].items, ['a']);
  assert.deepEqual(holds('image_register_missing', { ...ctx, plan: null })[0].items, ['/']);
});

test('an eager image above the LCP budget holds', () => {
  const ctx = context({ distStat: (path) => (path === 'media/generated/a-960.webp' ? { size: 400 * 1024 } : null) });
  assert.deepEqual(holds('lcp_image_over_budget', ctx)[0].items, ['/media/generated/a-960.webp 400 KB']);
});

test('broken internal links hold: unbuilt routes and missing files, not queries or fragments', () => {
  const ctx = context({ built: new Map([...context().built, ['/', html('<a href="/contact/">C</a><a href="/missing/">M</a><a href="/brochure.pdf">B</a><a href="/missing/?q=1">Q</a><a href="/missing/#top">T</a>')]]) });
  assert.deepEqual(holds('broken_internal_link', ctx)[0].items, ['/ -> /missing/', '/ -> /brochure.pdf']);
});

test('a contact page without a way to reach anyone and an unconnected form hold; the form needs the privacy page', () => {
  const ctx = context({ pages: [page('/'), page('/contact/', { pageType: 'contact' })], built: new Map([['/', html('')], ['/contact/', html('<form data-form-status="not-connected"></form>')]]) });
  assert.deepEqual(holds('contact_path_missing', ctx)[0].items, ['/contact/']);
  assert.deepEqual(holds('form_delivery_unconfigured', ctx)[0].items, ['/contact/']);
  assert.deepEqual(holds('privacy_page_missing', ctx), [{ code: 'privacy_page_missing', detail: 'forms and analytics need the privacy page /privacy/', items: ['/privacy/'] }]);
  // The site tree's privacy page, wherever its route is, is the one the form links to.
  assert.deepEqual(holds('privacy_page_missing', context({ ...ctx, pages: [...ctx.pages, page('/privacy-policy/', { pageType: 'privacy' })] })), []);
});

test('the chat must be decided and usable', () => {
  assert.equal(holds('chat_undecided', context({ runtime: { ...context().runtime, chat: undefined } })).length, 1);
  assert.deepEqual(holds('chat_undecided', context()), []);
  assert.ok(holds('chat_config_invalid', context({ runtime: { ...context().runtime, chat: { whatsapp: [{ label: 'Sales', number: '12' }] } } })).length >= 1);
});

test('the registry: unregistered and retired sites hold, a paused one holds only without its notice', () => {
  const site = (value) => context({ runtime: { ...context().runtime, site: value } });
  assert.deepEqual(runChecks(site(null)).holds.map((hold) => hold.code), ['site_not_registered']);
  assert.deepEqual(runChecks(site({ id: 'kp', status: 'retired' })).holds.map((hold) => hold.code), ['site_retired']);
  assert.deepEqual(runChecks(site({ id: 'kp', status: 'paused' })).holds.map((hold) => hold.code), ['paused_site_without_notice']);
  assert.deepEqual(runChecks(site({ id: 'kp', status: 'paused', notice: 'Back in May' })), { holds: [], notices: [{ code: 'site_paused', detail: 'kp is paused and shows: Back in May' }] });
});

test('analytics, stand-in contact details and the identity hold until real', () => {
  assert.equal(holds('analytics_not_configured', context({ runtime: { ...context().runtime, analytics: { scriptSrc: 's' } } })).length, 1);
  assert.equal(holds('contact_details_placeholder', context({ contact: { placeholder: true } })).length, 1);
  assert.equal(holds('identity_missing', context({ identity: null })).length, 1);
  const identity = { siteName: 'Working title', origin: 'https://knitpace.example', source: 'fallback' };
  assert.deepEqual(holds('identity_not_release_ready', context({ identity })).map((hold) => hold.detail), ['brand kit source is fallback, not stage 00', 'site name is a working title: Working title']);
  assert.deepEqual(holds('canonical_host_not_release_ready', context({ identity })), [{ code: 'canonical_host_not_release_ready', detail: 'https://knitpace.example' }]);
});

test('critical SEO drift holds unless a removed page is redirected', () => {
  const drift = [{ level: 'critical', route: '/old/', rule: 'page_removed', detail: '' }, { level: 'critical', route: '/a/', rule: 'noindex_added', detail: '' }, { level: 'info', route: '/b/', rule: 'content_changed', detail: '' }];
  assert.deepEqual(holds('seo_drift_critical', context({ drift }))[0].items, ['/old/ page_removed', '/a/ noindex_added']);
  assert.deepEqual(holds('seo_drift_critical', context({ drift, redirects: [{ from: '/old/', to: '/' }] }))[0].items, ['/a/ noindex_added']);
});

test('cross-site: not compared holds, a near-duplicate holds', () => {
  assert.equal(holds('cross_site_not_checked', context({ crossSite: null })).length, 1);
  assert.deepEqual(holds('cross_site_duplicate', context({ crossSite: { threshold: 0.5, duplicates: [{ route: '/a/', host: 'other.com', otherRoute: '/b/', similarity: 0.8 }] } }))[0].items, ['/a/ ~ other.com/b/ (0.8)']);
});

test('nginx: the host config must exist, serve current, and stand alone', () => {
  assert.equal(holds('nginx_config_missing', context({ nginx: { configs: [], own: null } }))[0].detail, 'no deploy/nginx/knitpace.com.conf (run pnpm build:nginx-config)');
  assert.equal(holds('nginx_root_not_live_release', context({ nginx: { configs: ['knitpace.com.conf'], own: 'root /srv/knitpace/releases/1;' } })).length, 1);
  assert.deepEqual(holds('nginx_config_for_other_host', context({ nginx: { configs: ['knitpace.com.conf', 'other.com.conf', 'notes.txt'], own: 'root /srv/current;' } }))[0].items, ['other.com.conf']);
});

test('a failed SEO audit holds with its message; a less diverse library is a notice', () => {
  assert.deepEqual(holds('seo_audit_failed', context({ seoAuditError: 'SEO audit failed with 1 issue(s)' })), [{ code: 'seo_audit_failed', detail: 'SEO audit failed with 1 issue(s)' }]);
  assert.deepEqual(runChecks(context({ diversity: { vendi: 10, minVendi: 12, photos: 30 } })), { holds: [], notices: [{ code: 'image_library_less_diverse_than_reference', detail: 'Vendi 10 below 12 for 30 photos' }] });
});

test('placeholder prices and reviews in structured data hold with no way to sign them off; shipped reviews hold until the owner confirms them as real', async () => {
  const { reviewMarkup, reviewSignoffItem } = await import('../lib/review-markup.mjs');
  const product = { '@context': 'https://schema.org', '@type': 'Product', name: 'Bikini', offers: { '@type': 'Offer', price: '9' }, review: { '@type': 'Review', reviewBody: 'x' }, aggregateRating: { '@type': 'AggregateRating', ratingValue: '4.8' } };
  assert.deepEqual(reviewMarkup(product), ['Product.review', 'Product.aggregateRating']);
  assert.deepEqual(reviewMarkup({ '@graph': [{ '@type': 'Organization' }, product] }), ['Product.review', 'Product.aggregateRating']);
  assert.deepEqual(reviewMarkup({ '@type': 'Review', itemReviewed: { '@type': 'Product' } }), ['Review']);
  // Marked placeholders hold, and a confirmed sign-off item does not release them.
  const marked = page('/bikini/', { structuredDataPlaceholders: [{ '@type': 'Product', properties: ['offers', 'review'] }] });
  const confirmed = { items: [{ id: 'review-source', status: 'confirmed' }] };
  assert.deepEqual(holds('placeholder_structured_data', context({ pages: [page('/'), marked], signoff: confirmed }))[0].items, ['/bikini/ Product.offers', '/bikini/ Product.review']);
  // Review markup in the build holds until review-source is confirmed.
  const built = new Map([['/', html(`<script type="application/ld+json">${JSON.stringify(product)}</script>`)]]);
  const ctx = (signoff) => context({ pages: [page('/')], built, signoff });
  assert.deepEqual(holds('review_markup_unconfirmed', ctx({ items: [] }))[0].items, ['/ Product.review', '/ Product.aggregateRating']);
  assert.deepEqual(holds('review_markup_unconfirmed', ctx(confirmed)), []);
  // The sign-off item names the pages, so a page that gains reviews asks again.
  assert.equal(reviewSignoffItem([{ route: '/', jsonLd: [product] }, { route: '/x/', jsonLd: [] }]).description.includes('of /'), true);
  assert.equal(reviewSignoffItem([{ route: '/x/', jsonLd: [] }]), null);
});
