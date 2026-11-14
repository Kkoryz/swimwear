// Where a block goes on a page, or a slot in a blueprint (typeOf reads its block type): the placing rules the importer
// and the proof slots share.
const byType = (item) => item.type;

// Before the first item of the first listed type present, else at the end: ['faq', 'cta'] is "before the FAQ, else
// before the closing call to action".
export function indexBefore(list, types, typeOf = byType) {
  for (const type of types) {
    const at = list.findIndex((item) => typeOf(item) === type);
    if (at >= 0) return at;
  }
  return list.length;
}

// Where a page's opening ends: after its first introduction (else its first section).
export function openingEnd(list, typeOf = byType) {
  const intro = list.findIndex((item) => typeOf(item) === 'intro');
  return intro >= 0 ? intro + 1 : Math.min(1, list.length);
}
