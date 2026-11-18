import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { validateAuthoringPages } from '../lib/authoring-contract.mjs';
import { checklistMarkdown } from '../lib/launch-checklist.mjs';
import { pageSchemas } from '../lib/seo-head.mjs';
import { personAnchor, sitePeople, teamItems, withPostAuthors } from '../lib/site-people.mjs';
import { proofBlock, proofSignoffItems, withProofSlots } from '../lib/site-proof.mjs';
import { CHECKS, runChecks } from '../preflight.mjs';
import { shownProof } from '../proof-signoff.mjs';
import { demoProof, standInTeam, withFacts } from '../scaffold-site-proof.mjs';

// Four-site audit 2026-11-17: no named person anywhere (team, authors), E-E-A-T 45-55.
const config = async (name) => JSON.parse(await readFile(new URL(`../../config/${name}.json`, import.meta.url), 'utf8'));
const identity = { siteName: 'Strandmill', origin: 'https://strandmill.com', schemaLogo: { src: '/icon-512.png' } };
const page = (route, pageType, blocks = [], extra = {}) => ({ id: route, route, pageType, status: 'authored', seo: { title: 'T', description: 'D', canonical: route }, jsonLd: [], hero: { heading: 'H' }, blocks, ...extra });
const team = [{ name: 'Yuting Chen', role: 'Founder', years: 20, bio: 'Runs the factory.' }, { name: 'Haoran Lin', role: 'Head of development', years: 14, bio: 'Leads sampling.', blogAuthor: true }];
const post = (author) => page('/blog/a-post/', 'blog_post', [{ id: 'section-1', type: 'prose', heading: 'One', anchor: 'one', paragraphs: ['Text.'] }], { article: { datePublished: '2026-11-01', dateModified: '2026-11-02', author, image: null, category: null, takeaways: [], minutes: 3 } });

test('each site gets its own stand-in team: one invented person per role of its trade, Chinese for a factory, no photo, no credential', async () => {
  const factory = await config('demo-proof');
  const service = await config('demo-proof.service');
  const strandmill = standInTeam(factory.team, 'Strandmill', { line: 'swimwear' });
  assert.deepEqual(strandmill.map((person) => person.role), ['Founder', 'Head of development', 'Quality control lead']);
  assert.deepEqual(standInTeam(factory.team, 'Strandmill', { line: 'swimwear' }), strandmill, 'the same site, the same people');
  assert.equal(new Set(strandmill.map((person) => person.name)).size, 3);
  for (const person of strandmill) {
    const [given, family] = person.name.split(' ');
    assert.ok(factory.team.names.first.includes(given) && factory.team.names.second.includes(family), person.name);
    assert.deepEqual(Object.keys(person).filter((key) => !['name', 'role', 'years', 'bio', 'blogAuthor', 'reviews'].includes(key)), [], 'no photo, no credential');
  }
  assert.match(strandmill[1].bio, /swimwear sample/);
  assert.deepEqual(strandmill.filter((person) => person.blogAuthor).map((person) => person.role), ['Head of development']);
  const sites = ['MotelPilot', 'RateHarbor', 'Staylumen'].map((seed) => standInTeam(service.team, seed).map((person) => person.name));
  for (const [index, names] of sites.entries()) for (const other of sites.slice(index + 1)) assert.ok(names.filter((name) => other.includes(name)).length === 0, `${names} / ${other}`);
  assert.deepEqual(standInTeam(service.team, 'RateHarbor').map((person) => person.role), ['Founder', 'Revenue manager', 'Account lead']);
  // The scaffold puts them in the stand-in proof, with the privacy facts (the contact at the site's domain).
  const made = demoProof({ demo: factory, facts: new Map(), products: [], line: 'swimwear', seed: 'Strandmill', host: 'strandmill.com' });
  assert.deepEqual(made.team, strandmill);
  assert.deepEqual(made.privacy, { retention: factory.privacy.retention, contact: 'privacy@strandmill.com' });
});

