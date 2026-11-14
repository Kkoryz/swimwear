// Layout decisions a block's own content makes: the columns of its grid and the level of its card titles. Shared by the
// renderer (IconListBlock, FeatureGridBlock, PageView, src/lib/layout.ts gridPlan) and the layout plan, so the plan
// made before a build is the layout the build renders. Pure: no data files.

import { cardGridMax } from './rules.mjs';

/**
 * Equal-grid plan: the column count that leaves the fewest empty cells (ties go to more columns), and when the last
 * row is short, the grid track where its first item starts so the row is centred. Grids use two tracks per column.
 * min: the fewest columns a grid may take (icon cards: three, so thirteen are not two columns of seven).
 * fixed: the column count a grid must take on a desktop whatever its count (a card set's grids keep one card width), a
 * short row centred; on tablets each grid keeps its own plan (two of 4 + 3 + 3 + 3 left a card alone in each three).
 * @param {number} count
 * @param {number} [max]
 * @param {number} [min]
 * @param {number} [fixed]
 */
export function gridPlan(count, max = 4, min = 2, fixed) {
  /** @param {number} size */
  const empty = (size) => (size - (count % size)) % size;
  let columns = fixed ?? Math.min(count, max);
  if (!fixed && count > max) for (let size = max; size >= Math.min(min, max); size -= 1) if (empty(size) < empty(columns)) columns = size;
  // Tablets (768-1023px) fit two or three columns: the one leaving fewer empty cells, ties to three.
  const tablet = Math.min(count, empty(2) < empty(3) ? 2 : 3);
  /** @param {number} size @param {number} index */
  const start = (size, index) => {
    const remainder = count % size;
    return remainder && index === count - remainder ? size - remainder + 1 : null;
  };
  return {
    columns,
    tabletColumns: tablet,
    style: `--tracks: ${columns * 2}; --tracks-md: ${tablet * 2}`,
    /**
     * Inline style for item `index`: only the first item of a short last row gets a start track (per breakpoint).
     * @param {number} index
     * @returns {string | undefined}
     */
    itemStyle: (index) => [start(columns, index) && `--start: ${start(columns, index)}`, start(tablet, index) && `--start-md: ${start(tablet, index)}`].filter(Boolean).join('; ') || undefined,
  };
}

// Two columns for an even count of short items only: beside an introduction the list has about half the container, so
// two columns there hold a few words each; without one, a sentence or two each (the hotel site's style board: detailed
// items squeezed into two narrow columns, and a split list read as three columns).
export const ICON_LIST_TWO_COLUMN_CHARS = Object.freeze({ split: 60, list: 160 });
// A list across the full width (no introduction) of four items or more, each a short paragraph at most, takes two
// columns of about 530px whatever its count, an odd count's last item running the row (hotel-rm's home, 2026-11-14:
// seven items of up to 343 characters ran one 1,320px column across the page, its longest run without a picture).
export const FULL_WIDTH_TWO_COLUMN_CHARS = 360;

/**
 * An icon list's layout: beside its introduction (split) or across the container (list), its items, its notes and its
 * column count (data-columns on .icon-list__items). An item without a heading among items with headings is a note to
 * them: it runs the list's full width after them (site10's packaging list ended in one, and its text sat beside a
 * two-line heading at another height).
 * @template {{ heading?: string; text: string }} Item
 * @param {{ heading?: string; paragraphs?: string[]; items: Item[] }} block
 */
export function iconListLayout(block) {
  const hasIntro = Boolean(block.heading || block.paragraphs);
  const layout = hasIntro ? 'split' : 'list';
  const headed = block.items.some((item) => item.heading);
  const listed = headed ? block.items.filter((item) => item.heading) : block.items;
  const notes = headed ? block.items.filter((item) => !item.heading) : [];
  const longest = Math.max(0, ...listed.map((item) => `${item.heading ?? ''} ${item.text}`.trim().length));
  const columns = (listed.length % 2 === 0 && longest <= ICON_LIST_TWO_COLUMN_CHARS[layout]) || (!hasIntro && !notes.length && listed.length >= 4 && longest <= FULL_WIDTH_TWO_COLUMN_CHARS) ? 2 : 1;
  return { hasIntro, layout, listed, notes, columns };
}

