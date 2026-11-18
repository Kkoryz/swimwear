// Preflight checks on the site's setup: contact paths and links, the form and chat, the registry, analytics, identity.
import { chatProblems } from '../chat-config.mjs';
import { formRecipient, formStatus, privacyRouteOf } from '../lead-form.mjs';
import { companyStandIns } from '../site-company.mjs';
import { parsePage } from '../built-site.mjs';
import { acrossPages, builtPages, formRoutes, formsNotConnected, found, routesOf, routesWhere, siteStatus } from './findings.mjs';

// A host that cannot be the site's real domain.
const TEMPORARY_HOST = /(^|\.)(example\.(com|org|net)|localhost|test|invalid)$|\.example$/;
// Contact details of a stand-in form, whatever their mark: the 555-0100 to 555-0199 numbers kept for fiction, the
// example domains, "to be confirmed" (the hotel site's +1 (416) 555-0142 shipped only because Site Factory marked it).
const STAND_IN = /\b555[-.\s]?01\d\d\b|@example\.(com|org|net)\b|\bto be confirmed\b/i;

export const SITE_CHECKS = [
  // A contact page a visitor can act on: an email, phone or WhatsApp link, or a connected form (E-E-A-T trust).
  { code: 'contact_path_missing', level: 'hold', run: (ctx) => found('the contact page has no email, phone or WhatsApp link and no connected form (registry email/whatsapp via site:config, or connect the form)', routesWhere(ctx, (html, page) => page.pageType === 'contact' && !/href="(mailto:|tel:|https:\/\/wa\.me\/)/.test(html) && !html.includes('data-form-status="connected"'))) },
  { code: 'broken_internal_link', level: 'hold', run: (ctx) => {
    const routes = routesOf(ctx);
    return found('links to pages or files that are not built', acrossPages(ctx, (parsed, page) => parsed.links.map((link) => link.href).filter((href) => /^\/[^#?]*$/.test(href ?? '') && (href.endsWith('/') ? !routes.has(href) : !ctx.distStat(href.slice(1)))).map((href) => `${page.route} -> ${href}`)));
  } },
  // Enquiries and privacy: the form must post to the first-party API and link a real privacy page.
  // A ready form posts to the endpoint, which forwards it to the recipient (owner 2026-11-17); the release still holds
  // until the contract says connected, once a real POST has been tested on the server.
  { code: 'form_delivery_unconfigured', level: 'hold', run: (ctx) => {
    const status = formStatus(ctx.form ?? {});
    const recipient = formRecipient(ctx.identity?.origin, ctx.form ?? {}, ctx.contact ?? null);
    const detail = status === 'ready'
      ? `the forms post to ${ctx.form?.endpoint ?? 'the endpoint'}${recipient ? `, forwarded to ${recipient}` : ''}, but no real POST has been tested on the server: test one, then set config/lead-form.json status to "connected"`
      : `the forms are not connected (config/lead-form.json status ${status})`;
    return found(detail, formsNotConnected(ctx));
  } },
  // The corner chat: decided per site (channels, or `chat: false`), and every channel usable.
  { code: 'chat_undecided', level: 'hold', run: (ctx) => ctx.runtime?.chat === undefined && { detail: 'src/data/site-runtime.json has no chat (its channels, or false for no chat)' } },
  { code: 'chat_config_invalid', level: 'hold', run: (ctx) => ctx.runtime?.chat !== undefined && chatProblems(ctx.runtime.chat).map((problem) => ({ detail: problem })) },
  { code: 'privacy_page_missing', level: 'hold', run: (ctx) => {
    const privacyRoute = privacyRouteOf(ctx.pages, ctx.form ?? {});
    return (formRoutes(ctx).length || ctx.runtime?.analytics || ctx.runtime?.chat) && privacyRoute && !routesOf(ctx).has(privacyRoute) && { detail: `forms and analytics need the privacy page ${privacyRoute}`, items: [privacyRoute] };
  } },
  // The site registry (pnpm site:config): the site is registered, and neither paused nor retired. A paused site stays
  // online with a notice (Google, "Pause or disable a website"); a retired one is not released again (it 301s to its
  // successor or answers 404/410 on the server, robots.txt still 200).
  { code: 'site_not_registered', level: 'hold', run: (ctx) => !ctx.runtime?.site?.id && { detail: 'src/data/site-runtime.json has no registry entry (run pnpm site:config)' } },
  { code: 'site_retired', level: 'hold', run: (ctx) => siteStatus(ctx) === 'retired' && { detail: `the registry marks ${ctx.runtime.site.id} as retired` } },
  { code: 'paused_site_without_notice', level: 'hold', run: (ctx) => siteStatus(ctx) === 'paused' && !ctx.runtime.site.notice && { detail: `${ctx.runtime.site.id} is paused: set the registry's site_notice so visitors see why` } },
  { code: 'site_paused', level: 'notice', run: (ctx) => siteStatus(ctx) === 'paused' && ctx.runtime.site.notice && { detail: `${ctx.runtime.site.id} is paused and shows: ${ctx.runtime.site.notice}` } },
  // Measurement: analytics must be installed before launch (history cannot be recovered later).
  { code: 'analytics_not_configured', level: 'hold', run: (ctx) => (!ctx.runtime?.analytics?.scriptSrc || !ctx.runtime?.analytics?.websiteId) && { detail: 'src/data/site-runtime.json has no analytics (Umami scriptSrc and websiteId)' } },
  // The company's contact details: real ones before launch (Site Factory marks its stand-ins placeholder: true).
  { code: 'contact_details_placeholder', level: 'hold', run: (ctx) => ctx.contact?.placeholder && { detail: 'src/data/site-contact.json holds stand-in contact details (project.yaml contact): the owner supplies the real email, phone, WhatsApp, address, hours and profiles' } },
  { code: 'contact_details_stand_in', level: 'hold', run: (ctx) => found('pages show contact details of a stand-in form (555-01xx numbers, example domains, "to be confirmed")', routesWhere(ctx, (html) => STAND_IN.test(html))) },
  // The company's stand-ins (src/data/site-company.json standIns, and stand-in contact details) are stated in the
  // structured data (claude-seo seo-schema; owner 2026-11-17): each one is listed with the JSON-LD it reaches and the
  // pages that carry it, and the release holds until the owner replaces it.
  { code: 'company_stand_in', level: 'hold', run: (ctx) => {
    const markup = builtPages(ctx).map(([page, html]) => [page.route, parsePage(html).jsonLd.map((block) => JSON.stringify(block.data ?? '')).join(' ')]);
    return found('stand-in company values the site states (replace them in src/data/site-company.json or site-contact.json and take them out of standIns)', companyStandIns(ctx.company, ctx.contact).map((item) => {
      const routes = item.search.length ? markup.filter(([, text]) => item.search.every((value) => text.includes(JSON.stringify(value).slice(1, -1)))).map(([route]) => route) : [];
      return `${item.field} "${item.value}": ${routes.length ? `in ${item.schema.join(', ')} on ${routes.length > 3 ? `${routes.slice(0, 3).join(', ')} and ${routes.length - 3} more` : routes.join(', ')}` : 'not in the structured data'}`;
    }));
  } },
  // Identity: stage 00's brand, a real domain, no working title.
  { code: 'identity_missing', level: 'hold', run: (ctx) => !ctx.identity && { detail: 'no src/data/site-identity.json' } },
  { code: 'identity_not_release_ready', level: 'hold', run: (ctx) => ctx.identity && [
    ctx.identity.source !== 'stage-00' && { detail: `brand kit source is ${ctx.identity.source}, not stage 00` },
    /working title/i.test(ctx.identity.siteName) && { detail: `site name is a working title: ${ctx.identity.siteName}` },
  ] },
  { code: 'canonical_host_not_release_ready', level: 'hold', run: (ctx) => ctx.identity && TEMPORARY_HOST.test(new URL(ctx.identity.origin).hostname) && { detail: ctx.identity.origin } },
];
