import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { importSiteFactory } from '../import-site-factory.mjs';
import { validateAuthoringPages } from '../lib/authoring-contract.mjs';
import { collectionMismatch, dataPractices, siteForms } from '../lib/data-practices.mjs';
import { leadFormBlock, resourceFormBlock } from '../lib/lead-form.mjs';
import { placeRequiredBlocks, sourceItem } from '../lib/page-assembly.mjs';
import { COLLECTION_CHECKS, collectionProblems } from '../lib/preflight/collection-checks.mjs';
import { handoffProblems } from '../lib/sf-handoff.mjs';
import { SITE_COLLECTION_PATH, collectionSha256, siteCollection, siteCollectionText } from '../lib/site-collection.mjs';
import { proofSignoffItems } from '../lib/site-proof.mjs';
import { demoProof, packagePrivacy, withFacts } from '../scaffold-site-proof.mjs';

// Site Factory integ deb67119 (2026-11-17): the privacy page's table comes in the package (data_practices), built from
// 08's collection contract config/site-collection.json; the handoff names that file's sha256.
const committed = () => readFile(new URL(`../../${SITE_COLLECTION_PATH}`, import.meta.url), 'utf8');
const everythingOn = { analytics: { provider: 'umami', scriptSrc: 'https://stats.example.org/script.js', websiteId: 'w' }, chat: { chatwoot: { baseUrl: 'https://chat.example.org', inboxIdentifier: 'i' }, whatsapp: [{ number: '8613800000000' }] }, newsletter: { provider: 'listmonk' } };
const rowsOf = (items) => items.map(({ id, what, recorded, why }) => ({ id, what, recorded, why }));

// Site Factory's reading of the contract (contracts/copy_07.py collection_switches and collection_rows, deb67119): the
// defaults, the resources page's switch, project.yaml site_services over them; an item on when "always" or when every
// switch of its `when` has that value.
function sfRows(contract, siteServices = {}, resourcesPage = false) {
  const switches = { ...contract.defaults, resource_form: resourcesPage, ...siteServices };
  const on = (when) => when === 'always' || (when && typeof when === 'object' && Object.entries(when).every(([key, value]) => switches[key] === value));
  return rowsOf(contract.items.filter((item) => on(item.when)));
}

test('the exported collection contract is the file in config/, and its rows are dataPractices()\'s word for word', async () => {
  const text = await committed();
  assert.equal(text.replace(/\r\n/g, '\n'), siteCollectionText(), 'config/site-collection.json is current: run node scripts/export-site-collection.mjs');
  const contract = JSON.parse(text);
  assert.equal(contract.schemaVersion, 'site-collection/v1');
  assert.deepEqual(contract.defaults, { analytics: 'umami', chat: 'none', whatsapp: false, newsletter: false });
  assert.deepEqual(contract.items.map((item) => item.id), ['enquiry-form', 'enquiry-context', 'resource-request', 'analytics', 'chat', 'whatsapp', 'newsletter']);
  assert.ok(contract.items.every((item) => (item.when === 'always' || (item.when && typeof item.when === 'object')) && Array.isArray(item.labels)));
  assert.deepEqual(contract.items.find((item) => item.id === 'resource-request').when, { resource_form: true });
  // Every service on: the export's rows are the module's rows, in its order.
  const { form, resourceForm } = { form: leadFormBlock('form', undefined, { kind: 'product' }), resourceForm: resourceFormBlock('resource-request', ['Rate guide']) };
  assert.deepEqual(rowsOf(contract.items), dataPractices({ form, resourceForm, runtime: everythingOn }).items);
  assert.deepEqual(dataPractices({ form, resourceForm, runtime: everythingOn }).rows, contract.items.map((item) => [item.what, item.recorded, item.why]));
  // The resource request form's optional note reads as English (was "your anything else if you give it").
  const resource = contract.items.find((item) => item.id === 'resource-request').recorded;
  assert.doesNotMatch(resource, /your anything else/);
  assert.match(resource, /^Your name, email and which resource; anything else you tell us, and that you agreed to this use;/);
  // Site Factory's own sentences are carried, so its byte copy keeps them; the fingerprint is the LF bytes' (as SF takes it).
  assert.equal(contract.site_facts.privacy_retention, 'We keep the details sent through this website for {retention}.');
  assert.equal(collectionSha256(text), collectionSha256(text.replace(/\n/g, '\r\n')));
  assert.deepEqual(siteCollection(), contract);
});

test('Site Factory\'s switches over the contract give the rows this site\'s runtime gives, whatever is on', async () => {
  const contract = JSON.parse(await committed());
  const form = leadFormBlock('form', undefined, { kind: 'product' });
  const resourceForm = resourceFormBlock('resource-request');
  const cases = [
    [{}, false, { analytics: { provider: 'umami' }, chat: false }, null],
    [{}, true, { analytics: { provider: 'umami' } }, resourceForm],
    [{ chat: 'chatwoot', whatsapp: true, newsletter: true }, true, everythingOn, resourceForm],
    [{ analytics: 'none', whatsapp: true }, false, { chat: { whatsapp: [{ number: '1' }] } }, null],
  ];
  for (const [services, resourcesPage, runtime, resource] of cases) assert.deepEqual(sfRows(contract, services, resourcesPage), dataPractices({ form, resourceForm: resource, runtime }).items, JSON.stringify(services));
});

