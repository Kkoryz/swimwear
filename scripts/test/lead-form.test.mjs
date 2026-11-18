import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import LEAD_FORM from '../../config/lead-form.json' with { type: 'json' };
import { formIsLive, formRecipient, formStatus, leadFormBlock } from '../lib/lead-form.mjs';
import { nginxConfig } from '../lib/nginx-config.mjs';
import { CHECKS, runChecks } from '../preflight.mjs';

// Owner 2026-11-17 ("表单接info邮箱"): the forms are live by default and go to info@ the site's domain.
test('the form contract is ready by default and its recipient is info@ the site\'s own domain, never in the block', () => {
  assert.equal(LEAD_FORM.status, 'ready');
  assert.equal(formStatus(), 'ready');
  assert.ok(formIsLive('ready') && formIsLive('connected') && !formIsLive('not-connected') && !formIsLive(undefined));
  assert.equal(formRecipient('https://strandmill.com'), 'info@strandmill.com');
  assert.equal(formRecipient('https://www.strandmill.com'), 'info@strandmill.com');
  assert.equal(formRecipient(null), null);
  // The address the site states wins (MotelPilot audit M-10).
  assert.equal(formRecipient('https://motelpilot.com', undefined, { email: 'hello@motelpilot.com' }), 'hello@motelpilot.com');
  assert.equal(formRecipient('https://motelpilot.com', undefined, { email: '' }), 'info@motelpilot.com');
  const block = leadFormBlock('form');
  assert.equal(block.status, 'ready');
  assert.ok(!JSON.stringify(block).includes('info@'), 'the page data never names the mailbox');
  // The honeypot, the consent and the fields stay.
  assert.equal(block.honeypot, 'website');
  assert.ok(block.consent.label && block.fields.length);
});

test('the form renders live from the contract: POST to the endpoint, enabled, the contract\'s status; the recipient stays out', async () => {
  const source = await readFile(new URL('../../src/components/blocks/LeadForm.astro', import.meta.url), 'utf8');
  assert.match(source, /const status = formStatus\(\);/);
  assert.match(source, /const live = formIsLive\(status\);/);
  assert.match(source, /data-form-status=\{status\}[^>]*method=\{live \? 'post' : undefined\} action=\{live \? endpoint : undefined\}/);
  assert.match(source, /type=\{live \? 'submit' : 'button'\}/);
  assert.ok(!/recipient/i.test(source.split('---')[2] ?? ''), 'no recipient in the markup');
  // Referrer and UTM travel with every enquiry.
  assert.match(source, /data-lead-referrer/);
  assert.match(source, /data-lead-utm/);
});

const html = (body) => `<html lang="en"><head><title>T</title></head><body><main>${body}</main></body></html>`;
const page = (route, extra = {}) => ({ route, pageType: 'product', status: 'authored', seo: { canonical: route }, ...extra });
const holds = (code, ctx) => runChecks(ctx, CHECKS.filter((check) => check.code === code)).holds;
const ctxWith = (status) => ({ pages: [page('/'), page('/contact/', { pageType: 'contact' })], built: new Map([['/', html('')], ['/contact/', html(`<form data-form-status="${status}"></form>`)]]), identity: { origin: 'https://strandmill.com' }, form: { ...LEAD_FORM, status } });

test('a ready form still holds the launch until a real POST is tested (connected), naming where it is forwarded', () => {
  const ready = holds('form_delivery_unconfigured', ctxWith('ready'));
  assert.deepEqual(ready[0].items, ['/contact/']);
  assert.match(ready[0].detail, /forwarded to info@strandmill\.com/);
  assert.match(ready[0].detail, /status to "connected"/);
  assert.deepEqual(holds('form_delivery_unconfigured', ctxWith('connected')), []);
  assert.match(holds('form_delivery_unconfigured', ctxWith('not-connected'))[0].detail, /not connected/);
  // A live form needs the privacy page its consent links to, whatever its status.
  assert.equal(holds('privacy_page_missing', ctxWith('connected')).length, 1);
});

test('Nginx hands the API the recipient in a header; build:nginx-config takes it from the contract and the identity', async () => {
  const { server } = nginxConfig({ host: 'strandmill.com', root: '/var/www/strandmill.com/current', leadRecipient: 'info@strandmill.com' });
  assert.match(server, /location \/api\/ \{[^}]*proxy_set_header X-Lead-Recipient info@strandmill\.com;\n    \}/);
  assert.ok(!nginxConfig({ host: 'strandmill.com', root: '/r' }).server.includes('proxy_set_header X-Lead-Recipient'));
  assert.throws(() => nginxConfig({ host: 'strandmill.com', root: '/r', leadRecipient: 'x; include /etc/passwd' }), /email address/);
  const { buildNginxConfig } = await import('../build-nginx-config.mjs');
  const root = await mkdtemp(join(tmpdir(), 'lead-nginx-'));
  await mkdir(join(root, 'src/data'), { recursive: true });
  await mkdir(join(root, 'config'), { recursive: true });
  await writeFile(join(root, 'src/data/site-identity.json'), JSON.stringify({ origin: 'https://strandmill.com' }));
  await writeFile(join(root, 'config/lead-form.json'), JSON.stringify(LEAD_FORM));
  await buildNginxConfig({ root });
  assert.match(await readFile(join(root, 'deploy/nginx/strandmill.com.conf'), 'utf8'), /X-Lead-Recipient info@strandmill\.com;/);
});

