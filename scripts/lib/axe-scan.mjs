// The accessibility-tree scan of the layout audit (audit-authoring-layout.mjs; four-site audit 2026-11-17, Fable's
// plan A4): axe-core (MPL-2.0, a dev dependency used unmodified, injected into the audit's browser only, never into
// dist; Lighthouse bundles the same library) run in the built page with only the 33 rules Lighthouse's Agentic
// Browsing audit agent-accessibility-tree runs (Lighthouse 13.5.0 core/audits/agentic; claude-seo
// skills/seo-agentic/references/lighthouse-agentic-category.md, verified 2026-09-23). An agent that browses reads the
// page through this tree: controls with names, valid roles and ARIA, nothing focusable hidden from it. Colour contrast,
// heading order and landmarks are not in the set (the audit measures contrast itself, lib/contrast.mjs). A violation
// axe rates critical or serious fails the page; a moderate or minor one is reported.

import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';

export const AGENT_TREE_RULES = Object.freeze(['button-name', 'input-button-name', 'input-image-alt', 'label', 'link-name', 'select-name', 'document-title', 'aria-allowed-attr', 'aria-allowed-role', 'aria-command-name', 'aria-conditional-attr', 'aria-dialog-name', 'aria-hidden-body', 'aria-hidden-focus', 'aria-input-field-name', 'aria-prohibited-attr', 'aria-required-attr', 'aria-required-children', 'aria-required-parent', 'aria-roles', 'aria-text', 'aria-toggle-field-name', 'aria-tooltip-name', 'aria-treeitem-name', 'aria-valid-attr', 'aria-valid-attr-value', 'duplicate-id-aria', 'definition-list', 'table-duplicate-name', 'tabindex', 'autocomplete-valid', 'presentation-role-conflict', 'svg-img-alt']);
export const AXE_FAIL_IMPACTS = Object.freeze(['critical', 'serious']);
// The elements of one violation kept in the report.
const NODES_KEPT = 5;

let source = null;
// axe-core's browser bundle, read once a process.
export async function axeSource() {
  source ??= await readFile(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
  return source;
}

// The scan of a Playwright page as it is: [{ rule, impact, help, nodes: [{ target, html }] }].
export async function scanAgentTree(page) {
  await page.addScriptTag({ content: await axeSource() });
  return page.evaluate(async (rules) => {
    const result = await globalThis.axe.run(document, { runOnly: { type: 'rule', values: rules }, resultTypes: ['violations'] });
    return result.violations.map((violation) => ({ rule: violation.id, impact: violation.impact ?? null, help: violation.help, nodes: violation.nodes.map((node) => ({ target: node.target.join(' '), html: node.html.slice(0, 160) })) }));
  }, [...AGENT_TREE_RULES]);
}

// The page's WebMCP declarative tools (lib/lead-form.mjs formTool, Fable's plan A7), in the page: [{ form, name,
// described, autosubmit, missing: [control names without toolparamdescription] }]: a form with toolname or
// tooldescription is a tool, and all its named controls then need a description (annotate fully or not at all).
export function measureToolForms() {
  return [...document.querySelectorAll('form')].filter((form) => form.hasAttribute('toolname') || form.hasAttribute('tooldescription')).map((form, index) => ({
    form: form.getAttribute('toolname') || `form ${index + 1}`,
    named: Boolean(form.getAttribute('toolname')?.trim()),
    described: Boolean(form.getAttribute('tooldescription')?.trim()),
    autosubmit: form.hasAttribute('toolautosubmit'),
    missing: [...form.elements].filter((control) => control.name && !control.matches('button, fieldset') && !control.getAttribute('toolparamdescription')?.trim()).map((control) => control.name),
  }));
}
// A tool form annotated in part, or one that submits itself: [{ issue: 'webmcp_partial', ... }] (failures).
export const toolFormProblems = (forms = []) => (forms ?? []).filter((form) => !form.named || !form.described || form.autosubmit || form.missing.length).map((form) => ({ issue: 'webmcp_partial', form: form.form, ...(form.named && form.described ? {} : { value: 'toolname and tooldescription both needed' }), ...(form.autosubmit ? { autosubmit: true } : {}), ...(form.missing.length ? { missing: [...new Set(form.missing)] } : {}) }));

// The audit's findings of one scan: { failures, warnings }, one per rule, its first elements named.
export function axeProblems(violations = []) {
  const failures = [];
  const warnings = [];
  for (const violation of violations ?? []) {
    const finding = { issue: AXE_FAIL_IMPACTS.includes(violation.impact) ? 'agent_tree' : 'agent_tree_minor', rule: violation.rule, impact: violation.impact, help: violation.help, count: violation.nodes.length, nodes: violation.nodes.slice(0, NODES_KEPT) };
    (finding.issue === 'agent_tree' ? failures : warnings).push(finding);
  }
  return { failures, warnings };
}