const practices = (rows, extra = {}) => ({ rows, retention: '', contact: 'info@strandmill.com', placeholder: true, ...extra });
const ownRows = (runtime = { analytics: { provider: 'umami' } }) => dataPractices({ form: leadFormBlock('form', undefined, { kind: 'product' }), runtime }).items;

test('the privacy page shows the package\'s table when it gives one, and a page holding a table gets no second one', () => {
  const planned = { page_type: 'privacy', url: '/privacy-policy/', label: 'Privacy Policy' };
  const given = practices(ownRows(), { retention: '12 months', quote: 'ignored' });
  const blocks = [{ id: 'policy', type: 'intro', heading: 'Privacy', paragraphs: ['Text.'] }];
  const mapping = [];
  placeRequiredBlocks(blocks, mapping, { planned, practices: given });
  assert.deepEqual(blocks.map((block) => block.type), ['intro', 'dataPractices']);
  assert.deepEqual(blocks[1].practices, { rows: ownRows(), retention: '12 months', contact: 'info@strandmill.com', placeholder: true });
  assert.match(mapping[0].rule, /data_practices/);
  assert.deepEqual(validateAuthoringPages([{ id: 'p', route: '/privacy-policy/', pageType: 'privacy', status: 'authored', seo: { title: 'T', description: 'D', canonical: '/privacy-policy/' }, jsonLd: [], hero: { heading: 'H' }, blocks }]), []);
  // A table already on the page: none added (the privacy page holds one table), with or without the package's.
  for (const withPractices of [given, null]) {
    const tabled = [{ id: 'policy', type: 'intro', paragraphs: ['Text.'] }, { id: 'kept', type: 'table', columns: ['A', 'B'], rows: [['1', '2']] }];
    const noted = [];
    placeRequiredBlocks(tabled, noted, { planned, practices: withPractices });
    assert.deepEqual(tabled.map((block) => block.type), ['intro', 'table']);
    assert.equal(noted[0].blockType, null);
  }
  // An older package gives none: the block is written from the configuration, as before.
  const old = [{ id: 'policy', type: 'intro', paragraphs: ['Text.'] }];
  placeRequiredBlocks(old, [], { planned });
  assert.equal(old[1].practices, undefined);
});

test('the renderer shows the package\'s rows, retention and contact as given (an empty retention states no period)', async () => {
  const markup = await readFile(new URL('../../src/components/blocks/DataPracticesBlock.astro', import.meta.url), 'utf8');
  assert.match(markup, /given\.rows\.map\(\(row\) => \[row\.what, row\.recorded, row\.why\]\), retention: given\.retention \|\| null, contact: given\.contact \|\| null/);
});

