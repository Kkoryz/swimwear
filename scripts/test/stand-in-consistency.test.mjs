import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { dataPractices, emailsIn, retentionsIn } from '../lib/data-practices.mjs';
import { ownerOf } from '../lib/issue-owners.mjs';
import { proofProblems } from '../lib/proof-consistency.mjs';
import { privacyContradictionProblems } from '../lib/seo-site-checks.mjs';
import { siteDataProblems } from '../lib/site-data-checks.mjs';
import { proofBlock } from '../lib/site-proof.mjs';
import { demoProof, withFacts } from '../scaffold-site-proof.mjs';

const demo = async () => JSON.parse(await readFile(new URL('../../config/demo-proof.json', import.meta.url), 'utf8'));
const form = { fields: [{ label: 'Name', required: true }, { label: 'Email', required: true }], consent: true };
// site13's policy text (Site Factory's), word for word in its two facts.
const site13Copy = 'We keep these details while we work together and for as long as order records require. To see, correct or delete your details, write to sales@strandmill.com.';

test('the privacy module gives way to the page\'s copy for a stand-in: one contact, one period (four-site audit 2026-11-17, C4)', () => {
  const privacy = { retention: '24 months after our last exchange, then deleted', contact: 'privacy@strandmill.com', standIn: true };
  const result = dataPractices({ form, privacy, copy: site13Copy });
  assert.equal(result.contact, 'sales@strandmill.com');
  assert.equal(result.retention, null);
  // Copy that states neither keeps the stand-in facts; the owner's own facts are always shown.
  assert.deepEqual([dataPractices({ form, privacy, copy: 'We answer every enquiry.' }).contact, dataPractices({ form, privacy, copy: '' }).retention], ['privacy@strandmill.com', privacy.retention]);
  const owner = dataPractices({ form, privacy: { ...privacy, standIn: false }, copy: site13Copy });
  assert.deepEqual([owner.contact, owner.retention], ['privacy@strandmill.com', privacy.retention]);
  assert.deepEqual(emailsIn('Write to Sales@Strandmill.com.'), ['sales@strandmill.com']);
  assert.deepEqual(retentionsIn(`${site13Copy} How long we keep what you send us: 24 months after our last exchange, then deleted.`), ['as long as order records require', '24 months']);
  const view = readFile(new URL('../../src/components/blocks/DataPracticesBlock.astro', import.meta.url), 'utf8');
  return view.then((text) => assert.match(text, /standIn: siteProof\.standIn === true \} : null, copy,/));
});

test('a privacy policy naming two addresses or two periods fails privacy_contradiction, for Site Factory', () => {
  const page = { route: '/privacy-policy/', pageType: 'privacy', hero: { heading: 'Privacy Policy' } };
  const main = (text) => new Map([[page.route, `<html><body><main id="main"><p>${text}</p></main><footer data-site-footer><a href="mailto:info@strandmill.com">info@strandmill.com</a></footer></body></html>`]]);
  const two = privacyContradictionProblems([page], main(`${site13Copy} How long we keep what you send us: 24 months after our last exchange. To see what we hold, write to <a href="mailto:privacy@strandmill.com">privacy@strandmill.com</a>.`));
  assert.deepEqual(two.map((problem) => problem.issue), ['privacy_contradiction', 'privacy_contradiction']);
  assert.match(two[0].detail, /sales@strandmill\.com, privacy@strandmill\.com/);
  assert.match(two[1].detail, /"as long as order records require", "24 months"/);
  // One of each passes; the footer's address is no part of the policy; the terms page is not read.
  assert.deepEqual(privacyContradictionProblems([page], main(site13Copy)), []);
  assert.deepEqual(privacyContradictionProblems([{ ...page, route: '/terms/', hero: { heading: 'Terms' } }], new Map([['/terms/', main(`${site13Copy} privacy@x.com`).get(page.route)]])), []);
  assert.equal(ownerOf('privacy_contradiction'), 'site-factory');
});

