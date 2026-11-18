// What a site's judgments found the template cannot render, gathered across sites into one ranked backlog (scripts/
// collect-template-gaps.mjs): a competitor module the vocabulary lacks (section-modules.json, `gap`) and a design
// review finding of scope "template" (`gap`). Each names the behaviour it misses with one of GAP_KINDS, so the same
// need counts as one across sites; a gap goes on the template's to-do list only on evidence (ON_BACKLOG), never as a
// patch to one site.

// The behaviours a gap may name (config/agent-steps/modules.md and design-review.md list the same words).
export const GAP_KINDS = Object.freeze(['carousel', 'marquee', 'tabs', 'video', 'lightbox', 'fold', 'art-direction', 'icon-links', 'layout', 'other']);

// Evidence a gap needs to go on the backlog: seen on two sites (two competitors), or on three pages of one.
export const ON_BACKLOG = Object.freeze({ sites: 2, pagesOnOneSite: 3 });

// The page types whose competitor page sets the site's look: the home page and the content pages (a service or a
// product page). A layout gap of theirs is the site's look, not a detail.
export const HOLD_PAGE_TYPES = Object.freeze(['home', 'solution', 'place', 'product_manufacturer', 'product_wholesale']);
// A layout the template cannot render holds the run when its competitor section takes this share of its page's height
// or more. 15% of the hotel site's competitor home (5,977 px) is 897 px, about the 1,000 px desktop window the design
// review looks through: a module the visitor sees whole, which makes the page look as it does, and the nearest module
// standing in for it changes the page (Concord's full-width photo with its button over the edge, 1,081 px and 984 px).
// A smaller one (a 314 px row of photo tiles, 5%) is a detail the design review can judge. On the hotel site this holds
// two of the home page's four layout gaps and none of the service page's (its largest is 11%).
export const HOLD_SHARE = 0.15;
// What a person decides for such a gap (docs/research/template-gap-decisions.json): `template`: it is made in the
// template (it goes on the template's to-do list whatever the evidence; the site renders the nearest module meanwhile);
// `accept`: the nearest module stays.
export const GAP_DECISIONS = Object.freeze(['template', 'accept']);

// The large layout gaps of the home and content pages (HOLD_PAGE_TYPES, HOLD_SHARE): [{ pageType, index, module, why,
// height, share, decision }], the section's height and share from the competitor's page (pattern-inventory.json), the
// decision recorded for this very judgment (same page type, section and text: a new capture or judgment asks again).
export function largeLayoutGaps(sectionModules = [], inventory = null, decisions = []) {
  const pages = new Map((inventory?.pages ?? []).map((page) => [page.pageType, page.sections ?? []]));
  return sectionModules.filter((section) => section.gap === 'layout' && HOLD_PAGE_TYPES.includes(section.pageType)).map((section) => {
    const sections = pages.get(section.pageType) ?? [];
    const total = sections.reduce((sum, item) => sum + (item.height ?? 0), 0);
    const height = sections.find((item) => item.index === section.index)?.height ?? 0;
    const decided = decisions.find((item) => item.pageType === section.pageType && item.index === section.index && item.why === section.why && GAP_DECISIONS.includes(item.decision));
    return { pageType: section.pageType, index: section.index, module: section.module, why: section.why ?? '', height, share: total ? height / total : 0, decision: decided?.decision ?? null, note: decided?.note ?? null };
  }).filter((gap) => gap.share >= HOLD_SHARE).map((gap) => ({ ...gap, share: Math.round(gap.share * 100) / 100 }));
}

// A judgment that cannot be counted: text broken by a wrong encoding, or a capture that missed the module (a lazy image
// never loaded) rather than a template that lacks it.
const unreadable = (text) => /\?{3,}/.test(text ?? '');
const missedCapture = (text) => /not downloaded|no visible image|blank (?:crop|capture)|lazy/i.test(text ?? '');

// One site's gaps: [{ site, kind, source, pageType, where, text, severity }], and the judgments left out with why.
export function siteGaps(site, { sectionModules = [], reviews = [] }) {
  const gaps = [];
  const skipped = [];
  for (const section of sectionModules) {
    const named = section.gap ?? (/^GAP\b/i.test(section.why ?? '') ? 'unclassified' : null);
    if (!named) continue;
    const entry = { site, kind: GAP_KINDS.includes(named) ? named : 'unclassified', source: 'modules', pageType: section.pageType, where: `section ${section.index}`, text: section.why ?? '', severity: null };
    if (unreadable(entry.text)) skipped.push({ ...entry, reason: 'unreadable' });
    else if (missedCapture(entry.text)) skipped.push({ ...entry, reason: 'missed capture' });
    else gaps.push(entry);
  }
  for (const review of reviews) {
    for (const finding of review.findings ?? []) {
      if (finding.scope !== 'template') continue;
      gaps.push({ site, kind: GAP_KINDS.includes(finding.gap) ? finding.gap : 'unclassified', source: 'review', pageType: review.pageType, where: `${finding.block} (${finding.viewport})`, text: finding.issue ?? '', severity: finding.severity ?? null });
    }
  }
  return { gaps, skipped };
}

// The backlog: one row per kind with its evidence, ranked by sites, then pages, then P0/P1 findings.
export function rankGaps(gaps) {
  const rows = new Map();
  for (const gap of gaps) {
    const row = rows.get(gap.kind) ?? { kind: gap.kind, sites: new Set(), pages: new Map(), blocking: 0, examples: [] };
    row.sites.add(gap.site);
    row.pages.set(gap.site, new Set([...(row.pages.get(gap.site) ?? []), gap.pageType]));
    if (gap.severity === 'P0' || gap.severity === 'P1') row.blocking += 1;
    if (row.examples.length < 3) row.examples.push(`${gap.site} ${gap.pageType} ${gap.where}: ${gap.text.slice(0, 140)}`);
    rows.set(gap.kind, row);
  }
  return [...rows.values()].map((row) => {
    const pages = [...row.pages.values()].reduce((sum, set) => sum + set.size, 0);
    const mostOnOneSite = Math.max(...[...row.pages.values()].map((set) => set.size));
    const onBacklog = row.kind !== 'unclassified' && (row.sites.size >= ON_BACKLOG.sites || mostOnOneSite >= ON_BACKLOG.pagesOnOneSite);
    return { kind: row.kind, sites: [...row.sites].sort(), pages, blocking: row.blocking, onBacklog, examples: row.examples };
  }).sort((left, right) => right.sites.length - left.sites.length || right.pages - left.pages || right.blocking - left.blocking);
}