test('a package table that is not what the site collects holds the release (collection_mismatch)', () => {
  const page = (rows) => ({ route: '/privacy-policy/', pageType: 'privacy', blocks: [{ id: 'data-practices', type: 'dataPractices', practices: practices(rows) }] });
  const runtime = { analytics: { provider: 'umami' } };
  assert.deepEqual(collectionProblems({ pages: [page(ownRows())], runtime }), []);
  // The package lists live chat the site does not run, and a row's words differ.
  const chat = ownRows(everythingOn).find((row) => row.id === 'chat');
  const changed = ownRows().map((row) => (row.id === 'enquiry-form' ? { ...row, why: 'To sell you things' } : row));
  const problems = collectionProblems({ pages: [page([...changed, chat])], runtime });
  assert.equal(problems.length, 1);
  assert.deepEqual(problems[0].items, ['/privacy-policy/']);
  assert.match(problems[0].detail, /row 1 why: "To sell you things", the site's "To answer your enquiry"/);
  assert.match(problems[0].detail, /row 4: the table lists chat \(Live chat\), the site does not collect it/);
  assert.deepEqual(collectionMismatch([], ownRows()).length, 3);
  // A resource form on a page of the site turns its row on; a page without the package's table is not checked.
  const resourcePage = { route: '/resources/', pageType: 'general', blocks: [resourceFormBlock('resource-request')] };
  assert.equal(siteForms([resourcePage]).resourceForm.request, 'resource');
  assert.equal(collectionProblems({ pages: [page(ownRows()), resourcePage], runtime }).length, 1);
  assert.deepEqual(collectionProblems({ pages: [{ route: '/privacy-policy/', blocks: [{ id: 'd', type: 'dataPractices' }] }], runtime }), []);
  assert.deepEqual(COLLECTION_CHECKS.map((check) => [check.code, check.level]), [['collection_mismatch', 'hold']]);
});

test('the handoff\'s site_collection_sha256 must be 08\'s own export; an older handoff or a null one is not checked', async () => {
  const ours = collectionSha256(await committed());
  const collectionIssues = async (contracts) => (await handoffProblems({ handoff: { schema_version: 'sf/handoff/v1', contracts }, authoringPackage: { schema_version: 'sf/authoring/v1' } })).filter((problem) => /site-collection/.test(problem));
  assert.deepEqual(await collectionIssues({ site_collection_sha256: ours }), []);
  assert.deepEqual(await collectionIssues({}), []);
  assert.deepEqual(await collectionIssues({ site_collection_sha256: null }), []);
  const wrong = await collectionIssues({ site_collection_sha256: '2'.repeat(64) });
  assert.equal(wrong.length, 1);
  assert.match(wrong[0], new RegExp(`site-collection 222222222222…, 08 exports ${ours.slice(0, 12)}`));
});

test('the privacy facts come from the package\'s table: no stand-in period, none when it states none; an older package keeps the stand-ins', async () => {
  const demo = JSON.parse(await readFile(new URL('../../config/demo-proof.json', import.meta.url), 'utf8'));
  const args = { demo, facts: new Map(), products: [], line: 'swimwear', seed: 'Strandmill', host: 'strandmill.com' };
  const made = demoProof({ ...args, practices: practices(ownRows()) });
  assert.deepEqual(made.privacy, { source: 'site-factory', contact: 'info@strandmill.com', placeholder: true });
  assert.deepEqual(packagePrivacy({ rows: [], retention: ' 18 months ', contact: '', placeholder: false }), { source: 'site-factory', retention: '18 months', placeholder: false });
  const old = demoProof(args);
  assert.deepEqual([old.privacy.retention, old.privacy.contact], [demo.privacy.retention, 'privacy@strandmill.com']);
  // A stand-in file of an earlier (older-package) import gives way to the package's facts on the next run.
  assert.deepEqual(withFacts(old, made).privacy, made.privacy);
  assert.equal(withFacts(old, old).privacy.retention, demo.privacy.retention);
  // Listed for sign-off until the owner has confirmed them in Site Factory; then not.
  assert.ok(proofSignoffItems(made).some((item) => item.id === 'proof-privacy' && /Site Factory project\.yaml privacy/.test(item.description)));
  assert.ok(!proofSignoffItems({ ...made, privacy: { ...made.privacy, placeholder: false } }).some((item) => item.id === 'proof-privacy'));
});

test('a cited source may have no title, a host for publisher, and when it was read; a fact may carry its sources', () => {
  assert.deepEqual(sourceItem({ url: 'https://www.ahla.com/report', title: '', publisher: 'ahla.com', retrieved: '2026-11-10', quote: '62% of hotels' }), { title: 'ahla.com', url: 'https://www.ahla.com/report', retrieved: '2026-11-10' });
  assert.deepEqual(sourceItem({ url: 'https://www.ahla.com/report', title: '  ', publisher: '' }), { title: 'ahla.com', url: 'https://www.ahla.com/report' });
  assert.deepEqual(sourceItem({ url: 'https://a.org/1', title: 'Report', publisher: 'AHLA' }), { title: 'Report', url: 'https://a.org/1', publisher: 'AHLA' });
  const cited = { url: 'https://www.ahla.com/report', title: '', publisher: 'ahla.com', retrieved: '2026-11-10', quote: '62% of hotels' };
  const page = {
    page_id: 'site:privacy', url: '/privacy/', title: 'Privacy', meta_description: 'How we handle details.', h1: 'Privacy Policy',
    sections: [{ section_id: 's1', heading: 'Who we are', body: 'We are a hotel management company.', fact_ids: ['f1'] }],
    links: [], cta: null, structured_data: [], release_status: 'ready_for_template', hold_reasons: [], notes: [],
    facts: [{ fact_id: 'f1', text: 'Hotel management company.', verification_status: 'verified', approved_public: true, sources: [cited] }],
    knowledge: [{ card_id: 'k1', title: 'Industry', sources: [cited] }], sources: [cited], footnotes: [{ section_id: 's1', sentence: 'We are a hotel management company.', refs: [1] }],
    data_practices: practices(ownRows()),
  };
  const plan = { pages: [{ page_id: 'site:privacy', page_type: 'privacy', label: 'Privacy Policy', url: '/privacy/' }], header_nav: [], footer_nav: [] };
  const { pages } = importSiteFactory({ authoringPackage: { schema_version: 'sf/authoring/v1', project: 't', pages: [page] }, pagesPlan: plan });
  const blocks = pages[0].blocks;
  assert.deepEqual(blocks.find((block) => block.type === 'sources').items, [{ title: 'ahla.com', url: 'https://www.ahla.com/report', retrieved: '2026-11-10' }]);
  assert.deepEqual(blocks.find((block) => block.type === 'dataPractices').practices.rows, ownRows());
  assert.deepEqual(validateAuthoringPages(pages), []);
});
