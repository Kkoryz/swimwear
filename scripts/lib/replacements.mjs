// Site Factory's replacement lists for a site already built (owner 2026-11-17, through Site Factory: a built site is
// not run whole again; a change comes as a list of page, section, old sentence, new sentence and why, and 08 replaces
// it in its own page content, then builds and checks). The lists are kept in the site (content/replacements/*.json,
// in their order of name) and applied after every import, so an import from the package does not undo them.
// An item: { n, url, section?, old, new, reason?, hits_in_structured_data? }.

// Where a string is not copy: ids, links and media.
const SKIP = new Set(['id', 'type', 'href', 'src', 'srcset', 'variant', 'sourceSectionIds', 'route', 'canonical', 'anchor', 'url', '@id', '@type', '@context']);

// Every occurrence of old in the strings of value replaced by new; count: how many strings changed and how many
// occurrences. Keys in SKIP are left alone.
function replaceIn(value, old, next, count) {
  // The same words in and out (a link added to copy the structured data holds as plain text): nothing to do there.
  if (old === next) return value;
  if (typeof value === 'string') {
    if (!value.includes(old)) return value;
    count.occurrences += value.split(old).length - 1;
    count.strings += 1;
    return value.split(old).join(next);
  }
  // Paragraphs in a row: an old that runs over a blank line is looked for across them, the text then split again at its
  // blank lines (MotelPilot fix2 #73 2026-11-18: an intro's last sentence and the numbered steps of the next paragraph).
  if (Array.isArray(value) && old.includes('\n\n') && value.length > 1 && value.every((item) => typeof item === 'string')) {
    const joined = value.join('\n\n');
    if (joined.includes(old)) {
      count.occurrences += joined.split(old).length - 1;
      count.strings += 1;
      return joined.split(old).join(next).split('\n\n').filter((paragraph) => paragraph.trim());
    }
  }
  if (Array.isArray(value)) return value.map((item) => replaceIn(item, old, next, count));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, SKIP.has(key) ? item : replaceIn(item, old, next, count)]));
  return value;
}

// The structured data holds the copy as plain text, its links' words without the links (an FAQPage's answers): an
// item is matched and written there so (Staylumen fix2 2026-11-18: 13 FAQ answers, nine links written into the FAQPage).
const plainText = (text) => String(text).replace(/\[([^\]]+)\]\([^)\s]+\)/g, '$1');

// An old and new that are each a question (ending "?") and an answer over the first blank line: { old: [q, a], new: [q,
// a] }, else null.
function questionAndAnswer(item) {
  const split = (text) => { const at = String(text).indexOf('\n\n'); return at < 0 ? null : [text.slice(0, at).trim(), text.slice(at + 2).trim()]; };
  const [old, next] = [split(item.old), split(item.new)];
  return old && next && old[0].endsWith('?') && next[0].endsWith('?') && old[1] && next[1] ? { old, new: next } : null;
}

// The old and new without the JSON quotes they share at their start or end (a string's fragment as JSON writes it),
// or null when neither has one.
function unquoted(item) {
  let [old, next] = [item.old, item.new];
  const lead = old.startsWith('"') && next.startsWith('"');
  const trail = old.endsWith('"') && next.endsWith('"');
  if (!lead && !trail) return null;
  if (lead) [old, next] = [old.slice(1), next.slice(1)];
  if (trail) [old, next] = [old.slice(0, -1), next.slice(0, -1)];
  return old ? { old, new: next } : null;
}

// A new sentence this short may be in the page by chance: only a longer one found there counts as applied before.
export const APPLIED_MIN_CHARS = 12;
const holds = (value, text) => JSON.stringify(value).includes(JSON.stringify(text).slice(1, -1));

