import { existsSync } from 'node:fs';
import { open, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

// The answers of a reference site that refuses this machine rather than lacking the page (site12's hhmhotels.com,
// 2026-11-17: 403 to every client, a browser's included, days after it was measured). A step that measures the live
// reference (patterns, density) keeps the measure an earlier run took of the same address on one of these, reported
// as stale, instead of stopping a run that changed nothing of the reference; one never measured still stops it.
export const BLOCKED_STATUSES = Object.freeze([401, 403, 429, 503]);

// The live reference is measured once for each capture (owner: a capture is one visit, its DOM and its shots taken
// together; a finished site is not made again). The patterns and density steps run again whenever their code or the
// site plan changes, and each run visited the live pages: Strandmill 2026-11-20, a template update away from its
// 2026-11-14 capture, measured swimwearbali.com's redesigned product page (13 sections become 7, its photo band gone)
// and took other split rows, no signature band and more photo walls on every product page, while the design review
// still compared its pages with the shots of the 14th. A run beside the capture an earlier run measured keeps that
// measure (pattern-inventory.json, its section crops, reference-density.json: each records the capture as `capture`);
// the pages are visited again only beside another capture (site-run --from capture --to capture-check: the DOM, the
// shots and the measures of one visit), for a page never measured, or where the site has no capture at all.
// A measure recorded before captures were (no `capture`) is taken as the present capture's.
//
// The capture's mark: the latest capturedAt of the captured DOMs (docs/research/raw/desktop-1440.json and
// docs/research/reference-pages/<folder>/raw/desktop-1440.json, capture-reference.mjs); null without any.
export async function captureStamp(root) {
  const pages = resolve(root, 'docs/research/reference-pages');
  const folders = existsSync(pages) ? (await readdir(pages)).map((name) => resolve(pages, name, 'raw')) : [];
  const stamps = [];
  for (const dir of [resolve(root, 'docs/research/raw'), ...folders]) {
    // The key is among the file's first (schemaVersion, capturedAt, url, ...): the head is read, not megabytes of DOM.
    const file = await open(resolve(dir, 'desktop-1440.json'), 'r').catch(() => null);
    if (!file) continue;
    try {
      const { buffer, bytesRead } = await file.read(Buffer.alloc(4096), 0, 4096, 0);
      const stamp = /"capturedAt"\s*:\s*"([^"]+)"/.exec(buffer.toString('utf8', 0, bytesRead))?.[1];
      if (stamp) stamps.push(stamp);
    } finally {
      await file.close();
    }
  }
  return stamps.sort().at(-1) ?? null;
}
// Whether an earlier report's measures (pattern-inventory.json, reference-density.json) stand beside the capture.
export const measuredBeside = (previous, stamp) => Boolean(stamp && previous && (previous.capture == null || previous.capture === stamp));
