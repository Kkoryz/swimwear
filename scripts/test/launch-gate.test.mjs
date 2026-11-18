// The launch gate's owner-pack holds (four-site audit 2026-11-17, Fable's plan G-1): Site Factory's launch reasons
// reach the sign-off, and the checklist sends each hold to who clears it.
import assert from 'node:assert/strict';
import test from 'node:test';

import { checklistMarkdown } from '../lib/launch-checklist.mjs';
import { mergeProofItems, ownerTodoItems } from '../proof-signoff.mjs';

const todo = (items) => ({ schema_version: 'sf/handoff-owner-todo/v1', items, counts: {} });

test('an owner to-do item with a launch reason is a sign-off item whether or not Site Factory marks it blocking', () => {
  const items = ownerTodoItems(todo([
    { id: 'OT-1', type: 'confirm', blocking: false, text: 'Influencer marketing', reason: 'scope_unconfirmed', page_id: 'svc' },
    { id: 'OT-2', type: 'supply', blocking: false, text: 'Minimum contract term', reason: 'needs_owner_number' },
    { id: 'OT-3', type: 'confirm', blocking: false, text: 'Optional photo' },
    { id: 'OT-4', type: 'replace', blocking: true, text: 'Founding year' },
  ]));
  assert.deepEqual(items.map((item) => [item.id, item.reason ?? null]), [['sf-OT-1', 'scope_unconfirmed'], ['sf-OT-2', 'needs_owner_number'], ['sf-OT-4', null]]);
  // A confirmed answer stays confirmed when Site Factory sends the item again.
  const signoff = { items: [{ ...items[1], status: 'confirmed' }] };
  const merged = mergeProofItems(signoff, {}, [], todo([{ id: 'OT-2', type: 'supply', blocking: false, text: 'Minimum contract term', reason: 'needs_owner_number' }]));
  assert.deepEqual(merged.items.map((item) => [item.id, item.status, item.reason]), [['sf-OT-2', 'confirmed', 'needs_owner_number']]);
});

test('the checklist sends the owner-pack holds to the owner and an LLM audit finding to the one it names', () => {
  const gate = { status: 'blocked', checkedAt: 'now', notices: [], holds: [
    { code: 'owner_pack_missing', detail: 'legal_entity: x', items: ['legal_entity'] },
    { code: 'scope_unconfirmed', detail: 'sf-OT-1: x' },
    { code: 'needs_owner_number', detail: 'sf-OT-2: x' },
    { code: 'claude_seo_audit_blocking:site-factory', detail: 'F3: the page promises a PDF', items: ['/resources/'] },
    { code: 'nginx_csp_stale', detail: 'x', items: ['/'] },
  ] };
  const text = checklistMarkdown(gate, { seo: { failures: [{ route: '/request-a-quote/', issue: 'cta_target_without_form', detail: 'no <form>; linked from /' }], warnings: [] } });
  const section = (title) => text.split('## ').find((part) => part.startsWith(title)) ?? '';
  assert.match(section('站长'), /业主资料包缺项[\s\S]*服务项[\s\S]*本人数字/);
  assert.match(section('站长'), /（3）/);
  assert.match(section('Site Factory'), /claude-seo 审计[\s\S]*F3: the page promises a PDF/);
  assert.match(section('模板流程'), /内容安全策略[\s\S]*询价按钮指向的页面.*cta_target_without_form/);
});
