#!/usr/bin/env node
// The quick check of a change (owner 2026-11-13: "别跑了 只判断改动的页面"): the site built, served from dist on a free
// port, the navigation audit and the layout audit of the pages given (all pages without --routes; the audit cache
// keeps unchanged pages). No agent, no photos, no state: a step of site-run is not passed by it, and the gate reads
// the full audits and the review only (lib/verified-build.mjs). A partial layout report goes to .pipeline/check/.
// Usage: node scripts/site-check.mjs [--routes /a/,/b/] [--no-build]

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { auditAuthoringLayout } from './audit-authoring-layout.mjs';
import { auditNavigationShell } from './audit-navigation-shell.mjs';
import { cliArgs, runMain } from './lib/cli.mjs';
import { serveStatic } from './lib/static-server.mjs';

export async function siteCheck({ root = process.cwd(), routes = null, build = true, log = console.log } = {}) {
  const started = Date.now();
  const seconds = () => Math.round((Date.now() - started) / 1000);
  if (build) {
    const require = createRequire(resolve(root, 'package.json'));
    const astroPackage = require.resolve('astro/package.json');
    const astro = resolve(dirname(astroPackage), require(astroPackage).bin.astro);
    const built = spawnSync(process.execPath, [astro, 'build'], { cwd: root, encoding: 'utf8' });
    if (built.status !== 0) throw new Error(`the site does not build:\n${`${built.stdout}${built.stderr}`.slice(-2000)}`);
    log(`built (${seconds()}s)`);
  }
  const server = await serveStatic(resolve(root, 'dist'), 0);
  const baseUrl = `http://127.0.0.1:${server.port}/`;
  const result = { navigation: null, layout: null, seconds: 0 };
  try {
    result.navigation = await auditNavigationShell({ baseUrl, rootDir: root }).then((report) => ({ failures: report.failures.length }), (error) => ({ error: error.message }));
    log(`navigation: ${result.navigation.error ?? `${result.navigation.failures} failure(s)`} (${seconds()}s)`);
    result.layout = await auditAuthoringLayout({ baseUrl, rootDir: root, routes }).then((report) => ({ pages: report.routeCount, cases: report.caseCount, cached: report.cached, failures: 0 }), (error) => ({ error: error.message }));
    log(`layout${routes ? ` of ${routes.join(', ')}` : ''}: ${result.layout.error ?? `${result.layout.pages} page(s), ${result.layout.cached} unchanged, 0 failures`} (${seconds()}s)`);
  } finally {
    await server.close();
  }
  result.seconds = seconds();
  result.passed = !result.navigation.error && !result.layout.error;
  return result;
}

runMain(import.meta.url, async () => {
  const { values } = cliArgs({ routes: { type: 'string' }, 'no-build': { type: 'boolean' } });
  const routes = values.routes ? values.routes.split(',').map((route) => route.trim()).filter(Boolean) : null;
  const result = await siteCheck({ routes, build: values['no-build'] !== true });
  console.log(`${result.passed ? 'passed' : 'FAILED'} in ${result.seconds}s (a quick check: the release gate still needs the full audits and the design review)`);
  if (!result.passed) process.exitCode = 1;
});
