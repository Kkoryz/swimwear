import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// The owner fills `real` in 06-replacements.json; each filled entry's `text` is found in the article and replaced.
export function applyReplacements(runDir) {
  const articlePath = join(runDir, '06-article.md');
  const listPath = join(runDir, '06-replacements.json');
  let text = readFileSync(articlePath, 'utf8');
  const list = JSON.parse(readFileSync(listPath, 'utf8'));
  const applied = [];
  for (const r of list.replacements) {
    if (r.status === 'replaced' || typeof r.real !== 'string' || !r.real.trim()) continue;
    if (!text.includes(r.text)) throw new Error(`${r.id}: its text is no longer in the article`);
    text = text.replace(r.text, () => r.real.trim());
    r.status = 'replaced';
    applied.push(r.id);
  }
  writeFileSync(articlePath, text);
  writeFileSync(listPath, JSON.stringify(list, null, 2));
  return { applied, remaining: list.replacements.filter((r) => r.status !== 'replaced').map((r) => r.id) };
}
