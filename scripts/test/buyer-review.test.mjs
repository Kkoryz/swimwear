import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { BUYER_RULES, buyerCurrent, buyerKey, judgeReviews } from '../design-review.mjs';
import { FLOW_PARTS } from '../lib/launch-flow.mjs';

const page = { key: 'solution', pageType: 'solution', route: '/airbnb-co-hosting/', shots: 's1', rules: 'r1', buyerRules: 'b1', images: ['a.png'], ownImages: ['o.png'] };
const review = (shots, rules, findings = []) => ({ shots, rules, findings });

test("the design gate holds each page's buyer review beside its review against the competitor (owner 2026-11-18)", () => {
  assert.equal(buyerKey(page), 'solution.buyer');
  const manifest = { pages: [page] };
  // Without the buyer's review the gate waits; the style board's gate (buyer: false) does not ask for one.
  assert.deepEqual(judgeReviews(manifest, { solution: review('s1', 'r1') }, [], [], { buyer: true }).missing, ['solution.buyer']);
  assert.equal(judgeReviews(manifest, { solution: review('s1', 'r1') }).status, 'passed');
  // Held to the buyer's own instructions: new shots or new instructions with an open P0 send it back.
  assert.equal(buyerCurrent(page, review('s1', 'b1')), true);
  assert.equal(buyerCurrent(page, review('s0', 'b1')), false);
  const open = [{ block: 'hero', viewport: 'mobile', severity: 'P0', scope: 'site', issue: 'a nine-field form fills the first screen' }];
  assert.equal(buyerCurrent(page, review('s1', 'b0', open)), false);
  // Its findings join the review's, marked as the buyer's, and an open P0 of the site holds the gate.
  const judged = judgeReviews(manifest, { solution: review('s1', 'r1'), 'solution.buyer': review('s1', 'b1', open) }, [], [], { buyer: true });
  assert.equal(judged.status, 'open');
  assert.deepEqual(judged.findings.map((finding) => [finding.review, finding.lens, finding.block]), [['solution.buyer', 'buyer', 'hero']]);
});

test('the buyer review runs on our pages alone, between the design review and its gate', async () => {
  const run = await readFile(new URL('../site-run.mjs', import.meta.url), 'utf8');
  assert.match(run, /\{ id: 'buyer-review', kind: 'agent', skip: flowSkipOf\('buyer-review'\), prompt: 'buyer-review'/);
  assert.match(run, /images: \(page\.ownImages \?\? \[\]\)\.map\(\(path\) => resolve\(root, path\)\)/);
  assert.ok(run.indexOf("id: 'design-review'") < run.indexOf("id: 'buyer-review'") && run.indexOf("id: 'buyer-review'") < run.indexOf("id: 'design-gate'"));
  assert.deepEqual(FLOW_PARTS.design, ['design-shots', 'design-review', 'buyer-review', 'design-gate', 'design-polish']);
  const prompt = await readFile(new URL(`../../${BUYER_RULES[0]}`, import.meta.url), 'utf8');
  assert.match(prompt, /There is no other site to compare with/);
  assert.doesNotMatch(prompt, /\{\{siteRules\}\}|COMPETITOR/);
  // The shots keep our page alone beside the side-by-side images.
  const review = await readFile(new URL('../design-review.mjs', import.meta.url), 'utf8');
  assert.match(review, /const name = `\$\{page\.key\}-own-\$\{viewport\.id\}-\$\{index \+ 1\}\.png`;/);
});
