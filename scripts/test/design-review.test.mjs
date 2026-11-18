import assert from 'node:assert/strict';
import test from 'node:test';

test("a phone's fixed enquiry bar is hidden for the review's full-page shot (Staylumen 2026-11-17)", async () => {
  const { hideEnquiryBar } = await import('../design-review.mjs');
  const added = [];
  await hideEnquiryBar({ addStyleTag: async (tag) => { added.push(tag.content); } });
  assert.deepEqual(added, ['[data-enquiry-bar]{visibility:hidden!important}']);
});
