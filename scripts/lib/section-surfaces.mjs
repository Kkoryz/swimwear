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
// The closing call of the inline variant is a white section of copy and a button, no band: it alternates like a plain
// section (swimwear 2026-11-15: its FAQ and inline closing call stood white one under the other).
const parts = (block, variant) => (PARTS.has(block.type) && !(block.type === 'cta' && variant === 'inline')) ||String(block.id).startsWith('media-module-') || (block.type === 'process' && variant === 'photo-cards');

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
  // start: the surface the next run opens on after a section's later part (true: tinted), else white.
  let start = false;
  const close = (next, before = null) => {
    // before: the surface of a section's later part the run ends on (true: tinted): the run's last section takes the
    // other one, counting back like a band, unless the part's own section is in the run (its surface is then counted).
    const fromEnd = (next && role.get(next.id) === 'banded') || (before !== null && !run.some((block) => block.id === before.head));
    const offset = run[0]?.type === TRUST_BAR.type || start ? 1 : 0;
    const tint = (index) => (fromEnd ? run.length - 1 - index + (before !== null && !before.tinted ? 1 : 0) : index + offset) % 2 === 1;
    run.forEach((block, index) => { if (tint(index)) tinted.add(block.id); });
    run = [];
    start = before !== null && !before.tinted;
  };
  // The surface the run in progress gives one of its sections, counted forward (a section's later part takes it).
  const runTint = (id) => { const index = run.findIndex((block) => block.id === id); return index >= 0 ? (index + (run[0]?.type === TRUST_BAR.type || start ? 1 : 0)) % 2 === 1 : tinted.has(id); };
  // A section going on in blocks of its own (continues) is one section: going on from a plain section it takes that
  // section's surface and does not count in the alternation; going on from a section that parts the page or is a band
  // of its own (a split row, its steps after it) it is a plain section of the run that follows (hotel-rm 2026-11-14: the
  // steps of a tinted split took its tint and met the tinted grid after them). A part going on in another component
  // than its section's is a module of its own and alternates with the section above it: a section's steps (a process
  // going on, its caption its heading; 2026-11-15, Fable's ruling: hotel-rm's faq-steps and m2-steps and swimwear's
  // overview-steps ran on one surface with their section), and a section Site Factory goes on in another presentation
  // (swimwear's terms page: proof-1 and proof-2 going on from the list m2, four white modules in a row; its consulting
  // page: a split row going on from a card set on the set's tint). A card set's grids, one component, keep one surface.
  // Steps over a photo still part the page.
  const typeOf = new Map(blocks.map((item) => [item.id, item.type]));
  for (const block of blocks) {
    const variant = variantOf(block);
    const steps = block.continues != null && typeOf.has(block.continues) && typeOf.get(block.continues) !== block.type;
    const head = block.continues != null ? role.get(block.continues) : undefined;
    const kind = !steps && (head === 'plain' || head === 'follows') ? 'follows' : (!head || steps) && banded(block, variant) ? 'banded' : (!head || steps) && parts(block, variant) ? 'part' : 'plain';
    role.set(block.id, kind);
    if (kind === 'follows') {
      // A later part of a section, after sections of their own since the part before it (its steps: aloha 2026-11-17,
      // four split rows of one section each with its steps), keeps its section's surface; the run before it ends on the
      // other surface and the run after it opens on the other one.
      const previous = blocks[blocks.indexOf(block) - 1];
      const chain = (at) => (role.get(at.id) === 'follows' ? chain(blocks.find((item) => item.id === at.continues) ?? at) : at.id);
      if (previous && previous.id !== block.continues && chain(previous) !== chain(block) && role.get(previous.id) !== undefined) {
        const head = chain(block);
        close(null, { head, tinted: runTint(head) });
      }
      continue;
    }
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
// secondaryInk (components.secondaryInk): the site's text does not read on its secondary surface, so the band's own text
// takes --text-on-secondary, and the parts inside it, on the page's surface again, the page's colours (template.css
// body[data-secondary-ink]; four-site audit 2026-11-17). Zero specificity, so a treatment's colour on a section wins.
export function tintStyle(ids, { secondaryInk = false } = {}) {
  if (!ids.size) return '';
  const selector = [...ids].map((id) => `main [data-block-id="${String(id).replace(/["\\]/g, '')}"]`).join(', ');
  const ink = secondaryInk ? ` :where(${selector}) { color: var(--text-on-secondary); --text-primary: var(--text-on-secondary); --heading-color: var(--text-on-secondary); --text-muted: var(--muted-on-secondary); --text-muted-2: var(--muted-on-secondary); --link: var(--text-on-secondary); --accent-text: var(--text-on-secondary); --focus-ring: var(--text-on-secondary); --secondary-ink: var(--text-ink); --secondary-muted: var(--muted-ink); --secondary-link: var(--page-link); --secondary-accent: var(--page-accent); }` : '';
  // --sticky-surface: what a table's pinned first column shows on phones (patterns.css), the band's tint inside it;
  // --table-ground: the covers at a sideways table's edges, the band's tint too (site13 2026-11-18: white covers on the
  // beige band shone at the bikini page's size table's right edge; owner: "反光了都").
  return `main { --section-tint: var(--surface-secondary); } ${selector} { background: var(--section-tint); --surface-secondary: var(--surface-primary); --sticky-surface: var(--section-tint); --table-ground: var(--section-tint); }${ink}`;
}
