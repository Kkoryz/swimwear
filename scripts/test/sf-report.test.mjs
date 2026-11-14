import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import { byOwner, ownerOf } from '../lib/issue-owners.mjs';
import { SITE_CSS_ISSUES } from '../site-run.mjs';
import { siteFactoryIssues } from '../sf-report.mjs';

test('each audit failure has an owner: the stylesheet, Site Factory, or a template rule', () => {
  assert.equal(ownerOf('low_contrast'), 'site-css');
  assert.equal(ownerOf('unplaced_copy'), 'site-factory');
  assert.equal(ownerOf('heavy_crop'), 'template');
  assert.ok(SITE_CSS_ISSUES.includes('template_rule_overridden'), 'the run hands the repair agent what the table gives the stylesheet');
  assert.deepEqual(byOwner(['unplaced_copy', 'heavy_crop', 'unplaced_copy']), ["2 failure(s) for Site Factory's copy or plan (08 does not rewrite copy; docs/research/sf-report.md) (unplaced_copy)", '1 failure(s) for a rule of the template (heavy_crop)']);
});

test("08's report back to Site Factory gathers what is Site Factory's to fix, from every report that finds it", async () => {
  const issues = siteFactoryIssues({
    content: { issues: [{ route: '/services/', kind: 'hub_repeats_children', field: 'm2', why: 'repeats the child pages' }] },
    review: { findings: [{ route: '/', block: 'm3', scope: 'content', severity: 'P1', issue: 'The FAQ answers the same question twice' }, { route: '/', block: 'cta', scope: 'site', severity: 'P1', issue: 'x' }, { route: '/', block: 'm4', scope: 'content', severity: 'P2', issue: 'small' }] },
    imported: { overLength: [{ route: '/revenue-management/', sectionId: 'm11_2', kind: 'terms', component: 'proof', words: 102, maximum: 70 }] },
    layout: { failures: [{ route: '/a/', issue: 'unplaced_copy' }, { route: '/a/', issue: 'low_contrast' }] },
  });
  assert.deepEqual(issues.map((issue) => [issue.source, issue.kind]), [['content-audit', 'hub_repeats_children'], ['design-review', 'design_finding'], ['import', 'over_length'], ['layout-audit', 'unplaced_copy']]);
  assert.match(issues[2].detail, /102 words, the module holds 70/);
  // The report keeps to Site Factory's contract: its required fields.
  const schema = JSON.parse(await readFile(new URL('../../config/sf-contracts/handoff-report.schema.json', import.meta.url), 'utf8'));
  assert.deepEqual(schema.required, ['handoff_sha256', 'made_at', 'template', 'pages']);
});

test("the layout plan's report items of the copy reach Site Factory (headings over three lines, titles too long); a page whose pictures cannot reach the band does not", () => {
  const plan = { gate: { items: [
    { assertion: 'does_not_fit', owner: 'owner', gate: 'report', route: '/', block: 'page', detail: 'pictures reach 45%, 2 points short of 47%' },
    { assertion: 'section_heading_lines', owner: 'site-factory', gate: 'report', route: '/a/', block: 'm2', viewport: 'mobile', detail: '"A long heading": 5 lines' },
    { assertion: 'surface_repeat', owner: 'template', gate: 'fail', route: '/a/', block: 'm3', detail: 'x' },
  ] } };
  const issues = siteFactoryIssues({ plan });
  assert.deepEqual(issues.map((issue) => [issue.source, issue.kind, issue.route]), [['layout-plan', 'section_heading_lines', '/a/']]);
  assert.match(issues[0].detail, /mobile/);
});
