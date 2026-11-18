// Prelaunch check 5, technical (the built site and its config, no request sent):
// - structured_data: every JSON-LD block parses, and each node has what Google requires of its type
//   (lib/schema-rules.mjs errors; a placeholder value on a noindex page aside, as the stage 10 audit does);
// - form: every enquiry form of the build posts to the endpoint config/lead-form.json names, the contract's status is
//   not "not-connected", and the server config proxies the endpoint (deploy/nginx/<host>.conf: written by the release
//   step, so its absence is information before a launch build). Nothing is submitted: a "ready" form (live, its real
//   POST not tested yet) is information;
// - launch: only on a launch build (prelaunch.mjs --launch, or SITE_LAUNCH=1: the production release workflow): no
//   indexable page says noindex (meta robots, or an X-Robots-Tag in the server's headers), robots.txt lets crawlers in
//   and names the sitemap, the sitemap is there and lists only built pages, and the build is a release build (no
//   competitor files, no style board). A preview stays noindex (publish-preview.mjs), so a build not marked for launch
//   is not checked;
// - phone: the throttled phone LCP the layout audit measured (docs/research/authoring-layout-audit.json, lib/lab-lcp.mjs
//   limits), and the phone CLS of the latest claude-seo audit's measurements (lib/claude-seo-measure.mjs, its
//   measurements/site.json render: the release build it audited), by Core Web Vitals' limits (web.dev: good at most
//   0.1, poor over 0.25). A site without that audit has no CLS before launch (Lighthouse runs after it).

import { attribute, parsePage } from '../built-site.mjs';
import { LCP_FAIL_MS, LCP_WARN_MS } from '../lab-lcp.mjs';
import { schemaProblems } from '../schema-rules.mjs';
import { absoluteUrl, isIndexable, robotsAllows } from '../seo-head.mjs';

export const CLS_GOOD = 0.1;
export const CLS_POOR = 0.25;

export function structuredDataFindings(pages, built, { serviceArea = false } = {}) {
  const findings = [];
  for (const page of pages) {
    const html = built.get(page.route);
    if (!html) continue;
    for (const [index, block] of parsePage(html).jsonLd.entries()) {
      if (block.data === undefined) { findings.push({ level: 'issue', kind: 'structured_data', problem: 'json_ld_invalid', route: page.route, detail: `JSON-LD block ${index + 1} does not parse` }); continue; }
      for (const node of [block.data].flat()) {
        for (const problem of schemaProblems(node, { serviceArea })) {
          if (problem.level === 'warning' || (problem.issue === 'json_ld_placeholder' && !isIndexable(page))) continue;
          findings.push({ level: 'issue', kind: 'structured_data', problem: problem.issue, route: page.route, detail: problem.detail });
        }
      }
    }
  }
  return findings;
}

