import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { inlineParts, plainText } from '../lib/blog.mjs';
import { STANDARDS, linkStandards } from '../lib/standard-links.mjs';

const url = (id) => STANDARDS.find((standard) => standard.id === id).url;

test('each standard the copy names links once a page to its standard body, the words unchanged (four-site audit 2026-11-17, C7/G2)', () => {
  const blocks = [
    { id: 'overview', type: 'intro', heading: 'OEKO-TEX fabrics', paragraphs: ['Our fabrics carry OEKO-TEX® STANDARD 100 and GRS certificates.', 'Again OEKO-TEX® STANDARD 100, and WRAP-certified sewing.'] },
    { id: 'points', type: 'iconList', items: [{ text: 'An amfori BSCI audit every year; ISO 9001:2015 quality system.' }, { text: 'We wrap each piece in a bag.' }] },
    { id: 'faq', type: 'faq', items: [{ question: 'Do you hold GOTS?', answer: 'Yes, GOTS for organic cotton; bluesign® dyes.\nGRS again.' }] },
    { id: 'steps', type: 'process', steps: [{ heading: 'Check', text: 'RCS-certified yarn is checked.' }, 'A plain step naming SMETA'] },
  ];
  const before = JSON.stringify(blocks);
  const linked = linkStandards(blocks);
  assert.equal(JSON.stringify(blocks), before, 'the page\'s data is not changed');
  assert.equal(linked[0].paragraphs[0], `Our fabrics carry [OEKO-TEX® STANDARD 100](${url('oeko-tex-standard-100')}) and [GRS](${url('grs')}) certificates.`);
  // Once a page; the heading is never linked; a word of the copy that is no standard ("wrap") stays.
  assert.equal(linked[0].paragraphs[1], `Again OEKO-TEX® STANDARD 100, and [WRAP](${url('wrap')})-certified sewing.`);
  assert.equal(linked[0].heading, 'OEKO-TEX fabrics');
  assert.equal(linked[1].items[0].text, `An [amfori BSCI](${url('amfori-bsci')}) audit every year; [ISO 9001](${url('iso-9001')}):2015 quality system.`);
  assert.equal(linked[1].items[1].text, 'We wrap each piece in a bag.');
  assert.equal(linked[2].items[0].question, 'Do you hold GOTS?');
  assert.equal(linked[2].items[0].answer, `Yes, [GOTS](${url('gots')}) for organic cotton; [bluesign®](${url('bluesign')}) dyes.\nGRS again.`);
  assert.equal(linked[3].steps[0].text, `[RCS](${url('rcs')})-certified yarn is checked.`);
  assert.equal(linked[3].steps[1], 'A plain step naming SMETA');
  // The words read as before.
  for (const [index, block] of linked.entries()) for (const [key, value] of Object.entries(block)) if (key === 'paragraphs') assert.deepEqual(value.map(plainText), blocks[index].paragraphs);
  // The link renders as the copy's own inline links do.
  assert.deepEqual(inlineParts(linked[0].paragraphs[0])[1], { text: 'OEKO-TEX® STANDARD 100', href: url('oeko-tex-standard-100') });
});

test('a standard inside a link the copy already has, or inside another word, is left alone', () => {
  const blocks = [{ id: 'a', type: 'intro', paragraphs: ['See [our GRS fabrics](/fabrics/) and GRSX or BSCIs.', 'GRS here.'] }];
  assert.deepEqual(linkStandards(blocks)[0].paragraphs, ['See [our GRS fabrics](/fabrics/) and GRSX or BSCIs.', `[GRS](${url('grs')}) here.`]);
});

test('the table names each standard body\'s own page, no verification link, and the page renders the linked copy', async () => {
  const config = JSON.parse(await readFile(new URL('../../config/standard-bodies.json', import.meta.url), 'utf8'));
  assert.equal(config.schemaVersion, 'seo-site-standard-bodies-v1');
  for (const standard of config.standards) {
    assert.match(standard.url, /^https:\/\/[^/]+\//, standard.id);
    assert.doesNotMatch(standard.url, /verif|label-check|lookup|search|database/i, standard.id);
    assert.ok(standard.names.length && standard.body, standard.id);
  }
  for (const id of ['oeko-tex-standard-100', 'grs', 'rcs', 'bluesign', 'wrap', 'amfori-bsci', 'iso-9001', 'gots']) assert.ok(config.standards.some((standard) => standard.id === id), id);
  const view = await readFile(new URL('../../src/components/blocks/PageView.astro', import.meta.url), 'utf8');
  assert.match(view, /const blocks = linkStandards\(withMediaModules\(page, variants, \{ isBuilt \}\)\)/);
});

test("OEKO-TEX's ECO PASSPORT links to its own page, not to STANDARD 100 (Strandmill claude-seo audit 2026-11-17, M-6)", () => {
  const [block] = linkStandards([{ id: 'a', type: 'intro', paragraphs: ['Our fabrics carry OEKO-TEX® ECO PASSPORT, and the trims OEKO-TEX® Standard 100.'] }]);
  assert.equal(block.paragraphs[0], 'Our fabrics carry [OEKO-TEX® ECO PASSPORT](https://www.oeko-tex.com/en/our-standards/oeko-tex-eco-passport), and the trims [OEKO-TEX® Standard 100](https://www.oeko-tex.com/en/our-standards/oeko-tex-standard-100).');
});
