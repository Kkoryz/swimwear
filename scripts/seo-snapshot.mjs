#!/usr/bin/env node

// Records the SEO snapshot of the current build (docs/research/seo-snapshot.json). After the owner has reviewed a
// release's drift (or after it is deployed), --accept makes it the baseline the next release is compared with
// (docs/research/seo-baseline.json). Stage 11 holds on critical drift from the baseline.
// Usage: node scripts/seo-snapshot.mjs [--accept --by "<name>"]

import { cliArgs, runMain } from './lib/cli.mjs';
import { acceptSnapshot, writeSnapshot } from './lib/seo-snapshot.mjs';

runMain(import.meta.url, async () => {
  const { values } = cliArgs({ accept: { type: 'boolean' }, by: { type: 'string' } });
  if (values.accept) console.log(`baseline accepted: ${Object.keys((await acceptSnapshot({ by: values.by })).pages).length} pages`);
  else console.log(`snapshot: ${Object.keys((await writeSnapshot()).pages).length} pages`);
});