test('a stand-in keeps its team as edited; one made before the team gets one, one made for another site gets its own', async () => {
  const factory = await config('demo-proof');
  const made = demoProof({ demo: factory, facts: new Map(), products: [], line: 'swimwear', seed: 'Strandmill', host: 'strandmill.com' });
  const edited = { ...made, team: [{ ...made.team[0], name: 'Wei Zhang' }, ...made.team.slice(1)] };
  assert.equal(withFacts(edited, made).team[0].name, 'Wei Zhang');
  const before = { ...made, team: undefined, privacy: { retention: '12 months', contact: null } };
  assert.deepEqual(withFacts(before, made).team, made.team);
  assert.deepEqual(withFacts(before, made).privacy, { retention: '12 months', contact: 'privacy@strandmill.com' }, 'a fact given is kept, a missing one is filled');
  const other = demoProof({ demo: factory, facts: new Map(), products: [], line: 'swimwear', seed: 'Another', host: 'another.com' });
  assert.deepEqual(withFacts(other, made).team, made.team);
});

test('the about page names its people last: a valid team block, an anchor each; nothing without people', () => {
  assert.deepEqual(withProofSlots('about', [{ id: 'intro', block: 'intro' }, { id: 'faq', block: 'faq' }]).map((slot) => slot.id), ['intro', 'factory', 'history', 'certifications', 'logos', 'testimonials', 'team', 'faq']);
  const block = proofBlock('team', { headings: { team: 'Meet the team' }, team });
  assert.equal(block.type, 'team');
  assert.equal(block.heading, 'Meet the team');
  assert.deepEqual(block.items.map((item) => item.anchor), ['team-yuting-chen', 'team-haoran-lin']);
  assert.deepEqual(validateAuthoringPages([page('/about-us/', 'about', [block])]), []);
  assert.equal(proofBlock('team', { team: [] }), null);
  assert.equal(proofBlock('team', { team: [{ name: 'No role' }] }), null, 'a person needs a role');
  assert.equal(proofBlock('team', null), null);
  assert.equal(personAnchor('Zoë O\'Neil'), 'team-zoe-o-neil');
  assert.deepEqual(validateAuthoringPages([page('/about-us/', 'about', [{ id: 'team', type: 'team', items: [{ name: 'A', role: 'B', anchor: 'Bad anchor' }] }])]).length, 1);
});

test('a post signed by the company is signed by the team\'s writer, linked to their profile; without people as written', () => {
  const about = page('/about-us/', 'about', [{ id: 'owner-team', type: 'team', items: teamItems(team) }]);
  const people = sitePeople([page('/', 'home'), about]);
  assert.equal(people.route, '/about-us/');
  assert.deepEqual(people.people.map((person) => person.href), ['/about-us/#team-yuting-chen', '/about-us/#team-haoran-lin']);
  const [, signed] = withPostAuthors([about, post({ type: 'Organization' })]);
  assert.deepEqual(signed.article.author, { type: 'Person', name: 'Haoran Lin', url: '/about-us/#team-haoran-lin', jobTitle: 'Head of development', description: 'Leads sampling.', years: 14 });
  // A post naming a person of the team takes their profile; one naming someone else stays as written.
  assert.equal(withPostAuthors([about, post({ type: 'Person', name: 'Yuting Chen', url: '/' })])[1].article.author.url, '/about-us/#team-yuting-chen');
  const guest = { type: 'Person', name: 'A Guest', url: '/guest/' };
  assert.deepEqual(withPostAuthors([about, post(guest)])[1].article.author, guest);
  const alone = [post({ type: 'Organization' })];
  assert.equal(withPostAuthors(alone), alone);
  assert.equal(sitePeople(alone), null);
});