// form: config/lead-form.json; nginx: the site's server config text, or null.
export function formFindings(pages, built, form, nginx, { launch = false } = {}) {
  const findings = [];
  const endpoint = form?.endpoint ?? null;
  const status = form?.status ?? 'not-connected';
  const routes = [];
  for (const page of pages) {
    const html = built.get(page.route);
    for (const tag of html?.match(/<form\b[^>]*>/g) ?? []) {
      if (!/\sdata-form-status="/.test(tag) && !/\sdata-lead-form\b/.test(tag)) continue;
      routes.push(page.route);
      const action = attribute(tag, 'action');
      const method = (attribute(tag, 'method') ?? 'get').toLowerCase();
      if (!action) findings.push({ level: 'issue', kind: 'form', problem: 'no_action', route: page.route, detail: `a form with no action (status ${attribute(tag, 'data-form-status') ?? 'none'})` });
      else if (endpoint && action !== endpoint) findings.push({ level: 'issue', kind: 'form', problem: 'action_not_endpoint', route: page.route, detail: `posts to ${action}, config/lead-form.json names ${endpoint}` });
      if (action && method !== 'post') findings.push({ level: 'issue', kind: 'form', problem: 'not_post', route: page.route, detail: `method ${method}` });
    }
  }
  const pagesWith = [...new Set(routes)];
  if (!pagesWith.length) return findings;
  if (!endpoint) findings.push({ level: 'issue', kind: 'form', problem: 'no_endpoint', detail: 'config/lead-form.json names no endpoint' });
  if (status === 'not-connected') findings.push({ level: 'issue', kind: 'form', problem: 'not_connected', detail: `config/lead-form.json status not-connected: the forms on ${pagesWith.length} page(s) are shown disabled` });
  else if (status === 'ready') findings.push({ level: 'info', kind: 'form', problem: 'post_untested', detail: `the forms on ${pagesWith.length} page(s) post to ${endpoint}; no real POST tested on the server yet (status ready; set "connected" after one)` });
  if (endpoint?.startsWith('/') && nginx === null) findings.push({ level: launch ? 'issue' : 'info', kind: 'form', problem: 'server_config_missing', detail: 'no deploy/nginx/<host>.conf: nothing proxies the endpoint (pnpm build:nginx-config)' });
  else if (endpoint?.startsWith('/') && !nginx.includes(`location ${endpoint.replace(/[^/]+$/, '')}`) && !nginx.includes(`location ${endpoint}`) && !nginx.includes(`location = ${endpoint}`)) findings.push({ level: 'issue', kind: 'form', problem: 'endpoint_not_proxied', detail: `deploy/nginx config has no location for ${endpoint}` });
  return findings;
}

// files: { robots, sitemap, headers (the server's headers snippet or null), distHas(path) }.
export function launchFindings(pages, built, identity, files) {
  const findings = [];
  const add = (problem, detail, route = null) => findings.push({ level: 'issue', kind: 'launch', problem, ...(route ? { route } : {}), detail });
  for (const page of pages.filter(isIndexable)) {
    const html = built.get(page.route);
    if (html && /noindex/i.test(parsePage(html).robots ?? '')) add('indexable_noindex', 'an indexable page says noindex (a preview build?)', page.route);
  }
  if (/X-Robots-Tag[^;\n]*noindex/i.test(files.headers ?? '')) add('server_noindex', 'the server sends X-Robots-Tag noindex');
  if (!files.robots) add('robots_missing', 'no robots.txt in the build');
  else {
    if (!robotsAllows(files.robots, '*')) add('robots_disallow_all', 'robots.txt keeps crawlers out of the home page (User-agent: *)');
    const sitemapUrl = identity?.origin ? absoluteUrl(identity, '/sitemap.xml') : null;
    if (!/^sitemap:\s*\S+/im.test(files.robots)) add('robots_no_sitemap', 'robots.txt names no sitemap');
    else if (sitemapUrl && !files.robots.includes(`Sitemap: ${sitemapUrl}`)) add('robots_sitemap_other', `robots.txt does not name ${sitemapUrl}`);
  }
  if (!files.sitemap) add('sitemap_missing', 'no sitemap.xml in the build');
  else {
    const listed = [...files.sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1].trim());
    if (!listed.length) add('sitemap_empty', 'sitemap.xml lists no URL');
    const origin = identity?.origin ?? null;
    const unbuilt = origin ? listed.filter((url) => url.startsWith(origin) && !files.distHas(new URL(url).pathname)) : [];
    if (unbuilt.length) add('sitemap_unbuilt', `${unbuilt.length} URL(s) with no built page: ${unbuilt.slice(0, 3).join(' ')}`);
  }
  if (files.distHas('/media/reference/')) add('not_release_build', 'competitor files are in the build (pnpm build:release)');
  if (files.distHas('/style-board/')) add('not_release_build', 'the style board is in the build (pnpm build:release)');
  return findings;
}

// audit: docs/research/authoring-layout-audit.json, or null; seo: the latest claude-seo audit's { dir, render } (its
// measurements/site.json render rows), or null.
export function phoneFindings(audit, seo = null) {
  const loads = (audit?.results ?? []).filter((result) => result.viewport === 'mobile' && result.lcp);
  const findings = audit ? [] : [{ level: 'info', kind: 'phone', problem: 'not_measured', detail: 'no layout audit (docs/research/authoring-layout-audit.json): the phone LCP is measured by the audits step' }];
  findings.push(...loads.map(({ route, lcp }) => (lcp.ms === null || lcp.ms === undefined
    ? { level: 'info', kind: 'phone', problem: 'lcp_not_measured', route, detail: lcp.error ?? 'not measured' }
    : { level: lcp.ms > LCP_FAIL_MS ? 'issue' : 'info', kind: 'phone', problem: lcp.ms > LCP_FAIL_MS ? 'lcp_slow' : lcp.ms > LCP_WARN_MS ? 'lcp_needs_work' : 'lcp_good', route, ms: lcp.ms, element: lcp.element ?? null, detail: `phone LCP ${lcp.ms} ms (${lcp.element ?? ''}${lcp.url ? ` ${new URL(lcp.url, 'http://x/').pathname}` : ''}; good at most ${LCP_WARN_MS}, poor over ${LCP_FAIL_MS})` })));
  const shifts = (seo?.render ?? []).filter((row) => row.viewport === 'mobile' && typeof row.cls === 'number');
  for (const { route, cls } of shifts) findings.push({ level: cls > CLS_POOR ? 'issue' : 'info', kind: 'phone', problem: cls > CLS_POOR ? 'cls_poor' : cls > CLS_GOOD ? 'cls_needs_work' : 'cls_good', route, cls, detail: `phone CLS ${cls} (${seo.dir}; good at most ${CLS_GOOD}, poor over ${CLS_POOR})` });
  if (!shifts.length) findings.push({ level: 'info', kind: 'phone', problem: 'cls_not_measured', detail: 'no phone CLS: the claude-seo audit measures it (site.json llmAudit); after launch Lighthouse does (pnpm post-launch -- --lighthouse; field data: pnpm field-check)' });
  return findings;
}
