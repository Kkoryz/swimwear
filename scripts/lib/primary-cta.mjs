// A page's primary call to action: what its hero asks the visitor to do, else what its closing call does (a blog post's
// own call), as the copy has it, never a label made up here. The template keeps a call inside the first screen at
// every width (four-site audit 2026-11-17; owner 2026-11-17: the page title and the call in the first screen on a
// phone, 390×844, and a desktop, 1366×768, after claude-seo, over a competitor's full-screen photo): the hero shows the
// page's own, and the header (SiteHeader.astro, on a desktop) and the enquiry bar below it (EnquiryBar.astro) show the
// site's (siteCta). The layout audit holds the page to it (lib/visual-checks.mjs foldProblems).

const usable = (link) => Boolean(link && typeof link.label === 'string' && link.label.trim() && typeof link.href === 'string' && link.href.trim());
const path = (href) => String(href).replace(/[?#].*$/, '').replace(/\/?$/, '/');
const leadsToItself = (cta, page) => Boolean(page?.route && cta.href.startsWith('/') && path(cta.href) === path(page.route));

// { label, href } or null. A call that leads to the page itself (the contact page's own "Contact us") is none.
export function primaryCta(page) {
  const closing = [...(page?.blocks ?? [])].reverse().find((block) => block?.type === 'cta' && usable(block.cta));
  const cta = usable(page?.hero?.cta) ? page.hero.cta : closing?.cta ?? null;
  if (!cta || leadsToItself(cta, page)) return null;
  return { label: cta.label, href: cta.href };
}

// The site's call, one for every page's header and enquiry bar: the home page's, else the call most pages make (each
// page's own runs long, "Request a quote for children's swimwear", and a header has room for one short call; the swimwear
// site's header overflowed at 1024px to 1366px with the pages' own). null without one.
export function siteCta(pages = []) {
  const home = pages.find((page) => page.route === '/');
  if (primaryCta(home)) return primaryCta(home);
  const counts = new Map();
  for (const cta of pages.map(primaryCta).filter(Boolean)) {
    const key = JSON.stringify([cta.label, cta.href]);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const [best] = [...counts].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length);
  return best ? (([label, href]) => ({ label, href }))(JSON.parse(best[0])) : null;
}

// The call the header and the enquiry bar show on a page: the site's, or the page's own where the site's leads to the
// page itself (the contact page); null where neither is.
// On the page the site's call leads to, where that page holds the form, the call keeps its words and goes to the form:
// the quote page's header and enquiry bar sent its visitors to the contact page with the page's own second call,
// "Prefer email? Contact us", its form below its FAQ (Strandmill claude-seo audit 2026-11-17, M-12).
export function chromeCta(page, pages = []) {
  const site = siteCta(pages);
  if (site && !leadsToItself(site, page)) return site;
  const form = (page?.blocks ?? []).find((block) => block?.type === 'form' && block.id);
  if (site && form) return { label: site.label, href: `#${form.id}` };
  return primaryCta(page);
}
