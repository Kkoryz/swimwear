#!/usr/bin/env node

// The local Google rules library by hand (lib/rules-library.mjs; owner 2026-11-17: "就是内存得释放"):
// - start: starts it if it does not answer and holds it open (a manual holder) until stop; exit 2 when it cannot start
//   (the audit step's wait code, scripts/claude-seo-audit.mjs UNAVAILABLE);
// - stop: lets go of the manual holders and stops the library, Docker Desktop and the WSL VM as far as nobody else
//   needs them (an audit still holding it, another container, another WSL distribution, a connection from outside);
// - status: whether it answers, and who holds it.
// Usage: node scripts/rules-library.mjs start|stop|status

import { runMain, usage } from './lib/cli.mjs';
import { createRulesLibrary } from './lib/rules-library.mjs';

const USAGE = 'usage: node scripts/rules-library.mjs start|stop|status';

runMain(import.meta.url, async () => {
  const command = process.argv[2];
  const library = createRulesLibrary();
  if (command === 'start') {
    const lease = await library.acquire({ label: 'manual (scripts/rules-library.mjs start)', persistent: true });
    if (!lease.ok) { console.error(`the rules library did not start: ${lease.detail}`); process.exitCode = 2; return; }
    console.log(`the rules library answers at ${library.settings.url} (${lease.started ? 'started' : 'already running'}); held as ${lease.id} until node scripts/rules-library.mjs stop`);
    return;
  }
  if (command === 'stop') {
    const result = await library.release({ manual: true });
    console.log(`stopped: ${result.stopped || 'nothing'} (${result.reason})`);
    if (result.warnings.length) process.exitCode = 1;
    return;
  }
  if (command === 'status') { console.log(JSON.stringify(await library.status(), null, 2)); return; }
  usage(USAGE);
});
