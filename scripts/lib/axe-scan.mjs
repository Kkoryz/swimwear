// The accessibility-tree scan of the layout audit (audit-authoring-layout.mjs; four-site audit 2026-11-17, Fable's
// plan A4): axe-core (MPL-2.0, a dev dependency used unmodified, injected into the audit's browser only, never into
// dist; Lighthouse bundles the same library) run in the built page with only the 33 rules Lighthouse's Agentic
// Browsing audit agent-accessibility-tree runs (Lighthouse 13.5.0 core/audits/agentic; claude-seo
// skills/seo-agentic/references/lighthouse-agentic-category.md, verified 2026-09-23). An agent that browses reads the
// page through this tree: controls with names, valid roles and ARIA, nothing focusable hidden from it. Colour contrast,
// heading order and landmarks are not in the set (the audit measures contrast itself, lib/contrast.mjs). A violation
// axe rates critical or serious fails the page; a moderate or minor one is reported.
// The same run also checks the page against axe's whole WCAG 2.2 A/AA set and its best practices (site audit
// 2026-11-19: the 33 rules missed a link name unlike its words, links told apart by colour alone, two navigations of one
// name and an aria-label on a div), colour contrast left out (lib/contrast.mjs measures it over photos too): a WCAG
// violation axe rates critical or serious fails the page, any other violation is reported, and so is every element
// axe could not decide (its incomplete results: aria-prohibited-attr, link-in-text-block), for a person to look at.

import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';

export const AGENT_TREE_RULES = Object.freeze(['button-name', 'input-button-name', 'input-image-alt', 'label', 'link-name', 'select-name', 'document-title', 'aria-allowed-attr', 'aria-allowed-role', 'aria-command-name', 'aria-conditional-attr', 'aria-dialog-name', 'aria-hidden-body', 'aria-hidden-focus', 'aria-input-field-name', 'aria-prohibited-attr', 'aria-required-attr', 'aria-required-children', 'aria-required-parent', 'aria-roles', 'aria-text', 'aria-toggle-field-name', 'aria-tooltip-name', 'aria-treeitem-name', 'aria-valid-attr', 'aria-valid-attr-value', 'duplicate-id-aria', 'definition-list', 'table-duplicate-name', 'tabindex', 'autocomplete-valid', 'presentation-role-conflict', 'svg-img-alt']);
export const AXE_FAIL_IMPACTS = Object.freeze(['critical', 'serious']);
// axe's tags of WCAG 2.0, 2.1 and 2.2 at levels A and AA, and its best practices: the full scan's set.
export const WCAG_TAGS = Object.freeze(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']);
export const FULL_SCAN_TAGS = Object.freeze([...WCAG_TAGS, 'best-practice']);
// Measured by the audit itself (lib/contrast.mjs), over photos as well.
export const FULL_SCAN_OFF = Object.freeze(['color-contrast']);
// The elements of one violation kept in the report.
const NODES_KEPT = 5;

let source = null;
// axe-core's browser bundle, read once a process.
export async function axeSource() {
  source ??= await readFile(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
  return source;
}

// The scan of a Playwright page as it is: [{ rule, impact, help, nodes: [{ target, html }] }], the 33 rules only.
export async function scanAgentTree(page) {
  return (await scanAccessibility(page, { full: false })).violations;
}

// The scan of a Playwright page as it is, in one axe run: { violations, incomplete }, each [{ rule, impact, help, tags
// (its WCAG and best-practice tags), nodes: [{ target, html }] }]. full: the 33 rules and the full set (FULL_SCAN_TAGS
// without FULL_SCAN_OFF); else the 33 rules only, violations only.
export async function scanAccessibility(page, { full = true } = {}) {
  await page.addScriptTag({ content: await axeSource() });
  return page.evaluate(async ({ rules, full, tags, off }) => {
    // A rule's own switch wins over the tag set in axe: the 33 rules all run whatever their tags, the rules off do not.
    const options = full
      ? { runOnly: { type: 'tag', values: tags }, rules: Object.fromEntries([...rules.map((rule) => [rule, { enabled: true }]), ...off.map((rule) => [rule, { enabled: false }])]), resultTypes: ['violations', 'incomplete'] }
      : { runOnly: { type: 'rule', values: rules }, resultTypes: ['violations'] };
    const result = await globalThis.axe.run(document, options);
    const slim = (item) => ({ rule: item.id, impact: item.impact ?? null, help: item.help, tags: item.tags.filter((tag) => /^wcag\d|^best-practice$/.test(tag)), nodes: item.nodes.map((node) => ({ target: node.target.join(' '), html: node.html.slice(0, 160) })) });
    return { violations: result.violations.map(slim), incomplete: full ? result.incomplete.map(slim) : [] };
  }, { rules: [...AGENT_TREE_RULES], full, tags: [...FULL_SCAN_TAGS], off: [...FULL_SCAN_OFF] });
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

// The audit's findings of one scan (scanAccessibility's { violations, incomplete }, or the 33 rules' violations):
// { failures, warnings }, one per rule, its first elements named. A violation of the 33 rules is agent_tree (critical
// or serious) or agent_tree_minor; any other is axe_wcag (a WCAG rule, critical or serious: a failure), axe_wcag_minor
// or axe_best_practice; an element axe could not decide is axe_incomplete (reported).
export function axeProblems(scan = []) {
  const { violations = [], incomplete = [] } = Array.isArray(scan) ? { violations: scan } : scan ?? {};
  const failures = [];
  const warnings = [];
  const issueOf = (violation) => {
    const serious = AXE_FAIL_IMPACTS.includes(violation.impact);
    if (AGENT_TREE_RULES.includes(violation.rule)) return serious ? 'agent_tree' : 'agent_tree_minor';
    if (!(violation.tags ?? []).some((tag) => WCAG_TAGS.includes(tag))) return 'axe_best_practice';
    return serious ? 'axe_wcag' : 'axe_wcag_minor';
  };
  const finding = (issue, item) => ({ issue, rule: item.rule, impact: item.impact, help: item.help, count: item.nodes.length, nodes: item.nodes.slice(0, NODES_KEPT) });
  for (const violation of violations ?? []) {
    const issue = issueOf(violation);
    (['agent_tree', 'axe_wcag'].includes(issue) ? failures : warnings).push(finding(issue, violation));
  }
  for (const item of incomplete ?? []) warnings.push(finding('axe_incomplete', item));
  return { failures, warnings };
}