/**
 * Card titles sit one level below the grid's own title, or the title of the section it goes on from (continues: the
 * hotel home's six service cards over two grids had h3 titles in the first and h2 in the second, 22px and 36px);
 * without either, each card is a page section (h2).
 * @param {{ heading?: string; continues?: string }} block
 * @returns {'h2' | 'h3'}
 */
export const cardTitleLevel = (block) => (block.heading || block.continues ? 'h3' : 'h2');

/**
 * A card grid's columns. variant: the block's resolved pattern variant (PageView blockVariant); only 'bullets' changes
 * the layout. A bullet list (.point-list__items data-columns) runs two columns past six points. Any other grid: four
 * cards side by side only while every card is short (rules.mjs cardGridMax), counted on the cards' own text (Site
 * Factory's card sections carry no wordCount); a grid of a card set going on in grids of its own takes the set's column
 * count on a desktop (setColumns, cardSetColumns). columns: the desktop count (--tracks / 2); ownColumns: the grid's
 * own plan without the set's count (.feature-grid data-columns); tabletColumns, style and itemStyle: gridPlan's.
 * @param {{ setColumns?: number; items: { paragraphs: string[]; wordCount?: number }[] }} block
 * @param {string} [variant]
 */
export function cardGridColumns(block, variant) {
  if (variant === 'bullets') return { columns: block.items.length > 6 ? 2 : 1 };
  const most = cardGridMax(longestCardWords(block));
  return { ...gridPlan(block.items.length, most, 2, block.setColumns), ownColumns: gridPlan(block.items.length, most).columns };
}

/**
 * The words of a grid's longest card: its wordCount, else its own text counted (Site Factory's card sections carry none).
 * @param {{ items?: { paragraphs?: string[]; wordCount?: number }[] }} block
 */
export const longestCardWords = (block) => Math.max(0, ...(block.items ?? []).map((item) => item.wordCount ?? (item.paragraphs ?? []).join(' ').split(/\s+/).filter(Boolean).length));

/**
 * The card set a block belongs to: the section it goes on from (continues), else its own id.
 * @param {{ id: string; continues?: string }} block
 */
export const cardSet = (block) => ('continues' in block && block.continues) || block.id;

/**
 * A card set going on in grids of its own (continues) keeps one card width: every grid of the set takes the widest
 * grid's column count, four at most, a shorter row centred (the hotel hub's 4 + 3 + 3 + 3 entry cards were 255px, then
 * 350px wide). blocks: the page's blocks as rendered (PageView: media-slots.mjs withMediaModules). Returns the column
 * count by set (cardSet); a grid in no set has none.
 * @param {{ type: string; id: string; continues?: string; items?: unknown[] }[]} blocks
 * @returns {Map<string, number>}
 */
export function cardSetColumns(blocks) {
  const columns = new Map();
  // Short cards: up to four, as many as the grid has. A set with long cards in any of its grids (rules.mjs cardGridMax):
  // each grid's own plan under three, so four go two by two (hotel-rm 2026-11-14: a set of 60-word cards took min(4,
  // its count) and rendered four to a row on desktops, against the rule its own grids kept; another set's short first
  // grid set its long second one four to a row).
  const grids = blocks.filter((block) => block.type === 'featureGrid' && blocks.some((item) => item !== block && cardSet(item) === cardSet(block)));
  const longest = new Map();
  for (const block of grids) longest.set(cardSet(block), Math.max(longest.get(cardSet(block)) ?? 0, longestCardWords(block)));
  const held = (block) => { const count = block.items?.length ?? 0; const most = cardGridMax(longest.get(cardSet(block))); return most >= 4 ? Math.min(4, count) : gridPlan(count, most).columns; };
  for (const block of grids) columns.set(cardSet(block), Math.max(columns.get(cardSet(block)) ?? 0, held(block)));
  return columns;
}
