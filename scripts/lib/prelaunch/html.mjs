// Prelaunch check html: every built page through html-validate (MIT, a dev dependency, pinned; no request sent) with
// its presets standard and document, the markup's validity: an aria-label on an element of no role (the blog's share
// chart, site audit 2026-11-19), a duplicate id, an element where the content model forbids it. require-sri is off: the
// build's stylesheets and scripts are its own, served from the same origin, which subresource integrity does not
// protect. An error is an issue, a warning information.

import { HtmlValidate, StaticConfigLoader } from 'html-validate';

export const HTML_VALIDATE_CONFIG = Object.freeze({ extends: ['html-validate:standard', 'html-validate:document'], rules: { 'require-sri': 'off' } });
// The messages kept for one page and rule: the rest are counted.
const PER_RULE = 5;

// pages: the site's pages; built: route -> the page's HTML. [{ level, kind: 'html', problem: rule, route, line, detail }].
export async function htmlFindings(pages, built, { config = HTML_VALIDATE_CONFIG } = {}) {
  const validator = new HtmlValidate(new StaticConfigLoader(config));
  const findings = [];
  for (const page of pages) {
    const html = built.get(page.route);
    if (!html) continue;
    const report = await validator.validateString(html, page.route);
    const byRule = new Map();
    for (const message of report.results.flatMap((result) => result.messages)) {
      const kept = byRule.get(message.ruleId) ?? [];
      byRule.set(message.ruleId, [...kept, message]);
    }
    for (const [rule, messages] of byRule) {
      for (const message of messages.slice(0, PER_RULE)) findings.push({ level: message.severity === 2 ? 'issue' : 'info', kind: 'html', problem: rule, route: page.route, line: message.line, detail: `${message.message} (line ${message.line}${message.selector ? `, ${message.selector}` : ''})` });
      if (messages.length > PER_RULE) findings.push({ level: messages.slice(PER_RULE).some((message) => message.severity === 2) ? 'issue' : 'info', kind: 'html', problem: rule, route: page.route, detail: `${messages.length - PER_RULE} more of this rule on the page` });
    }
  }
  return findings;
}
