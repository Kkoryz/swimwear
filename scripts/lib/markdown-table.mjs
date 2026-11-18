// A GitHub-flavoured Markdown table in a section's body (Site Factory writes a table section as a short lead and a GFM
// table: AuthoredSection presentation "table"): the lead's paragraphs and the table's header and rows. A cell keeps its
// text as written (inline links and emphasis render later); an escaped pipe (\|) is a pipe in the cell. A row with
// fewer cells than the header gets empty ones, extra cells are dropped (as GFM renders them); nothing is filled in.

// A row's cells: split on pipes that are not escaped, without the outer pipes.
function cells(line) {
  const trimmed = line.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '');
  return trimmed.split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, '|'));
}

// The delimiter row under the header: a cell of dashes per column, each with optional alignment colons.
const delimiter = (line) => /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(line) && line.includes('-');

/** @param {string} body @returns {{ lead: string[], columns: string[], rows: string[][], after: string[] } | null} */
export function markdownTable(body = '') {
  const lines = body.split(/\r?\n/);
  for (let index = 0; index < lines.length - 1; index += 1) {
    if (!lines[index].includes('|') || !delimiter(lines[index + 1])) continue;
    const columns = cells(lines[index]);
    if (cells(lines[index + 1]).length !== columns.length || columns.length < 2) continue;
    let end = index + 2;
    const rows = [];
    const rowLine = (line) => /^\s*\|.*\|\s*$/.test(line ?? '');
    for (;;) {
      while (end < lines.length && lines[end].trim() && lines[end].includes('|')) {
        const row = cells(lines[end]);
        rows.push(columns.map((_, column) => row[column] ?? ''));
        end += 1;
      }
      // Rows the writer went on with after a blank line, no header of their own and as many cells as the table's, are
      // the same table's rows (aloha 2026-11-18: two runs of inseam and size rows were shown as notes, pipes and all).
      let next = end;
      while (next < lines.length && !lines[next].trim()) next += 1;
      if (next === end || !rowLine(lines[next]) || delimiter(lines[next + 1] ?? '') || cells(lines[next]).length !== columns.length) break;
      end = next;
    }
    const paragraphs = (text) => text.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
    return { lead: paragraphs(lines.slice(0, index).join('\n')), columns, rows, after: paragraphs(lines.slice(end).join('\n')) };
  }
  return null;
}
