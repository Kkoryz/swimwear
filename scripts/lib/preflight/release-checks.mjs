// Preflight checks before a release goes out: SEO drift, the owner's other sites, the server config, the SEO audit.
import { ownConfigFiles } from '../nginx-config.mjs';
import { snippetPolicy, unallowedScripts } from '../csp.mjs';
import { FILES, OWNER_GROUP, auditHolds, auditOpen, standingCheck } from '../claude-seo-audit.mjs';
import { launchFlowModes } from '../launch-flow.mjs';
import { builtPages, found, nginxHost } from './findings.mjs';

// The claude-seo audit's issue list with the check that stands for this build (the audit's, or its recheck's); the
// audit's own when neither is of this build (claude_seo_audit_missing holds then).
const standing = (ctx) => { const audit = ctx.claudeSeoAudit.latest; return { findings: audit.findings, check: standingCheck(audit, ctx.claudeSeoAudit)?.check ?? audit.check }; };
const standingFile = (ctx) => (standingCheck(ctx.claudeSeoAudit.latest, ctx.claudeSeoAudit)?.kind === 'recheck' ? FILES.recheck : FILES.check);
const seoHolding = (ctx) => Boolean(ctx.claudeSeoAudit?.latest) && launchFlowModes(ctx.site ?? {}).seo_recheck !== 'report';
// What is missing of the audit for this build ({ detail, switchedOff? }), or null.
function auditGap(ctx) {
  const audit = ctx.claudeSeoAudit;
  if (!audit) return null;
  const modes = launchFlowModes(ctx.site ?? {});
  if (!audit.latest) return { detail: 'no claude-seo audit of a release build (docs/research/seo-audit-N/findings.json): run site-run through its claude-seo-audit step, or node scripts/claude-seo-audit.mjs after pnpm build:release', ...(modes.seo_audit === 'off' ? { switchedOff: 'site.json launchFlow.seo_audit is off' } : {}) };
  if (standingCheck(audit.latest, audit)) return null;
  return { detail: `${audit.latest.dir} audited another release build or server config (${audit.latest.data.release?.key} vs ${audit.release?.key ?? 'no build in dist/'}) and no recheck is of this one${audit.latest.recheck ? ` (its recheck: ${audit.latest.recheck.release?.key})` : ''}: recheck this build (site-run's seo-recheck step, or node scripts/claude-seo-recheck.mjs after pnpm build:release)`, ...(modes.seo_recheck !== 'block' ? { switchedOff: `site.json launchFlow.seo_recheck is ${modes.seo_recheck === 'off' ? 'off' : '"report"'}` } : {}) };
}

