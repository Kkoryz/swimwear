import assert from 'node:assert/strict';
import test from 'node:test';

import { internalLinks } from '../lib/built-site.mjs';
import { emptyBlogProblems, formLandingProblems, pageProblems } from '../lib/seo-audit.mjs';
import { schemaProblems } from '../lib/schema-rules.mjs';

const identity = { siteName: 'Knit Pace', origin: 'https://knitpace.com', schemaLogo: { src: '/icon-512.png' } };
const nav = { header: [{ label: 'Leggings', route: '/leggings/', children: [] }], footer: [] };
const page = { route: '/leggings/', status: 'authored', hero: { heading: 'Leggings' }, seo: { title: 'T', description: 'D', canonical: '/leggings/' }, jsonLd: [] };
const og = ['og:title', 'og:description', 'og:url', 'og:image'].map((key) => `<meta property="${key}" content="x">`).join('');
const crumbs = '{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"position":1,"name":"Home","item":"https://knitpace.com/"},{"position":2,"name":"Leggings"}]}';
const title = 'Custom Leggings Manufacturer for Sportswear Brands';
const description = 'We make custom leggings for sportswear brands: fabrics, fits, samples and bulk production, from one factory.';
const html = ({ robots = '', schema = crumbs, image = '<img src="/a.webp" alt="Leggings on a rack in a sewing room" width="10" height="10" fetchpriority="high">', body = '<h1>Leggings</h1><h2>Fabrics</h2>' } = {}) =>
  `<html lang="en"><head><title>${title}</title><meta name="description" content="${description}"><link rel="canonical" href="https://knitpace.com/leggings/">${robots}${og}<script type="application/ld+json">${schema}</script></head>`
  + '<nav class="breadcrumbs"><ol><li class="breadcrumbs__item"><a href="/">Home</a></li><li class="breadcrumbs__item"><span>Leggings</span></li></ol></nav>'
  + `<main>${body}${image}<a href="/about/">About</a></main></html>`;
const errors = (options, target = page) => pageProblems({ html: html(options), page: target, identity, nav }).filter((problem) => problem.level !== 'warning').map((problem) => problem.issue);
const warnings = (options) => pageProblems({ html: html(options), page, identity, nav }).filter((problem) => problem.level === 'warning').map((problem) => problem.issue);

test('a complete page has no problems', () => {
  assert.deepEqual(pageProblems({ html: html(), page, identity, nav }), []);
});

test('noindex on an indexable page, breadcrumb drift, lazy first image and missing sizes are reported', () => {
  assert.deepEqual(errors({ robots: '<meta name="robots" content="noindex, follow">' }), ['robots']);
  assert.deepEqual(errors({ schema: '{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"position":1,"name":"Home"}]}' }), ['breadcrumb_mismatch']);
  assert.deepEqual(errors({ image: '<img src="/a.webp" alt="" loading="lazy">' }), ['image_size_missing', 'first_image_lazy']);
  assert.deepEqual(errors({ schema: '{bad' }), ['json_ld_invalid', 'json_ld_missing', 'breadcrumb_mismatch']);
});

test('a placeholder page must carry noindex', () => {
  assert.deepEqual(errors({}, { ...page, status: 'placeholder' }), ['robots']);
});

test('one h1, a document language and no placeholder text on an indexable page', () => {
  assert.deepEqual(errors({ body: '<h2>Fabrics</h2>' }), ['h1_count']);
  assert.deepEqual(errors({ body: '<h1>A</h1><h1>B</h1>' }), ['h1_count']);
  assert.deepEqual(errors({ body: '<h1>Leggings</h1><p>[Placeholder] copy</p>' }), ['placeholder_text_on_indexable']);
  assert.deepEqual(pageProblems({ html: html().replace('<html lang="en">', '<html>'), page, identity, nav }).map((problem) => problem.issue), ['html_lang_missing']);
});

test('skipped heading levels, numeric headings and generic link text are warnings, never failures', () => {
  assert.deepEqual(warnings({ body: '<h1>Leggings</h1><h3>Fabrics</h3><h2>300+</h2><a href="/x/">Read more</a>' }), ['heading_level_skipped', 'heading_empty_or_numeric', 'link_text_generic']);
  assert.deepEqual(errors({ body: '<h1>Leggings</h1><h3>Fabrics</h3>' }), []);
});

test('internal links are root-relative hrefs without query or fragment', () => {
  assert.deepEqual(internalLinks('<a href="/a/">x</a><a class="c" href="/b/#f">y</a><a href="https://x.com/">z</a>'), ['/a/', '/b/']);
});

