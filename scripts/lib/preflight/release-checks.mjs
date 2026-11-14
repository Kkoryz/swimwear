// Preflight checks before a release goes out: SEO drift, the owner's other sites, the server config, the SEO audit.
import { ownConfigFiles } from '../nginx-config.mjs';
import { found, nginxHost } from './findings.mjs';

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
  // The server config this release is served by: the live release symlink, and no config for another host.
  { code: 'nginx_config_missing', level: 'hold', run: (ctx) => ctx.nginx && !ctx.nginx.own && { detail: `no deploy/nginx/${nginxHost(ctx)}.conf (run pnpm build:nginx-config)` } },
  { code: 'nginx_root_not_live_release', level: 'hold', run: (ctx) => ctx.nginx?.own && !/^\s*root \S+\/current;/m.test(ctx.nginx.own) && { detail: `deploy/nginx/${nginxHost(ctx)}.conf does not serve <deploy_path>/current (run pnpm build:nginx-config)` } },
  { code: 'nginx_config_for_other_host', level: 'hold', run: (ctx) => ctx.nginx && found('deploy/nginx holds configs for another domain (run pnpm build:nginx-config)', ctx.nginx.configs.filter((file) => file.endsWith('.conf') && !ownConfigFiles(nginxHost(ctx)).includes(file))) },
  // The stage 10 SEO audit on this build.
  { code: 'seo_audit_failed', level: 'hold', run: (ctx) => ctx.seoAuditError !== null && { detail: ctx.seoAuditError } },
];