export const RELEASE_CHECKS = [
  // SEO drift from the last accepted baseline (pnpm seo:snapshot -- --accept after review or deploy). A removed page
  // that src/data/redirects.json sends on (301) or marks gone (410) has been handled.
  { code: 'seo_drift_critical', level: 'hold', run: (ctx) => {
    const handled = new Set(ctx.redirects.map((rule) => rule.from));
    const critical = ctx.drift.filter((change) => change.level === 'critical' && !(change.rule === 'page_removed' && handled.has(change.route)));
    return found('search-visible changes since the accepted baseline: review, then accept the new snapshot (a removed page needs a 301 or 410 in src/data/redirects.json)', critical.map((change) => `${change.route} ${change.rule} ${change.detail}`.trim()));
  } },
  // The owner's other sites (pnpm check:cross-site): a page that is a near-duplicate of another site's page reads as
  // a doorway or scaled content (Google spam policies). A check that has not run holds, like any other gate.
  { code: 'cross_site_not_checked', level: 'hold', run: (ctx) => !ctx.crossSite && { detail: 'not compared with the owner\'s other sites yet (pnpm check:cross-site)' } },
  { code: 'cross_site_duplicate', level: 'hold', run: (ctx) => ctx.crossSite && found(`pages nearly the same as a page on another of the owner's sites (similarity >= ${ctx.crossSite.threshold})`, ctx.crossSite.duplicates.map((item) => `${item.route} ~ ${item.host}${item.otherRoute} (${item.similarity})`)) },
  // The prelaunch checks (scripts/prelaunch.mjs, docs/research/prelaunch/summary.json): only a check site.json
  // prelaunch sets to "block" holds, with its issues; a report-only check never does, nor a summary not written yet.
  { code: 'prelaunch_blocked', level: 'hold', run: (ctx) => ctx.prelaunch?.status === 'blocked' && found('prelaunch checks set to "block" have issues (docs/research/prelaunch/summary.md)', ctx.prelaunch.checks.filter((check) => check.status === 'blocked').map((check) => `${check.check}: ${check.issues} issue(s), ${check.report}`)) },
  // The server config this release is served by: the live release symlink, and no config for another host.
  { code: 'nginx_config_missing', level: 'hold', run: (ctx) => ctx.nginx && !ctx.nginx.own && { detail: `no deploy/nginx/${nginxHost(ctx)}.conf (run pnpm build:nginx-config)` } },
  { code: 'nginx_root_not_live_release', level: 'hold', run: (ctx) => ctx.nginx?.own && !/^\s*root \S+\/current;/m.test(ctx.nginx.own) && { detail: `deploy/nginx/${nginxHost(ctx)}.conf does not serve <deploy_path>/current (run pnpm build:nginx-config)` } },
  { code: 'nginx_config_for_other_host', level: 'hold', run: (ctx) => ctx.nginx && found('deploy/nginx holds configs for another domain (run pnpm build:nginx-config)', ctx.nginx.configs.filter((file) => file.endsWith('.conf') && !ownConfigFiles(nginxHost(ctx)).includes(file))) },
  // The Content-Security-Policy the server sends (deploy/nginx/<host>-headers.conf) allows every inline script of this
  // build by its hash; a build whose inline scripts changed needs the snippet made and installed again, or the
  // browser blocks them (four-site audit 2026-11-17, Fable's plan T3).
  { code: 'nginx_csp_stale', level: 'hold', run: (ctx) => {
    if (!ctx.nginx?.own) return null;
    const policy = snippetPolicy(ctx.nginx.headers);
    if (!policy) return { detail: `deploy/nginx/${nginxHost(ctx)}-headers.conf sets no Content-Security-Policy (run pnpm build:nginx-config after pnpm build:release)` };
    const blocked = new Set(builtPages(ctx).flatMap(([page, html]) => unallowedScripts(policy, [html]).map(() => page.route)));
    return found(`inline scripts of this build the Content-Security-Policy does not allow (run pnpm build:nginx-config after pnpm build:release, then install deploy/nginx/${nginxHost(ctx)}-headers.conf on the server)`, [...blocked]);
  } },
  // The claude-seo audit of the release build (scripts/claude-seo-audit.mjs, site-run's claude-seo-audit step; owner
  // 2026-11-17: the pipeline's only model audit, on unless site.json says llmAudit: false). It must be of this
  // release build and its Nginx config; its critical and high items hold when code found their location in the build
  // and the verification confirmed them, each routed to who clears it; the other items are a notice; the score never
  // holds (owner 2026-11-17: the gate does not go by the score).
  // One audit a site (owner 2026-11-18): once the build changed after it, its recheck of this build
  // (scripts/claude-seo-recheck.mjs: each item that held, looked for again and verified again) stands for it.
  // A part the site switched off (site.json launchFlow) does not hold for what it would have made: no audit with
  // seo_audit off, no recheck of this build with seo_recheck off or "report"; they are notices then.
  { code: 'claude_seo_audit_missing', level: 'hold', run: (ctx) => { const gap = auditGap(ctx); return gap && !gap.switchedOff && { detail: gap.detail }; } },
  { code: 'claude_seo_audit_not_current', level: 'notice', run: (ctx) => { const gap = auditGap(ctx); return gap?.switchedOff && { detail: `${gap.detail} (${gap.switchedOff})` }; } },
  // The items that stand hold, unless site.json launchFlow.seo_recheck is "report" (then they are notices).
  { code: 'claude_seo_audit_blocking', level: 'hold', run: (ctx) => (seoHolding(ctx) ? auditHolds(standing(ctx)) : []).map((item) => ({ code: `claude_seo_audit_blocking:${OWNER_GROUP[item.owner]}`, detail: `${item.id} [${item.severity}] ${item.problem} 改法：${item.fix}${item.reported_by?.length ? ` 报出：${item.reported_by.join('、')}` : ''} (${ctx.claudeSeoAudit.latest.dir}/${standingFile(ctx)})`, items: [item.url, ...(item.pages ?? [])] })) },
  { code: 'claude_seo_audit_open', level: 'notice', run: (ctx) => found(`findings of the claude-seo audit that do not hold the launch (medium and low; critical and high ones code or the verification did not confirm, or fixed since${seoHolding(ctx) ? '' : '; site.json launchFlow.seo_recheck "report": none holds'}): ${ctx.claudeSeoAudit?.latest?.dir}/findings.json`, ctx.claudeSeoAudit?.latest ? (seoHolding(ctx) ? auditOpen(standing(ctx)) : ctx.claudeSeoAudit.latest.findings?.findings ?? []).map((item) => `${item.id} [${item.severity}] ${item.problem} (${item.owner})`) : []) },
  // The stage 10 SEO audit on this build.
  { code: 'seo_audit_failed', level: 'hold', run: (ctx) => ctx.seoAuditError !== null && { detail: ctx.seoAuditError } },
];
