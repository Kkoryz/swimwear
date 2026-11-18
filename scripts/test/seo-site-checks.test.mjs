import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { ownerOf } from '../lib/issue-owners.mjs';
import { builtPromiseProblems, channelHandleProblems, controlNameProblems, imageWeightProblems, inboundLinkProblems, lastmodProblems, lcpPriorityProblems, lexiconProblems, napProblems, navNoindexProblems, thinPageProblems, unreferencedAssets } from '../lib/seo-site-checks.mjs';

// The four-site audit 2026-11-17's built-site checks (Fable's plan 4.2).
const page = (route, extra = {}) => ({ id: route, route, pageType: 'general', status: 'authored', seo: { title: 'T', description: 'D', canonical: route }, hero: { heading: 'H' }, blocks: [], ...extra });
const html = ({ header = '', main = '', footer = '', head = '' } = {}) => `<html lang="en"><head><title>T</title>${head}</head><body><header class="site-header" data-site-header>${header}</header><main id="main">${main}</main><footer class="site-footer" data-site-footer>${footer}</footer></body></html>`;
const issues = (list) => list.map((item) => `${item.level ?? 'error'} ${item.issue} ${item.route ?? ''}`.trim());

test('a menu link to a held page fails, to a placeholder page warns; links in the content are not menus', () => {
  const pages = [page('/'), page('/launch/', { status: 'hold' }), page('/later/', { status: 'placeholder' })];
  const built = new Map([['/', html({ header: '<a href="/launch/">Launch</a>', footer: '<a href="/launch/">Launch</a><a href="/later/">Later</a>', main: '<a href="/later/">x</a>' })], ['/launch/', html()], ['/later/', html()]]);
  const found = navNoindexProblems(pages, built);
  assert.deepEqual(issues(found), ['error nav_links_noindex /launch/', 'warning nav_links_noindex /later/']);
  assert.match(found[0].detail, /header and footer/);
  assert.equal(ownerOf('nav_links_noindex'), 'template');
  // A related-links block is the content's own menu (site13 blind audit H-4: the home page's named the held blog hub).
  const related = new Map([['/', html({ main: '<section class="block" data-authoring-block="relatedPages"><a href="/launch/">Launch</a></section><p><a href="/later/">x</a></p>' })], ['/launch/', html()], ['/later/', html()]]);
  const fromRelated = navNoindexProblems(pages, related);
  assert.deepEqual(issues(fromRelated), ['error nav_links_noindex /launch/']);
  assert.match(fromRelated[0].detail, /related/);
});

