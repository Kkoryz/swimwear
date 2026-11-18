// Prelaunch check 1, links (the built site): every link of every built page, menus included, and the pages no page's
// content links to.
// - dead: a root-relative link to a page or file the build does not have;
// - nav_only / unbuilt: a link to a group the menus show only as a heading (site.json navOnly, the plan's nav_only
//   rows) or to a page the plan holds back (site_plan.json unbuilt_pages), a dead link of its own kind;
// - placeholder: a link to a page built as a placeholder or held for review (noindex), information only;
// - orphan: an indexable page no other page links to from its content (<main> without its breadcrumb and other <nav>;
//   the menus are left out); the home page and the development pages (the style board) are not counted, a legal page
//   only footer menus link is information;
// - external: a link out whose form is wrong (http://, no host, an example or test domain, a space, javascript:, an
//   empty or "#" href, a mailto: or tel: that is not an address or a number); target="_blank" without rel="noopener"
//   is information.

import { attribute, decode } from '../built-site.mjs';
import { isIndexable } from '../seo-head.mjs';

export const DEV_ROUTES = Object.freeze(['/style-board/']);
const LEGAL_TYPES = new Set(['privacy', 'terms', 'legal']);
const EXAMPLE_HOST = /(^|\.)(example\.(com|org|net)|localhost|test|invalid|example)$/i;

const anchors = (html) => [...html.matchAll(/(<a\b[^>]*>)([\s\S]*?)<\/a>/g)].map(({ 1: open, 2: inner }) => ({ href: attribute(open, 'href'), target: attribute(open, 'target'), rel: attribute(open, 'rel') ?? '', text: decode(inner.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim() }));
// The page's own content: <main> without its <nav> parts (the breadcrumb).
const contentOf = (html) => (html.match(/<main\b[\s\S]*<\/main>/)?.[0] ?? '').replace(/<nav\b[\s\S]*?<\/nav>/g, ' ');
const routeOf = (href) => decode(href).split(/[?#]/)[0];

// A link out's form problem, or null.
export function externalProblem(href, { target = null, rel = '' } = {}) {
  const value = decode(String(href ?? '')).trim();
  if (!value || value === '#') return { level: 'issue', problem: 'empty' };
  if (/^javascript:/i.test(value)) return { level: 'issue', problem: 'javascript' };
  if (/^mailto:/i.test(value)) return /^mailto:[^@\s?]+@[^@\s?]+\.[a-z]{2,}(\?.*)?$/i.test(value) ? null : { level: 'issue', problem: 'mailto' };
  if (/^tel:/i.test(value)) return /^tel:\+?[\d\s().-]{6,}$/.test(value) ? null : { level: 'issue', problem: 'tel' };
  if (/^\/\//.test(value)) return { level: 'info', problem: 'protocol_relative' };
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) return null;
  if (/\s/.test(value)) return { level: 'issue', problem: 'space' };
  let url;
  try { url = new URL(value); } catch { return { level: 'issue', problem: 'unparsable' }; }
  if (!['http:', 'https:'].includes(url.protocol)) return null;
  if (!url.hostname.includes('.') || EXAMPLE_HOST.test(url.hostname)) return { level: 'issue', problem: 'host' };
  if (url.protocol === 'http:') return { level: 'issue', problem: 'http' };
  if (target === '_blank' && !/\bnoopener\b|\bnoreferrer\b/.test(rel)) return { level: 'info', problem: 'blank_without_noopener' };
  return null;
}

// ctx: { pages, built: Map route -> html, distHas(path), navOnly: Set of routes, unbuilt: Map route -> name }.
export function linkFindings(ctx) {
  const findings = [];
  const byRoute = new Map(ctx.pages.map((page) => [page.route, page]));
  const inbound = new Map(ctx.pages.map((page) => [page.route, new Set()]));
  const pairs = new Map();
  const add = (key, finding) => { const known = pairs.get(key); if (known) known.from.add(finding.from); else pairs.set(key, { ...finding, from: new Set([finding.from]) }); };
  for (const page of ctx.pages) {
    const html = ctx.built.get(page.route);
    if (!html || DEV_ROUTES.includes(page.route)) continue;
    for (const link of anchors(html)) {
      if (link.href === null) continue;
      const { href } = link;
      if (href.startsWith('/') && !href.startsWith('//')) {
        const route = routeOf(href);
        const target = byRoute.get(route);
        if (ctx.navOnly.has(route)) add(`nav_only ${route}`, { level: 'issue', kind: 'nav_only', target: route, from: page.route, detail: 'a group the menus show only as a heading: it has no page' });
        else if (ctx.unbuilt.has(route)) add(`unbuilt ${route}`, { level: 'issue', kind: 'unbuilt', target: route, from: page.route, detail: `a page the plan holds back (${ctx.unbuilt.get(route)})` });
        else if (!ctx.distHas(route)) add(`dead ${route}`, { level: 'issue', kind: 'dead', target: route, from: page.route, detail: 'no page or file of the build' });
        else if (target && !isIndexable(target)) add(`placeholder ${route}`, { level: 'info', kind: 'placeholder', target: route, from: page.route, detail: `a ${target.status} page (noindex)` });
      } else if (!href.startsWith('#') || href === '#') {
        const problem = externalProblem(href, link);
        if (problem) add(`external ${problem.problem} ${href}`, { level: problem.level, kind: 'external', problem: problem.problem, target: href, from: page.route, detail: link.text.slice(0, 60) });
      }
    }
    for (const href of new Set([...contentOf(html).matchAll(/<a\b[^>]*\shref="(\/[^"]*)"/g)].map((match) => routeOf(match[1])))) if (href !== page.route && inbound.has(href)) inbound.get(href).add(page.route);
  }
  findings.push(...[...pairs.values()].map((finding) => ({ ...finding, from: [...finding.from].sort() })));
  for (const page of ctx.pages) {
    if (page.route === '/' || DEV_ROUTES.includes(page.route) || !isIndexable(page) || !ctx.built.get(page.route) || inbound.get(page.route).size) continue;
    findings.push({ level: LEGAL_TYPES.has(page.pageType) ? 'info' : 'issue', kind: 'orphan', target: page.route, from: [], detail: `no page links here from its content (${page.pageType})` });
  }
  return findings;
}