// A site-level field Site Factory names by section with no page (its "trust_bar"): read as the page at this address
// (apply-replacements.mjs), only a value that is the old text whole is replaced, never the old text inside a sentence
// (aloha 2026-11-17: the trust bar's "350 independent" is "350", the copy's "more than 350 independent labels" stays).
export const SITE_FIELDS = Object.freeze({ trust_bar: '#trust_bar' });
function replaceWhole(value, old, next, count) {
  if (typeof value === 'string') { if (value !== old) return value; count.occurrences += 1; count.strings += 1; return next; }
  if (Array.isArray(value)) return value.map((item) => replaceWhole(item, old, next, count));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceWhole(item, old, next, count)]));
  return value;
}

// The pages with each list's items applied: { pages, results: [{ list, n, url, status, content, structuredData }] }.
// status: replaced (the old sentence found and replaced), applied (only the new one there: replaced before), missing
// (neither: by hand), no-page (no built page at that address). The structured data (jsonLd) is replaced with the copy.
export function applyReplacements(pages, lists) {
  let current = pages;
  const results = [];
  for (const { name, items } of lists) {
    for (const item of items) {
      const siteField = SITE_FIELDS[item.section] && !current.some((page) => page.route === item.url) ? SITE_FIELDS[item.section] : null;
      const index = current.findIndex((page) => page.route === (siteField ?? item.url));
      const at = { list: name, n: item.n ?? null, url: item.url, section: item.section ?? null, ...(siteField ? { route: siteField } : {}) };
      if (index < 0) { results.push({ ...at, status: 'no-page' }); continue; }
      if (siteField) {
        const count = { strings: 0, occurrences: 0 };
        const next = replaceWhole(current[index], item.old, item.new, count);
        if (count.occurrences) { current = current.map((other, k) => (k === index ? next : other)); results.push({ ...at, status: 'replaced', content: count.occurrences, structuredData: 0 }); }
        else results.push({ ...at, status: JSON.stringify(current[index]).includes(JSON.stringify(item.new)) ? 'applied' : 'missing' });
        continue;
      }
      const page = current[index];
      // A section taken out: an empty new whose old is the whole heading of the page's block of that section (the blog
      // hubs, 2026-11-18: swim_1118a #6, aloha_1118a #7, "a hub carries the article cards, an intro and one CTA"), with
      // the blocks going on from it; or a visual taken out of a section ("<section>.visuals", its id as old: aloha_1118a #6).
      // A data visual's item as "<label>: <detail>" in a section's visuals (Strandmill swim_1118b #37, 2026-11-18: the
      // quality sequence's "Random checks: Random checks on finished goods"), its label and detail kept apart.
      const edited = item.new.trim() ? visualItemEdit(page, item) : null;
      if (edited) {
        if (edited.page) { current = current.map((other, k) => (k === index ? edited.page : other)); results.push({ ...at, status: 'replaced', form: 'visual item', content: 1, structuredData: 0 }); }
        else results.push({ ...at, status: 'applied', form: 'visual item' });
        continue;
      }
      const cut = !item.new.trim() ? removedPart(page, item) : null;
      if (cut) {
        if (cut.page) { current = current.map((other, k) => (k === index ? cut.page : other)); results.push({ ...at, status: 'replaced', form: cut.form, content: 1, structuredData: 0 }); }
        else results.push({ ...at, status: 'applied', form: cut.form });
        continue;
      }
      // A new sentence that holds the old one, already in the page: replaced before (again it would grow every run).
      if (item.new.includes(item.old) && holds(page, item.new)) { results.push({ ...at, status: 'applied' }); continue; }
      const { jsonLd, ...copy } = page;
      const content = { strings: 0, occurrences: 0 };
      const structured = { strings: 0, occurrences: 0 };
      let nextCopy = replaceIn(copy, item.old, item.new, content);
      let nextLd = replaceIn(jsonLd ?? [], plainText(item.old), plainText(item.new), structured);
      // A fragment of a data visual's JSON keeps its quotes ('"About 30% lower"', '... software fee."': Staylumen fix2
      // #64, #65 2026-11-18): not there as written, it is looked for without them.
      const bare = unquoted(item);
      // Its new holding its old and already in the page: replaced before (#64 grew by its note every run).
      if (content.occurrences + structured.occurrences === 0 && bare && bare.new.includes(bare.old) && holds(page, bare.new)) { results.push({ ...at, status: 'applied' }); continue; }
      if (content.occurrences + structured.occurrences === 0 && bare) {
        nextCopy = replaceIn(copy, bare.old, bare.new, content);
        nextLd = replaceIn(jsonLd ?? [], plainText(bare.old), plainText(bare.new), structured);
        if (content.occurrences + structured.occurrences === 0 && bare.new.length >= APPLIED_MIN_CHARS && holds(page, bare.new)) { results.push({ ...at, status: 'applied' }); continue; }
      }
      // An FAQ entry as Site Factory writes it, its question and (the start of) its answer over a blank line, for the
      // question and answer 08 keeps apart (Strandmill fix3 #11, #12 2026-11-18): each found and replaced on its own,
      // in the copy and in the FAQPage; both must be there.
      const qa = content.occurrences + structured.occurrences === 0 ? questionAndAnswer(item) : null;
      if (qa) {
        const found = (value, text) => JSON.stringify(value).includes(JSON.stringify(text).slice(1, -1));
        if (found(copy, qa.old[0]) && found(copy, qa.old[1])) {
          nextCopy = replaceIn(replaceIn(copy, qa.old[0], qa.new[0], content), qa.old[1], qa.new[1], content);
          nextLd = replaceIn(replaceIn(jsonLd ?? [], plainText(qa.old[0]), plainText(qa.new[0]), structured), plainText(qa.old[1]), plainText(qa.new[1]), structured);
        } else if (found(copy, qa.new[0]) && found(copy, qa.new[1])) { results.push({ ...at, status: 'applied', form: 'question and answer' }); continue; }
      }
      // Not there as written: Site Factory's source form of a table row, a list item or a data visual's fields, matched
      // on the structure 08 keeps them in (site13 2026-11-17: 6 of 31 items).
      const shape = content.occurrences + structured.occurrences === 0 ? sourceShape(item) : null;
      if (shape) {
        nextCopy = editIn(copy, shape, content);
        nextLd = editIn(jsonLd ?? [], shape, structured);
        if (content.occurrences + structured.occurrences === 0 && shape.applied(page)) { results.push({ ...at, status: 'applied', form: shape.form }); continue; }
      }
      if (content.occurrences + structured.occurrences > 0) {
        current = current.map((other, k) => (k === index ? { ...nextCopy, jsonLd: nextLd } : other));
        results.push({ ...at, status: 'replaced', ...(shape ? { form: shape.form } : {}), content: content.occurrences, structuredData: structured.occurrences, expectedStructuredData: item.hits_in_structured_data ?? null });
      } else {
        // Applied before: its new is there; or it removed its old (an empty new: Strandmill fix2 #82, a sentence cut);
        // or a later list changed its new again (superseded: fix1 #3's sizes, rewritten by fix2 #2). Else by hand.
        const later = lists.slice(lists.findIndex((list) => list.name === name) + 1).flatMap((list) => list.items).concat(items.slice(items.indexOf(item) + 1));
        const superseded = item.new.trim() && later.some((other) => other.url === item.url && other.old.includes(item.new.trim()));
        const status = (item.new.length >= APPLIED_MIN_CHARS && holds(page, item.new)) || !item.new.trim() ? 'applied' : superseded ? 'superseded' : 'missing';
        results.push({ ...at, status, ...(item.reason ? { reason: item.reason } : {}) });
      }
    }
  }
  // A card set left with fewer cards than a set holds (cards removed, now or by an earlier pass) is settled.
  return { pages: current.map(settleCardSets), results };
}

