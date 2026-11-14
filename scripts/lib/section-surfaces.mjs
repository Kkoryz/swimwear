// Which sections of a page take the tinted surface, so neighbouring sections read apart (owner 2026-11-12: "模块间的分割
// 好像做的不太好": the hotel home ran five white text sections one under the other, told apart by white space alone,
// where the competitor parts its sections with a photo, a dark or grey band or a panel of grey cards).
//
// A section that parts the page by itself (a photo, a band, a closing call or form, a split row with its photo, the
// testimonials a treatment sets on a band) ends a run; within a run of plain sections every second one is tinted, and
// the last of a run is left white when the section after it is a band of its own (two grey bands would run together).

// The sections that part a page by themselves: a photo, a band, the closing call, a wall, and steps laid over a photo
// (process photo-cards: hotel-rm 2026-11-14). A split row with its photo beside the copy and the enquiry form sit on the
// page's own white like any plain section and alternate with them (motel 2026-11-14: the review saw a white split row
// after a white grid, and form, channels and closing call as three white sections, as one column). The testimonials are
// a plain section too: they were taken for a band a treatment sets, and none of three sites' treatments set one
// (swimwear, hotel-rm and motel 2026-11-15: each left them white, and white sections met on both sides of them on 33
// of swimwear's 38 pages: m4-2, testimonials, related).
const PARTS = new Set(['figure', 'gallery', 'cta']);
// Of those, the ones on a grey band of their own: a split row of the tinted variant (hotel-rm 2026-11-14: a tinted split
// under a tinted grid read as one grey surface).
const banded = (block, variant) => block.type === 'splitMedia' && variant === 'tinted';
const parts = (block, variant) => PARTS.has(block.type) || String(block.id).startsWith('media-module-') || (block.type === 'process' && variant === 'photo-cards');

// The hero's lead opening the page under the hero (PageView, BlogHubView: a lead much longer than the competitor's) is
// the first plain section of the page: left out, the section after it took the white it already had (motel's contact
// page, 2026-11-14: page-lead and overview two white sections in a row).
export const PAGE_LEAD = Object.freeze({ id: 'page-lead', type: 'pageLead' });
// The trust bar under the hero (TrustBar.astro) is the first section of the page's first run when it shows: its surface
// is the alternation's, never a site sheet's (hotel-rm 2026-11-15: a repair set it to the page's surface on four page
// types and the overview under it ran on as one).
export const TRUST_BAR = Object.freeze({ id: 'trust-bar', type: 'trustBar' });

/**
 * @param {{ id: string, type: string, continues?: string }[]} blocks
 * @param {(block: any) => string | undefined} [variantOf] the variant each block renders with
 * @returns {Set<string>} the ids of the tinted sections (a tinted split row's band is its variant's own, not in the set)
 */
export function tintedSections(blocks, variantOf = () => undefined) {
  const tinted = new Set();
  const role = new Map();
  let run = [];
  // A run of plain sections alternates; before a band of its own it counts back from the band, its last section white,
  // so two grey surfaces never meet and no two white ones either (it once left the last two white: motel's about page,
  // 2026-11-14).
  // The trust bar opening a run is tinted and the section under it white, as it has always looked (it is the run's
  // first section: 2026-11-15, Fable's ruling on hotel-rm's six "overview merges with the trust bar" findings).
  const close = (next) => {
    const fromEnd = next && role.get(next.id) === 'banded';
    const offset = run[0]?.type === TRUST_BAR.type ? 1 : 0;
    run.forEach((block, index) => { if ((fromEnd ? run.length - 1 - index : index + offset) % 2 === 1) tinted.add(block.id); });
    run = [];
  };
  // A section going on in blocks of its own (continues) is one section: going on from a plain section it takes that
  // section's surface and does not count in the alternation; going on from a section that parts the page or is a band
  // of its own (a split row, its steps after it) it is a plain section of the run that follows (hotel-rm 2026-11-14: the
  // steps of a tinted split took its tint and met the tinted grid after them). A section's steps (a process going on,
  // its caption its heading) are a module of their own and alternate with the section above them (2026-11-15, Fable's
  // ruling: hotel-rm's faq-steps and m2-steps and swimwear's overview-steps ran on one surface with their section);
  // steps over a photo still part the page.
  for (const block of blocks) {
    const variant = variantOf(block);
    const steps = block.type === 'process' && block.continues != null;
    const head = block.continues != null ? role.get(block.continues) : undefined;
    const kind = !steps && (head === 'plain' || head === 'follows') ? 'follows' : (!head || steps) && banded(block, variant) ? 'banded' : (!head || steps) && parts(block, variant) ? 'part' : 'plain';
    role.set(block.id, kind);
    if (kind === 'follows') continue;
    if (kind === 'plain') run.push(block); else close(block);
  }
  close(null);
  // A block that goes on takes the surface of the section it goes on from, through any blocks between.
  const headOf = (block) => { let at = block; while (role.get(at.id) === 'follows') at = blocks.find((item) => item.id === at.continues) ?? at; return at; };
  for (const block of blocks) if (role.get(block.id) === 'follows' && tinted.has(headOf(block).id)) tinted.add(block.id);
  return tinted;
}

// The page's style for its tinted sections: the band across the page, and inside it the cards that were grey on white
// turn white on grey (--surface-secondary inside the band is the page's white).
export function tintStyle(ids) {
  if (!ids.size) return '';
  const selector = [...ids].map((id) => `main [data-block-id="${String(id).replace(/["\\]/g, '')}"]`).join(', ');
  // --sticky-surface: what a table's pinned first column shows on phones (patterns.css), the band's tint inside it.
  return `main { --section-tint: var(--surface-secondary); } ${selector} { background: var(--section-tint); --surface-secondary: var(--surface-primary); --sticky-surface: var(--section-tint); }`;
}
