import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { GAP_KINDS, rankGaps, siteGaps } from '../lib/template-gaps.mjs';

test('the gaps of each site are counted by the behaviour they miss; broken text and missed captures are left out', () => {
  const sectionModules = [
    { pageType: 'home', index: 3, module: 'owner:testimonials', why: 'GAP: a sliding testimonial card with dots', gap: 'carousel' },
    { pageType: 'home', index: 5, module: 'splitMedia:single', why: 'GAP: ???? ???' , gap: 'layout' },
    { pageType: 'about', index: 2, module: 'gallery:grid', why: 'GAP: image not downloaded, lazy', gap: 'other' },
    { pageType: 'about', index: 4, module: 'intro/proof', why: 'centred text' },
    { pageType: 'contact', index: 1, module: 'featureGrid:boxed', why: 'GAP: cards with icons and links' },
  ];
  const reviews = [{ pageType: 'about', findings: [{ block: 'owner-testimonials', viewport: 'mobile', severity: 'P1', scope: 'template', gap: 'carousel', issue: 'stacked cards' }, { block: 'hero', scope: 'site', issue: 'x' }] }];
  const { gaps, skipped } = siteGaps('swim', { sectionModules, reviews });
  assert.deepEqual(gaps.map((gap) => `${gap.kind} ${gap.source} ${gap.pageType}`), ['carousel modules home', 'unclassified modules contact', 'carousel review about']);
  assert.deepEqual(skipped.map((item) => item.reason), ['unreadable', 'missed capture']);
  // Two sites need a carousel: on the backlog; one site's icon links on one page: not yet.
  const ranked = rankGaps([...gaps, { site: 'gyknit', kind: 'carousel', source: 'review', pageType: 'home', where: 'x', text: 'y', severity: 'P2' }, { site: 'gyknit', kind: 'icon-links', source: 'modules', pageType: 'contact', where: 'x', text: 'y', severity: null }]);
  assert.deepEqual(ranked.map((row) => [row.kind, row.sites.length, row.pages, row.blocking, row.onBacklog]), [['carousel', 2, 3, 1, true], ['unclassified', 1, 1, 0, false], ['icon-links', 1, 1, 0, false]]);
});

test('a large layout the home or a content page of the competitor is built from holds the run until a person decides; small ones and other pages do not', async () => {
  const { HOLD_SHARE, largeLayoutGaps } = await import('../lib/template-gaps.mjs');
  // The hotel site's competitor home: 5,977 px, its full-width photo sections 1,081 and 984 px, a row of tiles 314 px.
  const heights = { home: [424, 816, 1081, 314, 915, 520, 984, 303, 620], about: [203, 327, 1066, 204, 314] };
  const inventory = { pages: Object.entries(heights).map(([pageType, list]) => ({ pageType, sections: list.map((height, index) => ({ index: index + 1, height })) })) };
  const gap = (pageType, index, kind = 'layout') => ({ pageType, index, module: 'figure', why: `GAP: section ${index}`, gap: kind });
  const sectionModules = [gap('home', 3), gap('home', 4), gap('home', 6, 'video'), gap('home', 7), gap('about', 3), { pageType: 'home', index: 1, module: 'intro/proof', why: 'text' }];
  assert.equal(HOLD_SHARE, 0.15);
  const large = largeLayoutGaps(sectionModules, inventory);
  // The two full-width photo sections (18% and 16%); the tiles (5%), a video gap and the about page's photo do not hold.
  assert.deepEqual(large.map((item) => [item.pageType, item.index, item.share, item.decision]), [['home', 3, 0.18, null], ['home', 7, 0.16, null]]);
  // A decision for this very judgment releases it; one for another text (a new judgment) or with no known decision does not.
  const decisions = [{ pageType: 'home', index: 3, why: 'GAP: section 3', decision: 'template', note: 'a photo with its button over the edge' }, { pageType: 'home', index: 7, why: 'GAP: an older text', decision: 'accept' }, { pageType: 'home', index: 7, why: 'GAP: section 7', decision: 'maybe' }];
  assert.deepEqual(largeLayoutGaps(sectionModules, inventory, decisions).map((item) => item.decision), ['template', null]);
  // The collector writes them for the person and says which still wait (site:run's step exits 2 on --hold).
  const { mkdir, mkdtemp, writeFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { collectTemplateGaps } = await import('../collect-template-gaps.mjs');
  const site = await mkdtemp(join(tmpdir(), 'gaps-hold-'));
  await mkdir(join(site, 'docs/research/analysis'), { recursive: true });
  await writeFile(join(site, 'docs/research/analysis/section-modules.json'), JSON.stringify(sectionModules));
  await writeFile(join(site, 'docs/research/pattern-inventory.json'), JSON.stringify(inventory));
  await writeFile(join(site, 'docs/research/template-gap-decisions.json'), JSON.stringify({ decisions }));
  const result = await collectTemplateGaps([site], { root: site });
  assert.deepEqual(result.held.map((item) => `${item.pageType} ${item.index}`), ['home 7']);
  assert.match(await readFile(join(site, 'docs/research/TEMPLATE_GAPS.md'), 'utf8'), /"index": 7,[\s\S]*"decision": "template \| accept"/);
});

test('the instructions that name a gap list exactly the behaviours the backlog counts', async () => {
  for (const file of ['config/agent-steps/modules.md', 'config/agent-steps/design-review.md']) {
    const text = await readFile(file, 'utf8');
    const listed = [...text.matchAll(/`([a-z-]+)`(?: \([^)]*\))?(?=[,.]| or)/g)].map((match) => match[1]).filter((word) => GAP_KINDS.includes(word));
    assert.deepEqual([...new Set(listed)], [...GAP_KINDS], file);
  }
});