// A section's data visual item written "<label>: <detail>" (the section "<id>.visuals"): { page } with the item's label
// and detail replaced, { page: null } when the new one is there already, null when the item is not of that kind.
function visualItemEdit(page, item) {
  const section = String(item.section ?? '');
  if (!section.endsWith('.visuals')) return null;
  const split = (text) => { const at = String(text).indexOf(': '); return at > 0 ? [String(text).slice(0, at).trim(), String(text).slice(at + 2).trim()] : null; };
  const [old, next] = [split(item.old), split(item.new)];
  if (!old || !next) return null;
  const id = section.slice(0, -'.visuals'.length);
  const blocks = Array.isArray(page.blocks) ? page.blocks : [];
  const ofSection = (block) => block.id === id || (block.sourceSectionIds ?? []).includes(id);
  const detail = (entry) => entry.detail ?? entry.value ?? entry.text;
  const is = (entry, [label, text]) => entry && entry.label === label && detail(entry) === text;
  // A comparison's items are an object ({ options, rows }), not a list of label/detail entries: none of them.
  const items = (visual) => (Array.isArray(visual?.data?.items) ? visual.data.items : []);
  const owners = blocks.filter((block) => ofSection(block) && (block.visuals ?? []).some((visual) => items(visual).some((entry) => is(entry, old) || is(entry, next))));
  if (!owners.length) return null;
  if (!owners.some((block) => block.visuals.some((visual) => items(visual).some((entry) => is(entry, old))))) return { page: null };
  const key = (entry) => ('detail' in entry ? 'detail' : 'value' in entry ? 'value' : 'text');
  const edit = (visual) => (items(visual).some((entry) => is(entry, old)) ? { ...visual, data: { ...visual.data, items: items(visual).map((entry) => (is(entry, old) ? { ...entry, label: next[0], [key(entry)]: next[1] } : entry)) } } : visual);
  return { page: { ...page, blocks: blocks.map((block) => (owners.includes(block) ? { ...block, visuals: block.visuals.map(edit) } : block)) } };
}

