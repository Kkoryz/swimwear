#!/usr/bin/env node

// Records when each page's content last changed (src/data/page-dates.json, see scripts/lib/page-dates.mjs). The
// importer runs it after every import; commit the file with the content so every release build agrees on the dates.
// Usage: node scripts/page-dates.mjs

import { runMain } from './lib/cli.mjs';
import { recordPageDates } from './lib/site-pages.mjs';

runMain(import.meta.url, async () => {
  const { changed } = await recordPageDates();
  console.log(`page dates: ${changed.length} page(s) changed${changed.length ? `: ${changed.join(', ')}` : ''}`);
});