test('a stand-in testimonial shows only on the pages it is assigned to (C3)', () => {
  const proof = { standIn: true, testimonials: [{ quote: 'Bikinis on time.', author: 'Founder', pages: ['/bikini-manufacturer/'] }, { quote: 'One-pieces matched.', author: 'Buyer', pages: ['/one-piece/'] }, { quote: 'Clear quotes.', author: 'Owner' }] };
  assert.deepEqual(proofBlock('testimonials', proof, { route: '/bikini-manufacturer/' }).items.map((item) => item.quote), ['Bikinis on time.', 'Clear quotes.']);
  assert.deepEqual(proofBlock('testimonials', proof, { route: '/baby-swimwear/' }).items.map((item) => item.quote), ['Clear quotes.']);
  assert.equal(proofBlock('testimonials', { ...proof, testimonials: proof.testimonials.slice(0, 2) }, { route: '/baby-swimwear/' }), null);
});

test('a stand-in figure takes the copy\'s number, and one that contradicts the copy or the facts fails proof_inconsistent (C2)', async () => {
  const config = await demo();
  const copy = [{ route: '/about-us/', text: 'We run around the clock with a capacity of about 100,000 pieces a month.' }];
  const made = demoProof({ demo: config, facts: new Map(), products: [{ product: 'bikini', route: '/bikini-manufacturer/' }], line: 'swimwear', seed: 'Strandmill', copy });
  const capacity = made.factory.find((item) => /pieces a month/.test(item.label));
  assert.deepEqual([capacity.value, capacity.fromCopy], ['100,000 pcs', '/about-us/']);
  // site13's file, made before: its 150,000 is the copy's on the next run.
  const existing = { ...made, factory: made.factory.map((item) => (item === capacity ? { value: '150,000 pcs', label: item.label } : item)) };
  assert.equal(withFacts(existing, made).factory.find((item) => /pieces a month/.test(item.label)).value, '100,000 pcs');
  // The check: the old file against the copy, and a testimonial of another country than its client's.
  const pages = [{ route: '/about-us/', seo: { title: 'About' }, hero: { heading: 'About' }, blocks: [{ id: 'a', type: 'intro', paragraphs: [copy[0].text] }] }];
  const stale = { ...existing, clients: [{ name: 'Seafern Label', note: 'Swimwear, UK' }], testimonials: [{ company: 'Seafern Label', country: 'France', quote: 'Q', pages: [] }] };
  const problems = proofProblems({ proof: stale, demo: config, pages });
  assert.deepEqual(problems.map((problem) => problem.issue), ['proof_inconsistent', 'proof_inconsistent']);
  assert.match(problems[0].detail, /Seafern Label says France, the client wall UK/);
  assert.match(problems[1].detail, /"150,000 pcs swimwear pieces a month" against 100,000 on \/about-us\//);
  assert.equal(ownerOf('proof_inconsistent'), 'template');
  // Agreeing proof, a figure from a fact, and the owner's own proof pass.
  assert.deepEqual(proofProblems({ proof: { ...made, clients: [] }, demo: config, pages }), []);
  assert.deepEqual(proofProblems({ proof: { ...stale, standIn: undefined }, demo: config, pages }), []);
  assert.deepEqual(proofProblems({ proof: { standIn: true, factory: [{ value: '150,000 pcs', label: 'swimwear pieces a month', factId: 'capacity' }] }, demo: config, pages }), []);
  // A figure taken from the copy keeps only its label's head: the demo's invented detail ("18 in design and patterns")
  // is no part of the copy's figure (aloha 2026-11-17: the copy's 62-person sampling studio of 7 pattern makers).
  const staffCopy = [{ route: '/about-us/', text: 'Our team is more than 290 people strong. Sampling happens in a dedicated studio with 62 staff: 7 pattern makers.' }];
  const staffed = demoProof({ demo: config, facts: new Map(), products: [{ product: 'shirt', route: '/shirts/' }], line: 'aloha shirts', seed: 'Tapa Works', copy: staffCopy });
  const staff = staffed.factory.find((item) => item.fromCopy && /^staff/.test(item.label));
  assert.deepEqual([staff.value, staff.label], ['290', 'staff']);
  // Copy that states the figure's own number as well as a part of it (a studio's 62 of the 290) agrees with it.
  const staffPages = [{ route: '/about-us/', seo: { title: 'About' }, hero: { heading: 'About' }, blocks: [{ id: 'a', type: 'intro', paragraphs: [staffCopy[0].text] }] }];
  assert.deepEqual(proofProblems({ proof: { standIn: true, factory: [staff] }, demo: config, pages: staffPages }).filter((problem) => /staff/.test(problem.detail)), []);
  assert.equal(proofProblems({ proof: { standIn: true, factory: [{ ...staff, value: '280' }] }, demo: config, pages: staffPages }).length, 1);
  // The early data checks run it too.
  assert.ok(siteDataProblems({ pages: [], proof: stale, demo: config }).some((problem) => problem.issue === 'proof_inconsistent'));
});

test("a stand-in names no client where the copy keeps the clients' names private (site13 blind audit H-1)", async () => {
  const { clientsKeptPrivate, withPrivateClients } = await import('../lib/proof-consistency.mjs');
  assert.equal(clientsKeptPrivate(['Here are three recent projects, with client names kept private.']), true);
  assert.equal(clientsKeptPrivate(['We keep our private-label clients anonymous.']), true);
  assert.equal(clientsKeptPrivate(['Our clients include 350 brands.', 'We never share a reference contact without permission.']), false);
  const proof = { standIn: true, clients: [{ name: 'Seafern Label', note: 'Swimwear, UK' }], testimonials: [{ quote: 'Q', author: 'A', company: 'Seafern Label', country: 'UK' }] };
  const pages = [{ route: '/case-studies/', seo: { title: 'Cases' }, hero: { heading: 'Cases' }, blocks: [{ id: 'i', type: 'intro', paragraphs: ['Three recent projects, with client names kept private.'] }] }];
  assert.match(proofProblems({ proof, pages }).map((item) => item.detail).join(' '), /keeps the clients' names private and the stand-in names Seafern Label/);
  const quiet = withPrivateClients(proof);
  assert.deepEqual([quiet.clients, quiet.testimonials[0].company, quiet.testimonials[0].country], [[], undefined, 'UK']);
  assert.deepEqual(proofProblems({ proof: quiet, pages }), []);
});

test('a count of addresses is not a headcount: "500 staff or store addresses" leaves the stand-in "290 staff" alone (aloha 2026-11-18)', async () => {
  const proof = { standIn: true, factory: [{ value: '290', label: 'staff, 18 in design and patterns' }] };
  const page = (text) => ({ route: '/shipping/', seo: {}, hero: {}, blocks: [{ type: 'intro', paragraphs: [text] }] });
  assert.deepEqual(proofProblems({ proof, demo: await demo(), pages: [page('We send 500 shirts to 500 staff or store addresses for one business order.')] }), []);
  assert.equal(proofProblems({ proof, demo: await demo(), pages: [page('Our 500 staff work in two shifts.')] }).length, 1);
});

test('a stand-in privacy contact gives way where the copy already says how to ask about one\'s details (aloha L-10, 2026-11-18)', () => {
  const privacy = { retention: '24 months after our last exchange, then deleted', contact: 'privacy@tapaworks.com', standIn: true };
  assert.equal(dataPractices({ form, privacy, copy: 'To see, correct or delete your information, email our team.' }).contact, null);
  assert.equal(dataPractices({ form, privacy, copy: 'We answer every enquiry.' }).contact, 'privacy@tapaworks.com');
  assert.equal(dataPractices({ form, privacy: { ...privacy, standIn: false }, copy: 'To delete your information, email our team.' }).contact, 'privacy@tapaworks.com');
});