// What an empty new takes out whole: a section's block (its heading the old) and the blocks going on from it, or a
// visual of a section (section "<id>.visuals", the visual's id the old). { form, page } (page null: already out), or null
// when the item is not of that kind (a sentence cut, cards removed: the replacements as before).
function removedPart(page, item) {
  const blocks = Array.isArray(page.blocks) ? page.blocks : [];
  const section = String(item.section ?? '');
  const ofSection = (block, id) => block.id === id || (block.sourceSectionIds ?? []).includes(id);
  if (section.endsWith('.visuals')) {
    const id = section.slice(0, -'.visuals'.length);
    const owners = blocks.filter((block) => ofSection(block, id));
    if (!owners.length) return null;
    const holding = owners.filter((block) => (block.visuals ?? []).some((visual) => visual.id === item.old.trim()));
    if (!holding.length) return { form: 'visual removed', page: null };
    return { form: 'visual removed', page: { ...page, blocks: blocks.map((block) => (holding.includes(block) ? { ...block, visuals: block.visuals.filter((visual) => visual.id !== item.old.trim()) } : block)) } };
  }
  const heading = item.old.trim();
  const target = blocks.find((block) => ofSection(block, section) && String(block.heading ?? '').trim() === heading);
  // Not there (taken out before, or a sentence cut whose old is no heading): the replacements as before.
  if (!target) return null;
  const gone = new Set([target.id]);
  for (let grew = true; grew;) { grew = false; for (const block of blocks) if (block.continues && gone.has(block.continues) && !gone.has(block.id)) { gone.add(block.id); grew = true; } }
  return { form: 'section removed', page: { ...page, blocks: blocks.filter((block) => !gone.has(block.id)) } };
}

