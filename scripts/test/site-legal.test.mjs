import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { validateAuthoringPages } from '../lib/authoring-contract.mjs';
import { DATA_PRACTICES_HEADING, ENQUIRY_CONTEXT, dataPractices, isPrivacyPolicy } from '../lib/data-practices.mjs';
import { legalName } from '../lib/legal-name.mjs';
import { leadFormBlock } from '../lib/lead-form.mjs';
import { placeRequiredBlocks } from '../lib/page-assembly.mjs';
import { pageHash, shownUpdated, updatePageDates } from '../lib/page-dates.mjs';

// Four-site audit 2026-11-17: privacy pages that do not say what the site collects, no visible "last updated" dates,
// no legal name in the footer.
const source = async (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const form = leadFormBlock('form');

test('the privacy policy lists what this site collects from its own configuration, and only the services it runs', () => {
  const bare = dataPractices({ form });
  assert.deepEqual(bare.rows.map((row) => row[0]), ['The enquiry form', 'With each enquiry']);
  assert.equal(bare.rows[0][1], 'Your name, email and message; your company and phone if you give them, and that you agreed to this use');
  assert.match(bare.rows[1][1], /referrer.*UTM/);
  assert.deepEqual([bare.retention, bare.contact], [null, null]);
  const runtime = { analytics: { provider: 'umami', scriptSrc: 'https://stats.example.org/script.js', websiteId: 'w' }, chat: { chatwoot: { baseUrl: 'https://chat.example.org', inboxIdentifier: 'i' }, whatsapp: [{ number: '8613800000000' }] }, newsletter: { provider: 'listmonk' } };
  const full = dataPractices({ form, runtime, privacy: { retention: '24 months after our last exchange, then deleted', contact: 'privacy@strandmill.com' }, contactEmail: 'sales@strandmill.com' });
  assert.deepEqual(full.rows.map((row) => row[0]), ['The enquiry form', 'With each enquiry', 'Visit statistics (Umami)', 'Live chat', 'WhatsApp', 'The newsletter']);
  assert.match(full.rows[2][1], /without cookies/);
  assert.ok(full.rows.every((row) => row.length === 3 && row.every((cell) => cell.trim())));
  assert.deepEqual([full.retention, full.contact], ['24 months after our last exchange, then deleted', 'privacy@strandmill.com']);
  // Chat off, no privacy contact: the company's own address.
  const off = dataPractices({ form, runtime: { chat: false }, contactEmail: 'sales@strandmill.com' });
  assert.deepEqual([off.rows.length, off.contact], [2, 'sales@strandmill.com']);
});

test('what each enquiry carries is what the form sends: its hidden fields are the module\'s', async () => {
  const markup = await source('src/components/blocks/LeadForm.astro');
  const named = [...markup.matchAll(/name="(page_url|referrer)"/g)].map((match) => match[1]);
  const utm = markup.match(/const UTM = \[([^\]]+)\]/)[1].match(/'([^']+)'/g).map((item) => item.slice(1, -1));
  assert.deepEqual([...named, ...utm], [...ENQUIRY_CONTEXT]);
});

test('the module goes on the privacy policy after Site Factory\'s text, never on the terms', () => {
  const blocks = () => [{ id: 'policy', type: 'intro', heading: 'Privacy', paragraphs: ['Text.'] }];
  const placed = (planned) => { const list = blocks(); placeRequiredBlocks(list, [], { planned }); return list; };
  const privacy = placed({ page_type: 'privacy', url: '/privacy-policy/', label: 'Privacy Policy' });
  assert.deepEqual(privacy.map((block) => block.type), ['intro', 'dataPractices']);
  assert.equal(privacy[1].heading, DATA_PRACTICES_HEADING);
  assert.deepEqual(placed({ page_type: 'privacy', url: '/terms-and-conditions/', label: 'Terms and Conditions' }).map((block) => block.type), ['intro']);
  assert.deepEqual(placed({ page_type: 'about', url: '/privacy-at-a-glance/', label: 'About' }).map((block) => block.type), ['intro']);
  assert.ok(isPrivacyPolicy({ route: '/legal/', label: 'Privacy notice' }));
  assert.deepEqual(validateAuthoringPages([{ id: 'p', route: '/privacy-policy/', pageType: 'privacy', status: 'authored', seo: { title: 'T', description: 'D', canonical: '/privacy-policy/' }, jsonLd: [], hero: { heading: 'H' }, blocks: privacy }]), []);
});

test('a content page and the home page show when their content last changed, the sitemap\'s date; the contact page, the blog and placeholders show none', () => {
  const page = (route, pageType, status = 'authored') => ({ route, pageType, status, seo: { title: 'T' }, hero: { heading: 'H' }, blocks: [{ id: 'a', type: 'intro' }] });
  const pages = [page('/about-us/', 'about'), page('/', 'home'), page('/contact-us/', 'contact'), page('/blog/', 'blog_hub'), page('/draft/', 'general', 'placeholder'), page('/privacy-policy/', 'privacy')];
  const dates = updatePageDates(pages, {}, '2026-11-16');
  assert.deepEqual(pages.map((item) => shownUpdated(item, dates)), ['2026-11-16', '2026-11-16', null, null, null, '2026-11-16']);
  // A record of other content is no date at all (never a wrong one).
  const changed = { ...pages[0], hero: { heading: 'Changed' } };
  assert.notEqual(pageHash(changed), dates['/about-us/'].hash);
  assert.equal(shownUpdated(changed, dates), null);
  assert.equal(shownUpdated(pages[0], null), null);
});

test('the footer\'s copyright names the company by its legal name, else the site\'s name, from one lookup', async () => {
  assert.equal(legalName({ identity: { siteName: 'Strandmill' }, company: { legalName: 'Guangzhou Strandmill Garment Co., Ltd.' } }), 'Guangzhou Strandmill Garment Co., Ltd.');
  assert.equal(legalName({ identity: { siteName: 'Strandmill' }, company: { legalName: ' ' } }), 'Strandmill');
  assert.equal(legalName({}), null);
  const footer = await source('src/components/site/SiteFooter.astro');
  // Both footer layouts carry the line.
  assert.equal(footer.match(/class="site-footer__copyright"/g).length, 2);
  assert.match(await source('src/lib/site-data.ts'), /siteLegalName = legalName\(/);
});
