import assert from 'node:assert/strict';
import test from 'node:test';

import { internalLinks } from '../lib/built-site.mjs';
import { pageProblems } from '../lib/seo-audit.mjs';
import { schemaProblems } from '../lib/schema-rules.mjs';

const identity = { siteName: 'Knit Pace', origin: 'https://knitpace.com', schemaLogo: { src: '/icon-512.png' } };
const nav = { header: [{ label: 'Leggings', route: '/leggings/', children: [] }], footer: [] };
const page = { route: '/leggings/', status: 'authored', hero: { heading: 'Leggings' }, seo: { title: 'T', description: 'D', canonical: '/leggings/' }, jsonLd: [] };
const og = ['og:title', 'og:description', 'og:url', 'og:image'].map((key) => `<meta property="${key}" content="x">`).join('');
const crumbs = '{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"position":1,"name":"Home","item":"https://knitpace.com/"},{"position":2,"name":"Leggings"}]}';
const title = 'Custom Leggings Manufacturer for Sportswear Brands';
const description = 'We make custom leggings for sportswear brands: fabrics, fits, samples and bulk production, from one factory.';
const html = ({ robots = '', schema = crumbs, image = '<img src="/a.webp" alt="Leggings on a rack in a sewing room" width="10" height="10">', body = '<h1>Leggings</h1><h2>Fabrics</h2>' } = {}) =>
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