test('image weight: an image fetched at once over 200 KB fails, a hero over 300 KB or a content photo over 200 KB warns', async () => {
  const root = await mkdtemp(join(tmpdir(), 'weight-'));
  try {
    await mkdir(join(root, 'dist/media'), { recursive: true });
    const file = async (name, kb) => writeFile(join(root, 'dist/media', name), Buffer.alloc(kb * 1024));
    await file('hero-960.webp', 210); await file('hero-1536.webp', 250); await file('lazy-hero-1536.webp', 320); await file('photo-1536.webp', 210); await file('small.webp', 90);
    const main = '<section class="page-hero" data-authoring-block="hero"><img src="/media/hero-960.webp" srcset="/media/hero-960.webp 960w, /media/hero-1536.webp 1536w" sizes="100vw" loading="eager" fetchpriority="high"></section>'
      + '<section data-authoring-block="split"><picture><source media="(max-width: 640px)" srcset="/media/small.webp"><img src="/media/photo-1536.webp" loading="lazy"></picture></section>';
    const other = '<div data-authoring-block="hero"><img src="/media/lazy-hero-1536.webp" loading="lazy"></div>';
    const found = await imageWeightProblems(root, [page('/'), page('/b/')], new Map([['/', html({ main })], ['/b/', html({ main: other })]]));
    // The hero fails on the file a phone fetches (960w, 210 KB); its 250 KB desktop file is under the hero's 300 KB.
    assert.deepEqual(issues(found), ['error image_weight /media/hero-960.webp', 'warning image_weight /media/photo-1536.webp', 'warning image_weight /media/lazy-hero-1536.webp']);
    assert.match(found[0].detail, /210 KB, fetched at once, at most 200 KB; on \//);
    // site13's case: a light phone file and a 250 KB desktop file pass (no photo is made again for it).
    await file('hero-960.webp', 150);
    assert.deepEqual(issues(await imageWeightProblems(root, [page('/')], new Map([['/', html({ main })]]))), ['warning image_weight /media/photo-1536.webp']);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('the first image that loads at once asks to be fetched first', () => {
  assert.deepEqual(lcpPriorityProblems(html({ main: '<div data-authoring-block="intro"><img src="/a.webp" loading="eager"></div>' })).map((item) => item.issue), ['lcp_fetchpriority_missing']);
  assert.deepEqual(lcpPriorityProblems(html({ main: '<img src="/a.webp" loading="eager" fetchpriority="high">' })), []);
  assert.deepEqual(lcpPriorityProblems(html({ main: '<img src="/a.webp" loading="lazy">' })), [], 'first_image_lazy fails that one');
});

test('every link, button and form control has an accessible name', () => {
  const named = '<a href="/a/">About</a><a href="/b/" aria-label="Blog"><svg></svg></a><a href="/c/"><img src="/c.webp" alt="Our team"></a>'
    + '<a href="/d/" tabindex="-1" aria-hidden="true"><img src="/d.webp" alt=""></a><button type="button" aria-labelledby="t"></button><span id="t">Menu</span>'
    + '<label class="form-block__field"><span id="n-label">Name</span><input id="n" name="name" aria-labelledby="n-label"></label>'
    + '<label for="e">Email</label><input id="e" name="email"><label>Message <textarea name="message"></textarea></label><input type="hidden" name="page_url"><input type="submit" value="Send">';
  assert.deepEqual(controlNameProblems(html({ main: named })), []);
  const unnamed = '<a href="/x/"><img src="/x.webp" alt=""></a><button class="nav-toggle"><svg></svg></button><input name="q"><select name="s"></select>';
  assert.deepEqual(controlNameProblems(html({ main: unnamed })).map((item) => item.detail), ['link /x/ has no accessible name', 'button .nav-toggle has no accessible name', 'input q has no accessible name', 'select s has no accessible name']);
});

test("the company's phone and address on the pages are the structured data's", () => {
  const schema = '<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","telephone":"+14165550187","address":{"@type":"PostalAddress","streetAddress":"12 King St W","addressLocality":"Toronto","addressCountry":"CA"}}</script>';
  const footer = (phone, address) => `<address class="site-footer__contact"><a href="tel:${phone}" data-contact-kind="phone">${phone}</a><span data-contact-kind="address">${address}</span></address>`;
  const pages = [page('/'), page('/contact-us/')];
  const same = new Map([['/', html({ head: schema, footer: footer('+14165550187', '12 King St W, Toronto, Ontario') })], ['/contact-us/', html({ main: '<ul><li class="contact-channel" data-kind="address"><span class="contact-channel__icon" aria-hidden="true"><svg></svg></span><span class="contact-channel__name">Address</span><span class="contact-channel__value">12 King St. W., Toronto</span></li></ul>' })]]);
  assert.deepEqual(napProblems(pages, same), []);
  const drift = new Map([['/', html({ head: schema, footer: footer('+14165550111', 'Toronto, Ontario') })]]);
  const found = napProblems([page('/')], drift);
  assert.deepEqual(issues(found), ['error nap_mismatch /', 'error nap_mismatch /']);
  assert.match(found[0].detail, /\+14165550111 is not the structured data's/);
  assert.match(found[1].detail, /leaves out the structured data's 12 King St W/);
  assert.deepEqual(napProblems([page('/')], new Map([['/', html({ footer: footer('+1', 'Anywhere') })]])), [], 'no structured phone or address: organization_thin says so');
  assert.equal(ownerOf('nap_mismatch'), 'owner');
});

test("the company's email and service area on the pages are the structured data's (S4)", () => {
  const schema = (area) => `<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","email":"sales@strandmill.com","areaServed":${JSON.stringify(area)},"contactPoint":{"@type":"ContactPoint","email":"sales@strandmill.com"}}</script>`;
  const us = [{ '@type': 'Country', name: 'United States' }];
  const footer = (email) => `<address class="site-footer__contact"><a href="mailto:${email}" data-contact-kind="email">${email}</a></address>`;
  const card = (market) => `<article class="case"><p class="case__client">Resort boutique owner<span class="case__market"> · ${market}</span></p></article>`;
  const pages = [page('/'), page('/privacy-policy/', { pageType: 'privacy', hero: { heading: 'Privacy Policy' } }), page('/b/')];
  const same = new Map([
    ['/', html({ head: schema(us), footer: footer('sales@strandmill.com'), main: `${card('Miami, USA')}<p>We ship to the United States from our Guangzhou factory.</p>` })],
    // The privacy policy's own contact is privacy_contradiction's.
    ['/privacy-policy/', html({ main: '<p>Write to privacy@strandmill.com.</p>' })],
    // The privacy contact (site-proof.json privacy.contact) may stand elsewhere too.
    ['/b/', html({ main: '<p>Data requests: privacy@strandmill.com. Fabrics from Italy.</p>' })],
  ]);
  assert.deepEqual(napProblems(pages, same, { allowedEmails: ['privacy@strandmill.com'] }), []);
  const drift = new Map([
    ['/', html({ head: schema(us), footer: footer('sales@strandmill.com'), main: `${card('Sydney, Australia')}${card('Paris, France')}<p>Email hello@strandmill.com. We ship worldwide and serve brands in the UK.</p>` })],
  ]);
  const found = napProblems([page('/')], drift);
  assert.deepEqual(issues(found), ['error nap_mismatch /', 'warning nap_mismatch /']);
  assert.match(found[0].detail, /email hello@strandmill.com is not the structured data's \(sales@strandmill.com\)/);
  assert.match(found[1].detail, /names Sydney, Australia Paris, France United Kingdom worldwide as a market, outside the structured data's areaServed \(United States\)/);
  // Worldwide covers every market; no areaServed or email stated, nothing to compare.
  assert.deepEqual(napProblems([page('/')], new Map([['/', html({ head: schema([{ '@type': 'Place', name: 'Worldwide' }]), footer: footer('sales@strandmill.com'), main: `${card('Sydney, Australia')}<p>We ship worldwide.</p>` })]])), []);
  assert.deepEqual(napProblems([page('/')], new Map([['/', html({ main: `${card('Sydney, Australia')}<p>Email hello@x.com.</p>` })]])), []);
});

test('a way to talk the copy names needs a number or link in the contact details (C6)', () => {
  const pages = [page('/'), page('/b/'), page('/later/', { status: 'placeholder' })];
  const built = new Map([
    ['/', html({ main: '<p>Message us on WhatsApp, or book a Zoom call. Zoom in on the stitching below.</p>' })],
    ['/b/', html({ main: '<p>We answer on Skype, Viber and WeChat within a day.</p>' })],
    ['/later/', html({ main: '<p>Telegram us.</p>' })],
  ]);
  // The WhatsApp stand-in number (import-site-factory.mjs withContactStandIns) is a handle; the placeholder flags are not.
  const contact = { email: 'sales@strandmill.com', whatsapp: '+1 512 555 0142', placeholder: true, standIns: ['whatsapp', 'skype'] };
  const found = channelHandleProblems(pages, built, { contact, runtime: { analytics: { scriptSrc: 'https://zoom.example/script.js' } } });
  assert.deepEqual(issues(found), ['warning channel_without_handle /', 'warning channel_without_handle /b/']);
  assert.match(found[0].detail, /names Zoom, which/);
  assert.match(found[1].detail, /names Skype, Viber, WeChat, which/);
  // A chat line or a profile link reaches the channel.
  const reached = channelHandleProblems(pages, built, { contact: { ...contact, same_as: ['https://join.skype.com/invite/abc', 'https://zoom.us/j/1'], wechat: 'strandmill' }, runtime: { chat: { whatsapp: [{ number: '+86 20 5399 3238' }] } } });
  assert.deepEqual(issues(reached), ['warning channel_without_handle /b/']);
  assert.match(reached[0].detail, /names Viber, which/);
  assert.equal(ownerOf('channel_without_handle'), 'site-factory');
});

test('an indexable page fewer than three pages link to from their content warns for Site Factory; menus do not count', () => {
  const pages = ['/', '/a/', '/b/', '/c/', '/d/'].map((route) => page(route));
  const link = (...routes) => routes.map((route) => `<a href="${route}">x</a>`).join('');
  const built = new Map([['/', html({ header: link('/d/'), main: link('/a/', '/b/') })], ['/a/', html({ main: link('/b/', '/c/') })], ['/b/', html({ main: link('/a/', '/c/') })], ['/c/', html({ main: link('/a/', '/b/') })], ['/d/', html({ main: link('/a/', '/d/') })]]);
  assert.deepEqual(issues(inboundLinkProblems(pages, built)), ['warning inbound_links_low /c/', 'warning inbound_links_low /d/']);
  assert.equal(ownerOf('inbound_links_low'), 'site-factory');
});

test('one lastmod on every URL warns once the site has been released', () => {
  const sitemap = (...dates) => `<urlset>${dates.map((date, n) => `<url><loc>https://x.com/${n}/</loc><lastmod>${date}</lastmod></url>`).join('')}</urlset>`;
  assert.deepEqual(issues(lastmodProblems(sitemap('2026-11-16', '2026-11-16'), { released: true })), ['warning lastmod_uniform /sitemap.xml']);
  assert.deepEqual(lastmodProblems(sitemap('2026-11-16', '2026-11-16')), [], 'the first release');
  assert.deepEqual(lastmodProblems(sitemap('2026-11-13', '2026-11-16'), { released: true }), []);
});

test('a page under 60% of its page type\'s median words warns; a type of fewer than three pages is not compared', () => {
  const words = (count) => html({ main: `<p>${'word '.repeat(count)}</p>` });
  const pages = ['/a/', '/b/', '/c/', '/d/'].map((route) => page(route, { pageType: 'product_manufacturer' }));
  const built = new Map([['/a/', words(2000)], ['/b/', words(2100)], ['/c/', words(1900)], ['/d/', words(1000)]]);
  const found = thinPageProblems(pages, built);
  assert.deepEqual(issues(found), ['warning thin_vs_siblings /d/']);
  assert.match(found[0].detail, /1000 words, 51% of the product_manufacturer pages' median 1950/);
  assert.deepEqual(thinPageProblems(pages.slice(2), new Map([['/c/', words(1900)], ['/d/', words(100)]])), []);
  assert.equal(ownerOf('thin_vs_siblings'), 'site-factory');
});

test('a retired product name in a page\'s copy warns for Site Factory, matched as a whole name', async () => {
  const { readFile } = await import('node:fs/promises');
  const lexicon = JSON.parse(await readFile(new URL('../../config/stand-in-lexicon.json', import.meta.url), 'utf8'));
  const built = new Map([['/contact-us/', html({ main: '<p>Call us on Skype or WhatsApp.</p>' })], ['/a/', html({ main: '<p>Skyped in: a Skypeless world.</p>' })]]);
  assert.deepEqual(issues(lexiconProblems([page('/contact-us/'), page('/a/')], built, lexicon)), ['warning stand_in_lexicon /contact-us/']);
  assert.equal(ownerOf('stand_in_lexicon'), 'site-factory');
});

test('a built page promising a file shows a file link or the resource request form', () => {
  const built = (main) => new Map([['/guides/', html({ main })]]);
  const promise = '<p>Download our free sizing guide.</p>';
  assert.deepEqual(issues(builtPromiseProblems([page('/guides/')], built(promise))), ['error promise_without_asset /guides/']);
  assert.deepEqual(builtPromiseProblems([page('/guides/')], built(`${promise}<form class="form-block__form" data-request="resource"></form>`)), []);
  assert.deepEqual(builtPromiseProblems([page('/guides/')], built(`${promise}<a href="/files/sizing.pdf">Sizing guide (PDF)</a>`)), []);
  assert.deepEqual(builtPromiseProblems([page('/guides/')], built('<p>See <a href="https://aitechpacks.com/blog/t">Fashion Tech Pack Template (Free Download + Checklist)</a>.</p>')), [], 'the title of a cited article on another site is no promise');
  assert.deepEqual(issues(builtPromiseProblems([page('/resources/', { id: 'site:resources_guides' })], new Map([['/resources/', html({ main: '<p>Our guides.</p><form data-form-status="not-connected"></form>' })]]))), ['error promise_without_asset /resources/'], 'the enquiry form is no resource request form');
});

test('files in the build nobody names are one warning; conventional files and dotfiles are left out', async () => {
  const root = await mkdtemp(join(tmpdir(), 'unused-'));
  try {
    for (const dir of ['dist/_astro', 'dist/media', 'dist/images']) await mkdir(join(root, dir), { recursive: true });
    await writeFile(join(root, 'dist/index.html'), '<link rel="stylesheet" href="/_astro/site.css"><img src="/media/used.webp">');
    await writeFile(join(root, 'dist/_astro/site.css'), '@font-face { src: url(./font.woff2) }');
    await writeFile(join(root, 'dist/_astro/font.woff2'), 'f');
    await writeFile(join(root, 'dist/_astro/client.js'), 'x'.repeat(2048));
    await writeFile(join(root, 'dist/media/used.webp'), 'u');
    await writeFile(join(root, 'dist/media/old.webp'), 'o'.repeat(4096));
    for (const name of ['robots.txt', 'sitemap.xml', 'favicon.ico', 'images/.gitkeep']) await writeFile(join(root, 'dist', name), '');
    const [finding, ...rest] = await unreferencedAssets(root);
    assert.deepEqual(rest, []);
    assert.equal(finding.issue, 'unreferenced_assets');
    assert.match(finding.detail, /^2 file\(s\).*media\/old\.webp \(4 KB\), _astro\/client\.js \(2 KB\)$/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