// A card grid needs two cards (the authoring contract: 2 to 4 a grid). Cards removed by a list (Strandmill fix2 #55,
// fix3 #26 2026-11-18: the rash guard page's factory set left with one card, the accessories page's second grid with
// none) leave: an empty grid taken out (its heading passed to the grid that goes on from it); a single card of a grid
// that goes on from another joined to that one; a single card of a set of its own set as the set's text under its
// heading (an intro).
export function settleCardSets(page) {
  if (!Array.isArray(page?.blocks)) return page;
  let blocks = [...page.blocks];
  const grid = (block) => block?.type === 'featureGrid' && Array.isArray(block.items);
  for (const block of [...blocks]) {
    if (!grid(block) || block.items.length >= 2) continue;
    const at = blocks.indexOf(block);
    const next = blocks.find((other) => other.continues === block.id);
    if (!block.items.length) {
      blocks.splice(at, 1);
      if (next) blocks = blocks.map((other) => (other === next ? { ...Object.fromEntries(Object.entries(other).filter(([key]) => key !== 'continues')), ...(block.heading ? { heading: block.heading } : {}) } : other.continues === block.id ? { ...other, continues: next.id } : other));
      continue;
    }
    const parent = block.continues ? blocks.find((other) => other.id === block.continues) : null;
    if (parent && grid(parent) && parent.items.length < 4) {
      blocks = blocks.filter((other) => other !== block).map((other) => (other === parent ? { ...parent, items: [...parent.items, ...block.items] } : other));
      continue;
    }
    // A single card heading a set that goes on (the rash guard page's factory card before three more): the set's cards
    // come up into it, all of them when they fit one grid, else one, so both grids hold two at least.
    if (!block.continues && next && grid(next)) {
      const all = next.items.length + 1 <= 4;
      const moved = all ? next.items : next.items.slice(0, 1);
      blocks = blocks.flatMap((other) => (other === block ? [{ ...block, items: [...block.items, ...moved] }] : other === next ? (all ? [] : [{ ...next, items: next.items.slice(1) }]) : other.continues === next.id && all ? [{ ...other, continues: block.id }] : [other]));
      continue;
    }
    if (!block.continues && !next) {
      const [card] = block.items;
      const text = card.paragraphs ?? (card.text ? [card.text] : []);
      blocks[at] = { id: block.id, type: 'intro', ...(block.sourceSectionIds ? { sourceSectionIds: block.sourceSectionIds } : {}), heading: block.heading ?? card.heading, paragraphs: text };
    }
  }
  return JSON.stringify(blocks) === JSON.stringify(page.blocks) ? page : { ...page, blocks };
}