test('each person is a Person working for the company: on the about page and as the post\'s author, by one @id', () => {
  const about = page('/about-us/', 'about', [{ id: 'owner-team', type: 'team', items: teamItems(team) }]);
  const schemas = pageSchemas({ page: about, identity, nav: { header: [], footer: [] } });
  const people = schemas.filter((schema) => schema['@type'] === 'Person');
  assert.deepEqual(people[0], { '@context': 'https://schema.org', '@type': 'Person', '@id': 'https://strandmill.com/about-us/#team-yuting-chen', name: 'Yuting Chen', url: 'https://strandmill.com/about-us/#team-yuting-chen', jobTitle: 'Founder', description: 'Runs the factory.', worksFor: { '@id': 'https://strandmill.com/#organization' } });
  assert.equal(people.length, 2);
  const [, signed] = withPostAuthors([about, post({ type: 'Organization' })]);
  const posting = pageSchemas({ page: signed, identity, nav: { header: [], footer: [] } }).find((schema) => schema['@type'] === 'BlogPosting');
  assert.equal(posting.author['@id'], 'https://strandmill.com/about-us/#team-haoran-lin');
  assert.deepEqual([posting.author.jobTitle, posting.author.worksFor], ['Head of development', { '@id': 'https://strandmill.com/#organization' }]);
  // No people, no Person; a post signed by the company stays the Organization.
  assert.ok(!pageSchemas({ page: page('/about-us/', 'about'), identity, nav: {} }).some((schema) => schema['@type'] === 'Person'));
  assert.deepEqual(pageSchemas({ page: post({ type: 'Organization' }), identity, nav: {} }).find((schema) => schema['@type'] === 'BlogPosting').author, { '@id': 'https://strandmill.com/#organization' });
});

test('stand-in people and privacy facts are listed for sign-off while a page shows them', async () => {
  const proof = { team, privacy: { retention: '24 months after our last exchange, then deleted', contact: 'privacy@strandmill.com' } };
  const items = proofSignoffItems(proof);
  assert.deepEqual(items.map((item) => item.id), ['proof-team', 'proof-privacy']);
  assert.match(items[0].description, /Yuting Chen, Founder, 20 years; Haoran Lin, Head of development, 14 years/);
  assert.match(items[1].description, /retention: 24 months.*privacy contact: privacy@strandmill\.com/);
  // Nothing shows them: nothing to sign off.
  assert.deepEqual(proofSignoffItems(shownProof(proof, [page('/', 'home')])), []);
  const shown = [page('/about-us/', 'about', [{ id: 'owner-team', type: 'team', items: teamItems(team) }]), page('/privacy-policy/', 'privacy', [{ id: 'data-practices', type: 'dataPractices' }])];
  assert.deepEqual(proofSignoffItems(shownProof(proof, shown)).map((item) => item.id), ['proof-team', 'proof-privacy']);
  // The owner's sheet asks for them in its own rows.
  const { handoffRows } = await import('../handoff.mjs');
  const rows = handoffRows({ pages: [], signoff: { items: proofSignoffItems(proof) }, contact: null, built: new Map(), sourceOf: () => null });
  assert.deepEqual(rows.filter((row) => row.category !== '实体建设').map((row) => [row.field_id, row.category, row.required]), [['people:team', '人员', '必填'], ['privacy:facts', '隐私', '必填']]);
});

test('no named people is a notice, not a hold, saying it lowers E-E-A-T; stand-in people hold until signed off', () => {
  const ctx = (pages, signoff = { items: [] }) => ({ pages, built: new Map(), signoff, imported: { pages: [] } });
  const run = (code, context) => runChecks(context, CHECKS.filter((check) => check.code === code));
  const missing = run('people_missing', ctx([page('/', 'home')]));
  assert.deepEqual(missing.holds, []);
  assert.equal(missing.notices[0].code, 'people_missing');
  assert.match(missing.notices[0].detail, /E-E-A-T/);
  const about = page('/about-us/', 'about', [{ id: 'owner-team', type: 'team', items: teamItems(team) }]);
  assert.deepEqual(run('people_missing', ctx([about])), { holds: [], notices: [] });
  const pending = run('owner_signoff_pending', ctx([about], { items: proofSignoffItems({ team }) }));
  assert.deepEqual(pending.holds.map((hold) => hold.detail.split(':')[0]), ['proof-team']);
  // The checklist lists it among the notices, in the owner's words.
  const text = checklistMarkdown({ status: 'ready_for_deployment', checkedAt: 'now', holds: [], notices: missing.notices });
  assert.match(text, /## 提示（不拦截上线）（1）\n\n- 网站上没有具名人员.*E-E-A-T/);
});
