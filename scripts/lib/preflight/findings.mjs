// Helpers the preflight's checks share: a finding, the built pages, and what they show.
import { parsePage } from '../built-site.mjs';

// A finding that lists what was found holds only when something was.
export const found = (detail, items) => items.length > 0 && { detail, items };
export const routesOf = (ctx) => new Set(ctx.pages.map((page) => page.route));
// [page, html] for every page with a built file.
export const builtPages = (ctx) => ctx.pages.flatMap((page) => (ctx.built.get(page.route) ? [[page, ctx.built.get(page.route)]] : []));
export const routesWhere = (ctx, test) => builtPages(ctx).filter(([page, html]) => test(html, page)).map(([page]) => page.route);
// What find(parsed page, page) returns across the built pages, each once, in page order.
export const acrossPages = (ctx, find) => [...new Set(builtPages(ctx).flatMap(([page, html]) => find(parsePage(html), page)))];
// Image register entries by every web source they are served at.
export const planBySrc = (ctx) => new Map((ctx.plan?.entries ?? []).filter((entry) => entry.web).flatMap((entry) => entry.web.srcset.split(', ').map((source) => [source.split(' ')[0], entry])));
// Pages with a form of the contract (LeadForm.astro writes its status), and those whose form is not "connected" yet:
// disabled (not-connected) or live but untested on the server (ready).
export const formRoutes = (ctx) => routesWhere(ctx, (html) => /data-form-status="[\w-]+"/.test(html));
export const formsNotConnected = (ctx) => routesWhere(ctx, (html) => /data-form-status="(?!connected")[\w-]+"/.test(html));
export const siteStatus = (ctx) => (ctx.runtime?.site?.id ? ctx.runtime.site.status : null);
export const nginxHost = (ctx) => new URL(ctx.identity.origin).host;
