// Preflight checks before a release goes out: SEO drift, the owner's other sites, the server config, the SEO audit.
import { ownConfigFiles } from '../nginx-config.mjs';
import { snippetPolicy, unallowedScripts } from '../csp.mjs';
import { OWNER_GROUP, auditHolds, auditOpen } from '../claude-seo-audit.mjs';
import { builtPages, found, nginxHost } from './findings.mjs';

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
  { code: 'claude_seo_audit_missing', level: 'hold', run: (ctx) => {
    const audit = ctx.claudeSeoAudit;
    if (!audit) return null;
    if (!audit.latest) return { detail: 'no claude-seo audit of a release build (docs/research/seo-audit-N/findings.json): run site-run through its claude-seo-audit step, or node scripts/claude-seo-audit.mjs after pnpm build:release' };
    // The same build: the same files and config; or, should a build not come out byte for byte the same, the same
    // sources (lib/verified-build.mjs sourceHash) and the same server config.
    const { release, sources } = audit.latest.data;
    const same = release?.key === audit.release?.key || (Boolean(sources) && sources === audit.sources && release?.server === audit.release?.server);
    return !same && { detail: `${audit.latest.dir} audited another release build or server config (${audit.latest.data.release?.key} vs ${audit.release?.key ?? 'no build in dist/'}): audit this build` };
  } },
  { code: 'claude_seo_audit_blocking', level: 'hold', run: (ctx) => (ctx.claudeSeoAudit?.latest ? auditHolds(ctx.claudeSeoAudit.latest) : []).map((item) => ({ code: `claude_seo_audit_blocking:${OWNER_GROUP[item.owner]}`, detail: `${item.id} [${item.severity}] ${item.problem} 改法：${item.fix}${item.reported_by?.length ? ` 报出：${item.reported_by.join('、')}` : ''} (${ctx.claudeSeoAudit.latest.dir}/findings.json)`, items: [item.url, ...(item.pages ?? [])] })) },
  { code: 'claude_seo_audit_open', level: 'notice', run: (ctx) => found(`findings of the claude-seo audit that do not hold the launch (medium and low; critical and high ones code or the verification did not confirm): ${ctx.claudeSeoAudit?.latest?.dir}/findings.json`, ctx.claudeSeoAudit?.latest ? auditOpen(ctx.claudeSeoAudit.latest).map((item) => `${item.id} [${item.severity}] ${item.problem} (${item.owner})`) : []) },
  // The stage 10 SEO audit on this build.
  { code: 'seo_audit_failed', level: 'hold', run: (ctx) => ctx.seoAuditError !== null && { detail: ctx.seoAuditError } },
];