// Site Factory's source forms, read as the structure 08 keeps their text in: a markdown table row ("| A | B |": a row of
// cells), a list item or a card ("- **Heading**: text", or without the dash: an object with that heading and that
// text; RateHarbor's careers card 2026-11-17) and a data visual's fields ('"label": "x", "min": 15': an object with
// those values). { form, match(object|array) -> edited | null, applied(page) }.
// A row may come without its closing bar, its last cell cut to its first sentence (Strandmill fix2 #6 2026-11-18:
// "| Standard sizing | We offer S-XL, S-L and one size." for a cell that goes on): such a cell is matched by its start.
const cellsOf = (text) => { const row = String(text).trim(); return /^\|.*\|.*/.test(row) ? row.replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim()) : null; };
const openRow = (text) => !/\|$/.test(String(text).trim());
// Cards removed (an empty new: Strandmill fix2 #55, two cards of another product cut from the rash guard page): each
// "- **Heading**: text" line of the old is an item to take out of the list that holds it.
const listItemsOf = (text) => { const lines = String(text).split(/\n(?=\s*(?:[-*]|\d+[.)])\s+\*\*)/).map((line) => line.trim()).filter(Boolean); const items = lines.map((line) => listItemOf(line)); return items.length && items.every(Boolean) ? items : null; };
// A bullet ("- ", "* ") or a numbered step ("2. ": Staylumen fix2 #15, #16 2026-11-18, a cleaning page's steps).
const listItemOf = (text) => { const found = /^\s*(?:(?:[-*]|\d+[.)])\s+)?\*\*(.+?)\*\*\s*:?\s*(.+?)\s*$/s.exec(String(text)); return found ? { heading: found[1].trim(), body: found[2].trim() } : null; };
// A data visual's fields: '"label": "x"' (its fields), '{"label": "x", "values": [...]}' (the object itself, Staylumen
// fix2 #61) or several objects '{...}, {...}' (an array: a row added after the one matched, #63).
const fieldsOf = (text) => {
  const body = String(text).trim().replace(/,\s*$/, '');
  for (const wrapped of body.startsWith('{') ? [`[${body}]`] : [`{${body}}`]) {
    try {
      const value = JSON.parse(wrapped);
      if (Array.isArray(value)) return value.length && value.every((item) => item && typeof item === 'object' && !Array.isArray(item)) ? (value.length === 1 ? value[0] : value) : null;
      return value && typeof value === 'object' && Object.keys(value).length ? value : null;
    } catch { return null; }
  }
  return null;
};
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const strings = (object) => Object.entries(object).filter(([key, value]) => !SKIP.has(key) && typeof value === 'string');
function sourceShape(item) {
  const [oldCells, newCells] = [cellsOf(item.old), cellsOf(item.new)];
  if (oldCells && newCells && oldCells.length === newCells.length) {
    // A cut last cell (an open row) matches a cell that starts with it, and only that start is replaced.
    const cut = openRow(item.old) && openRow(item.new);
    const fits = (cell, index) => typeof cell === 'string' && (cell.trim() === oldCells[index] || (cut && index === oldCells.length - 1 && cell.trim().startsWith(oldCells[index])));
    // The row's first cells as written: a row of more columns matches on them, its later cells kept (RateHarbor fix2
    // #12 2026-11-18: two cells given of a three-column row).
    const isRow = (value) => Array.isArray(value) && value.length >= oldCells.length && oldCells.every((_, index) => fits(value[index], index));
    const edited = (value) => value.map((cell, index) => (index >= oldCells.length ? cell : cell.trim() === oldCells[index] ? newCells[index] : `${newCells[index]}${cell.trim().slice(oldCells[index].length)}`));
    const done = (value) => Array.isArray(value) && value.length >= newCells.length && newCells.every((_, index) => typeof value[index] === 'string' && (value[index].trim() === newCells[index] || (cut && index === newCells.length - 1 && value[index].trim().startsWith(newCells[index]))));
    return { form: 'table row', match: (value) => (isRow(value) ? edited(value) : null), applied: (page) => holdsShape(page, done) };
  }
  // Cards taken out: an empty new, an old of one or more "- **Heading**: text" lines.
  const gone = !item.new.trim() ? listItemsOf(item.old) : null;
  if (gone) {
    const isGone = (value) => value && typeof value === 'object' && !Array.isArray(value) && gone.some((card) => strings(value).some(([, text]) => text.trim() === card.heading) && JSON.stringify(value).includes(JSON.stringify(card.body).slice(1, -1)));
    return { form: 'cards removed', match: (value) => (Array.isArray(value) && value.some(isGone) ? value.filter((entry) => !isGone(entry)) : null), applied: (page) => !holdsShape(page, isGone) };
  }
  // One item in, several out (Staylumen fix2 #27 2026-11-18: the terms page's first item and four new ones after it):
  // the item matched in its array, each new one made in its shape (its heading and text in the strings that held the old).
  const [oldItems, newItems] = [listItemsOf(item.old), item.new.trim() ? listItemsOf(item.new) : null];
  if (oldItems?.length === 1 && newItems?.length > 1) {
    const [one] = oldItems;
    const isOld = (value) => value && typeof value === 'object' && !Array.isArray(value) && strings(value).some(([, text]) => text.trim() === one.heading) && JSON.stringify(value).includes(JSON.stringify(one.body).slice(1, -1));
    const made = (template, card) => JSON.parse(JSON.stringify(template).split(JSON.stringify(one.body).slice(1, -1)).join(JSON.stringify(card.body).slice(1, -1)).split(JSON.stringify(one.heading).slice(1, -1)).join(JSON.stringify(card.heading).slice(1, -1)));
    const headed = (value, card) => value && typeof value === 'object' && !Array.isArray(value) && strings(value).some(([, text]) => text.trim() === card.heading);
    const done = (value) => Array.isArray(value) && newItems.every((card) => value.some((entry) => headed(entry, card)));
    return { form: 'list items added', match: (value) => (Array.isArray(value) && value.some(isOld) && !done(value) ? value.flatMap((entry) => (isOld(entry) ? newItems.map((card) => made(entry, card)) : [entry])) : null), applied: (page) => holdsShape(page, done) };
  }
  const [oldItem, newItem] = [listItemOf(item.old), listItemOf(item.new)];
  if (oldItem && newItem) {
    // The object holding the heading and, in one of its strings (text, or a paragraph), the text.
    const edit = (value) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
      const own = strings(value);
      if (!own.some(([, text]) => text.trim() === oldItem.heading)) return null;
      const body = JSON.stringify(value);
      if (!body.includes(JSON.stringify(oldItem.body).slice(1, -1))) return null;
      const swapped = JSON.parse(body.split(JSON.stringify(oldItem.body).slice(1, -1)).join(JSON.stringify(newItem.body).slice(1, -1)));
      return Object.fromEntries(Object.entries(swapped).map(([key, text]) => [key, typeof text === 'string' && text.trim() === oldItem.heading ? newItem.heading : text]));
    };
    return { form: 'list item', match: edit, applied: (page) => holdsShape(page, (value) => value && typeof value === 'object' && !Array.isArray(value) && strings(value).some(([, text]) => text.trim() === newItem.heading) && JSON.stringify(value).includes(JSON.stringify(newItem.body).slice(1, -1))) };
  }
  const [oldFields, newFields] = [fieldsOf(item.old), fieldsOf(item.new)];
  // One object in, several out: the object matched in its array, the new ones in its place (a row added).
  if (oldFields && !Array.isArray(oldFields) && Array.isArray(newFields)) {
    const has = (fields) => (value) => value && typeof value === 'object' && !Array.isArray(value) && Object.entries(fields).every(([key, field]) => same(value[key], field));
    const isOld = has(oldFields);
    // An array that holds every new object already was edited before: left as it is (it would grow every run).
    const done = (value) => Array.isArray(value) && newFields.every((fields) => value.some(has(fields)));
    return { form: 'fields', match: (value) => (Array.isArray(value) && value.some(isOld) && !done(value) ? value.flatMap((entry) => (isOld(entry) ? newFields : [entry])) : null), applied: (page) => holdsShape(page, done) };
  }
  if (oldFields && newFields && !Array.isArray(oldFields) && !Array.isArray(newFields)) {
    const has = (fields) => (value) => value && typeof value === 'object' && !Array.isArray(value) && Object.entries(fields).every(([key, field]) => same(value[key], field));
    return { form: 'fields', match: (value) => (has(oldFields)(value) ? { ...Object.fromEntries(Object.entries(value).filter(([key]) => !(key in oldFields))), ...newFields } : null), applied: (page) => holdsShape(page, has(newFields)) };
  }
  return null;
}
function holdsShape(value, test) {
  if (test(value)) return true;
  if (Array.isArray(value)) return value.some((item) => holdsShape(item, test));
  if (value && typeof value === 'object') return Object.values(value).some((item) => holdsShape(item, test));
  return false;
}
// The structure with every part the shape matches edited; count as replaceIn's.
function editIn(value, shape, count) {
  const edited = shape.match(value);
  if (edited) { count.strings += 1; count.occurrences += 1; return edited; }
  if (Array.isArray(value)) return value.map((item) => editIn(item, shape, count));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, editIn(item, shape, count)]));
  return value;
}

// A list as Site Factory writes it: an array of items, or { replacements: [...] }; the items kept (keep) are checked.
export function listItems(data, keep = () => true) {
  const all = Array.isArray(data) ? data : data?.replacements ?? data?.items ?? null;
  if (!Array.isArray(all)) throw new Error('a replacement list is an array of { url, old, new } items');
  const items = all.filter(keep);
  for (const [index, item] of items.entries()) if (typeof item?.url !== 'string' || typeof item?.old !== 'string' || !item.old || typeof item?.new !== 'string') throw new Error(`replacement ${item?.n ?? index + 1} needs url, old and new`);
  return items;
}