// site13 claude-seo audit 2026-11-17, M-15: the quote page asked for a tech pack, a size chart, quantities and a target
// date the form had no field for. The form asks them, by the site's kind, all optional, before the message.
const pageOf = (pageType, label, status = 'authored') => ({ pageType, status, planned: { label }, hero: { heading: `${label} heading` } });
const maker = [pageOf('home', 'Swimwear'), pageOf('product_manufacturer', 'Bikinis'), pageOf('product_manufacturer', 'Rash Guards'), pageOf('product_manufacturer', 'Held', 'hold'), pageOf('solution', 'Embroidery')];
const hotel = [pageOf('home', 'Hotel Revenue Management'), pageOf('solution', 'OTA Optimization'), pageOf('solution', 'Hotel Digital Marketing')];

test('a maker\'s enquiry asks product, quantity, target date and a tech pack link; a service business\'s asks service, start date and a link, never a quantity', async () => {
  const { enquiryKind, siteEnquiryForm } = await import('../lib/lead-form.mjs');
  assert.equal(enquiryKind(maker), 'product');
  assert.equal(enquiryKind(hotel), 'service');
  const made = siteEnquiryForm('form', maker).fields;
  assert.deepEqual(made.map((field) => `${field.name}:${field.kind}`), ['name:text', 'email:email', 'company:text', 'phone:tel', 'product:select', 'quantity:number', 'target_date:date', 'reference_url:url', 'message:textarea']);
  // The choices are the site's own category pages (a held page is none) and "something else".
  assert.deepEqual(made.find((field) => field.name === 'product').options, ['Bikinis', 'Rash Guards', 'Something else (tell us in your message)']);
  assert.equal(made.find((field) => field.name === 'quantity').min, 1);
  // Modern Web Guidance's form rules: each field says what it is for; the ask fields are optional and say so.
  assert.ok(made.every((field) => field.purpose));
  for (const field of made.slice(4, 8)) assert.ok(!field.required && field.purpose.startsWith('Optional:'), field.name);
  const service = siteEnquiryForm('form', hotel).fields;
  assert.deepEqual(service.map((field) => `${field.name}:${field.kind}`), ['name:text', 'email:email', 'company:text', 'phone:tel', 'service:select', 'target_date:date', 'reference_url:url', 'message:textarea']);
  assert.deepEqual(service.find((field) => field.name === 'service').options, ['OTA Optimization', 'Hotel Digital Marketing', 'Something else (tell us in your message)']);
  assert.ok(!service.some((field) => /quantit|colou?r|pieces/i.test(`${field.name} ${field.label} ${field.purpose}`)));
  // A site without such pages names it in a text box; no file field (the endpoint takes form fields only).
  assert.equal(siteEnquiryForm('form', [pageOf('home', 'Home')]).fields.find((field) => field.name === 'service').kind, 'text');
  assert.ok(![...made, ...service].some((field) => field.kind === 'file'));
});

test('the ask fields record one thing, so the privacy row is the same for both kinds; the form renders the contract\'s fields', async () => {
  const { dataPractices, siteForms } = await import('../lib/data-practices.mjs');
  const row = (pages) => dataPractices(siteForms(pages)).items.find((item) => item.id === 'enquiry-form').recorded;
  assert.equal(row(maker), row(hotel));
  assert.match(row(maker), /^Your name, email and message; your company and phone if you give them; the details of your request if you give them \(what it is about, how many, by when, a reference link\), and that you agreed to this use$/);
  const source = await readFile(new URL('../../src/components/blocks/LeadForm.astro', import.meta.url), 'utf8');
  assert.match(source, /fields: siteEnquiryForm\(Astro\.props\.block\.id, pages\)\.fields/);
  assert.match(source, /min=\{field\.min\}/);
});

test('the contact page\'s first screen names its direct channels and links down to its form, under the button (site13 M-15)', async () => {
  const hero = await readFile(new URL('../../src/components/blocks/PageHero.astro', import.meta.url), 'utf8');
  assert.match(hero, /const quickContact = page\.pageType === 'contact' \? contactChannels\(\{ contact: siteContact, chat: siteRuntime\?\.chat \|\| null \}\)\.filter\(/);
  // After the actions, inside the copy (so the banner leaves it room in the first screen too).
  assert.match(hero, /class="page-hero__actions"[\s\S]*?<\/div>\s*\)\}\s*\{\(quickContact\.length > 0[\s\S]*?<ul class="page-hero__contact"[\s\S]*?href=\{`#\$\{formId\}`\}>\{formHeading\}<\/a>/);
  const css = await readFile(new URL('../../src/styles/template.css', import.meta.url), 'utf8');
  assert.match(css, /\.page-hero__contact a \{[^}]*min-height: 44px/);
});
