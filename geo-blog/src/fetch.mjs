import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { citedUrls, priorityUrls } from './urls.mjs';

export function readReceipts(runDir) {
  const dir = join(runDir, '02-receipts');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));
}

// Step 3: fetch the priority cited pages with the local Firecrawl, cached by URL id.
export async function fetchSources(config, { dryRun = false, concurrency = 3, log = console.log } = {}) {
  const pages = priorityUrls(citedUrls(readReceipts(config.runDir)), config.competitors);
  writeFileSync(join(config.runDir, '03-priority.json'), JSON.stringify(pages, null, 2));
  const outDir = join(config.runDir, '03-sources');
  mkdirSync(outDir, { recursive: true });
  const todo = pages.filter((p) => !existsSync(join(outDir, `${p.id}.json`)));
  log(`priority pages: ${pages.length}, to fetch: ${todo.length}`);
  if (dryRun) return { pages: pages.length, fetched: 0, failed: 0 };

  let fetched = 0, failed = 0;
  const scrape = async (page) => {
    const res = await fetch(`${config.firecrawl_base_url}/v2/scrape`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: page.url, formats: ['markdown'], onlyMainContent: true, timeout: 60000 }),
    }).catch((e) => ({ ok: false, status: 0, json: async () => ({ error: String(e) }) }));
    const body = await res.json().catch(() => ({}));
    const ok = res.ok && body.success;
    writeFileSync(join(outDir, `${page.id}.json`), JSON.stringify({
      ...page,
      fetched_at: new Date().toISOString(),
      status: ok ? 'ok' : 'failed',
      http_status: res.status,
      title: body.data?.metadata?.title ?? null,
      markdown: body.data?.markdown ?? null,
      error: ok ? null : body.error ?? `HTTP ${res.status}`,
    }, null, 2));
    ok ? fetched++ : failed++;
    log(`${ok ? 'ok' : 'failed'} ${page.url}`);
  };
  const queue = [...todo];
  await Promise.all(Array.from({ length: concurrency }, async () => { while (queue.length) await scrape(queue.shift()); }));
  return { pages: pages.length, fetched, failed };
}
