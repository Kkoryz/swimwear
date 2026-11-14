// A section's data visual (Site Factory's visuals[].data: what is shown, never how; owner 2026-10-30: the build is
// stage 08's) as the chart the template draws (ArticleChart.astro). The writer says what the data is; this file
// decides the drawing, one rule per kind of data (docs/research/ARTICLE_VISUALS.md section 2):
//   sequence (steps in order)              -> the site's process module (lib/media-slots.mjs withSectionVisuals)
//   amounts (values compared by size)      -> bars
//   periods with dates                     -> a timeline
//   periods as durations (10-15 days)      -> durations on one time scale (how long each takes, side by side)
//   ranges (sizes, weights, minimums...)   -> not drawn: a spec is read in the text (and the page's figures band);
//                                             a card of the same numbers after it reads as a repeat (owner 2026-10-30)
//   shares (parts of 100)                  -> one share bar
//   comparison (2-3 options by row)        -> a comparison table
// Only time is drawn on a scale (owner 2026-10-30: 16-22 inch outseams drawn as bars read like a timeline). The words
// and numbers are the writer's, drawn as text (an image model's lettering is not trusted).

export const DATA_SHAPES = Object.freeze(['sequence', 'amounts', 'periods', 'ranges', 'shares', 'comparison']);
// The data drawn as a chart in the section (sequence is the process module after it; ranges are not drawn).
export const isChartData = (data) => !['sequence', 'ranges'].includes(data?.shape);
const isText = (value) => typeof value === 'string' && value.trim().length > 0;
const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const isDay = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
const COUNTS = { sequence: [3, 7], amounts: [2, 8], periods: [1, 8], ranges: [1, 8], shares: [2, 6] };

// Contract errors of one data visual.
export function dataErrors(data, at = 'data') {
  if (!DATA_SHAPES.includes(data?.shape)) return [`${at}.shape must be one of ${DATA_SHAPES.join(', ')}`];
  if (data.shape === 'comparison') {
    const { options, rows } = data.items ?? {};
    if (!Array.isArray(options) || options.length < 2 || options.length > 3 || !options.every(isText)) return [`${at}.items.options must name 2 or 3 options`];
    if (!Array.isArray(rows) || !rows.length) return [`${at}.items.rows must list what the options are compared on`];
    return rows.flatMap((row, index) => (isText(row?.label) && Array.isArray(row.values) && row.values.length === options.length && row.values.every(isText) ? [] : [`${at}.items.rows[${index}] needs a label and one value per option`]));
  }
  const items = Array.isArray(data.items) ? data.items : [];
  const [min, max] = COUNTS[data.shape];
  if (items.length < min || items.length > max) return [`${at} (${data.shape}) needs ${min} to ${max} items`];
  return items.flatMap((item, index) => {
    const where = `${at}.items[${index}]`;
    if (!isText(item?.label)) return [`${where}.label is required`];
    if (data.shape === 'amounts' && !(isNumber(item.value) && item.value >= 0)) return [`${where}.value must be a number of 0 or more`];
    if (data.shape === 'periods' && !((isDay(item.start) && isDay(item.end) && item.end >= item.start) || (isNumber(item.min) && isNumber(item.max) && item.max >= item.min && isText(item.unit)))) return [`${where} needs start and end dates (YYYY-MM-DD) or min, max and unit`];
    if (data.shape === 'ranges' && !(item.min != null && item.max != null && (!isNumber(item.min) || !isNumber(item.max) || item.max >= item.min))) return [`${where} needs min and max`];
    if (data.shape === 'shares' && !(isNumber(item.percent) && item.percent > 0)) return [`${where}.percent must be a number above 0`];
    return [];
  }).concat(data.shape === 'shares' && Math.round(items.reduce((sum, item) => sum + (item.percent ?? 0), 0)) !== 100 ? [`${at} (shares) must add up to 100`] : []);
}

const span = (item) => (item.min === item.max ? `${item.min}` : `${item.min}–${item.max}`);
const figures = (items) => ({ kind: 'stats', items: items.map((item) => ({ value: span(item), ...(item.unit ? { unit: item.unit } : {}), label: item.label })) });

// The chart for one data visual (lib/blog.mjs chartErrors validates it): { kind, unit?, items | options, rows }.
export function chartOfData(data) {
  const items = data.items;
  switch (data.shape) {
    case 'sequence':
      return { kind: 'steps', items: items.map(({ label, detail }) => ({ label, ...(isText(detail) ? { detail } : {}) })) };
    case 'amounts': {
      const units = [...new Set(items.map((item) => item.unit ?? ''))];
      return { kind: 'bar', ...(units.length === 1 && units[0] ? { unit: units[0] } : {}), items: items.map(({ label, value }) => ({ label, value })) };
    }
    case 'periods': {
      if (items.every((item) => isDay(item.start))) return { kind: 'timeline', items: items.map(({ label, start, end }) => ({ label, start, end })) };
      // Durations in one unit side by side on one time scale; a single one, or mixed units, are figures.
      const units = new Set(items.map((item) => item.unit ?? ''));
      if (items.length >= 2 && units.size === 1) return { kind: 'ranges', unit: [...units][0], items: items.map(({ label, min, max }) => ({ label, min, max })) };
      return figures(items);
    }
    case 'ranges':
      return figures(items);
    case 'shares':
      return { kind: 'shares', items: items.map(({ label, percent }) => ({ label, percent })) };
    case 'comparison':
      return { kind: 'comparison', options: items.options, rows: items.rows };
    default:
      throw new Error(`no chart for data of shape ${data.shape}`);
  }
}