test('a page Organization must match the site identity', () => {
  const org = '{"@context":"https://schema.org","@type":"Organization","name":"Working title","url":"https://knitpace.com/","logo":"https://knitpace.com/icon-512.png"}';
  const home = { ...page, route: '/', seo: { ...page.seo, canonical: '/leggings/' } };
  const withSite = html({ schema: org }).replace('</head>', '<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebSite","name":"Knit Pace","url":"https://knitpace.com/"}</script></head>');
  const issues = pageProblems({ html: withSite, page: home, identity, nav }).filter((problem) => problem.level !== 'warning').map((problem) => problem.issue);
  assert.deepEqual(issues, ['organization_name']);
});

test('schema rules: required properties fail, recommended ones warn, retired types and placeholders are flagged', () => {
  const service = schemaProblems({ '@context': 'https://schema.org', '@type': 'Service', name: 'Leggings manufacturing', provider: { '@type': 'Organization' } });
  assert.deepEqual(service.map((problem) => [problem.level, problem.issue]), [['warning', 'json_ld_recommended_missing'], ['warning', 'json_ld_recommended_missing'], ['warning', 'json_ld_recommended_missing']]);
  assert.deepEqual(schemaProblems({ '@context': 'https://schema.org', '@type': 'Product', name: 'X', image: 'i', description: 'd', brand: 'b' }).map((problem) => problem.issue), ['json_ld_required_missing']);
  assert.deepEqual(schemaProblems({ '@type': 'HowTo' }).map((problem) => problem.issue), ['json_ld_context', 'json_ld_no_rich_result']);
  assert.ok(schemaProblems({ '@context': 'https://schema.org', '@type': 'WebSite', name: '[Placeholder] Site', url: 'u' }).some((problem) => problem.issue === 'json_ld_placeholder'));
  assert.deepEqual(schemaProblems({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: [{ name: 'Q?', acceptedAnswer: {} }] }).map((problem) => problem.issue), ['json_ld_no_rich_result', 'faq_question_incomplete'], 'FAQ markup is still checked, and warned as earning no rich result since May 2026');
});

test('every enquiry link lands on a form: the contact and inquiry pages, and the target of a quote or enquiry button', () => {
  const at = (route, id = route, pageType = 'general') => ({ id, route, pageType, status: 'authored' });
  const pages = [at('/'), at('/request-a-quote/', 'site:inquiry'), at('/contact-us/', 'site:contact', 'contact'), at('/swimwear/', 'swimwear', 'solution'), at('/about-us/', 'site:about', 'about')];
  const form = '<form class="form-block__form"></form>';
  const built = new Map([
    ['/', '<main><a href="/request-a-quote/" class="button button--primary">Request a quote</a><a href="/contact-us/">Contact</a><a class="site-header__cta" href="/swimwear/#top">Get a <span>Quote</span></a><a href="/about-us/">Quote us</a></main>'],
    ['/request-a-quote/', '<main><a class="button" href="/contact-us/">Prefer email? Contact us</a></main>'],
    ['/contact-us/', `<main>${form}</main>`],
    ['/swimwear/', '<main></main>'],
    ['/about-us/', '<main></main>'],
  ]);
  // Strandmill audit 2026-11-17: the quote page every "Request a quote" button leads to had no form. A plain text link
  // that happens to say "quote" is not a button asking for one.
  assert.deepEqual(formLandingProblems(pages, built).map((problem) => [problem.route, problem.issue, problem.detail]), [
    ['/request-a-quote/', 'cta_target_without_form', 'no <form>; linked from /'],
    ['/swimwear/', 'cta_target_without_form', 'no <form>; linked from /'],
  ]);
  // The inquiry page fails without a form even when nothing links to it yet; with forms every link lands.
  assert.deepEqual(formLandingProblems(pages, new Map([['/request-a-quote/', '<main></main>']])).map((problem) => problem.detail), ['no <form> on a page that must carry the enquiry form']);
  built.set('/request-a-quote/', `<main>${form}</main>`);
  built.set('/swimwear/', `<main>${form}</main>`);
  assert.deepEqual(formLandingProblems(pages, built), []);
});

test('an indexable blog hub lists at least one indexable post', () => {
  const hub = (status, hrefs) => ({ route: '/blog/', pageType: 'blog_hub', status, blocks: hrefs.length ? [{ id: 'posts', type: 'postList', items: hrefs.map((href) => ({ href })) }] : [] });
  const post = (route, status) => ({ route, pageType: 'blog_post', status });
  assert.deepEqual(emptyBlogProblems([hub('authored', [])]).map((problem) => problem.issue), ['empty_blog_indexed']);
  assert.deepEqual(emptyBlogProblems([hub('authored', ['/blog/a/']), post('/blog/a/', 'hold')]).map((problem) => problem.issue), ['empty_blog_indexed'], 'only a post in review');
  assert.deepEqual(emptyBlogProblems([hub('hold', [])]), [], 'a held hub is noindex');
  assert.deepEqual(emptyBlogProblems([hub('authored', ['/blog/a/']), post('/blog/a/', 'authored')]), []);
});
