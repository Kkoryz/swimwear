import { resolve } from 'node:path';
import { readJson } from './json-io.mjs';

// The reference site's photos per photography class, as local files with what each shows (when the design analysis
// described it): { hero: [{ path, subject }], product: [...], ... }. These are style references only.
export async function styleReferences(root, components) {
  const analysis = await readJson(resolve(root, 'docs/research/analysis/media.json'), null);
  const item = (entry) => ({ path: entry.localPath, subject: entry.subject ?? '' });
  if (analysis?.pools) {
    const refs = Object.fromEntries(Object.entries(analysis.pools).map(([kind, items]) => [kind, items.filter((entry) => entry.localPath).map(item)]));
    refs.hero = (analysis.hero || []).filter((entry) => entry.localPath).map(item);
    return refs;
  }
  // The list recorded by a previous style analysis (paths only).
  const style = await readJson(resolve(root, 'docs/research/image-style.json'), null);
  if (style?.kinds) {
    const recorded = Object.fromEntries(Object.entries(style.kinds).filter(([kind]) => kind !== 'site').map(([kind, entry]) => [kind, entry.refs.map((path) => ({ path, subject: '' }))]));
    if (Object.keys(recorded).length) return recorded;
  }
  // Older analyses: the template's own reference-placeholder pools under public/. Once the library has replaced them
  // (origin "library") they are our own photos, never style references: image-style.json keeps the reference list.
  if (components.media?.origin !== 'reference-placeholder') throw new Error('no reference photo list: docs/research/analysis/media.json has no pools and the template media are not the reference placeholders');
  const local = (entry) => ({ path: resolve(root, 'public', entry.src.replace(/^\//, '')), subject: entry.alt ?? '' });
  const refs = Object.fromEntries(Object.entries(components.media?.pools || {}).map(([kind, items]) => [kind, items.map(local)]));
  refs.hero = (components.media?.heroOptions || [components.media?.hero]).filter((entry) => entry?.src).map(local);
  return refs;
}
