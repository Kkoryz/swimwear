// What a card gallery shows (shared by GalleryBlock, the image slots and the copy audit). Like the menus, it shows
// pages that exist: cards for built pages, and the built pages among its extra links. The plan splits a long list of
// pages into cards and extra links before anything is built, so a built page the plan put among the links takes a card
// while the gallery has room (its planned card count). A page not built yet is left out while any card has a page; when
// none has, the gallery names at most MAX_NAMES of them as plain text (no photo, no link look), so a large site plan
// never turns a page into a wall of names.

export const MAX_NAMES = 12;
const unbuilt = (href, isBuilt) => typeof href === 'string' && href.startsWith('/') && !isBuilt(href);

/**
 * @param {{ items: { caption?: string, href?: string, media?: any }[], links?: { label: string, href: string }[] }} block
 * @param {(href: string) => boolean} isBuilt
 * @returns {{ cards: { item: { caption?: string, href?: string, media?: any }, index: number }[], names: { item: { caption?: string, href?: string, media?: any }, index: number }[], links: { label: string, href: string }[] }}
 */
export function galleryShown(block, isBuilt) {
  const built = block.items.filter((item) => !unbuilt(item.href, isBuilt));
  const links = (block.links ?? []).filter((link) => !unbuilt(link.href, isBuilt));
  const carded = new Set(built.map((item) => item.href).filter(Boolean));
  const room = Math.max(0, block.items.length - built.length);
  const promoted = links.filter((link) => !carded.has(link.href)).slice(0, room);
  const cards = [...built, ...promoted.map((link) => ({ caption: link.label, href: link.href }))];
  const rest = links.filter((link) => !promoted.includes(link));
  if (!cards.length) return { cards: [], names: block.items.slice(0, MAX_NAMES).map((item, index) => ({ item, index })), links: rest };
  return { cards: cards.map((item, index) => ({ item, index })), names: [], links: rest };
}
