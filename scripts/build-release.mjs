#!/usr/bin/env node

// Release build: astro build with SITE_RELEASE=1, so competitor placeholder files are removed from dist and any page
// still using one fails the build (scripts/lib/release-guard.mjs). Records docs/research/seo-snapshot.json for the
// drift check and docs/research/content-fingerprint.json for the cross-site comparison. Stage 11 preflight runs on
// this output.
// Usage: node scripts/build-release.mjs

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { writeFingerprint } from './lib/cross-site.mjs';
import { LEAK_MESSAGE } from './lib/release-guard.mjs';
import { writeSnapshot } from './lib/seo-snapshot.mjs';

// The astro CLI from its package's bin entry (the package does not export the file itself).
const require = createRequire(resolve('package.json'));
const astroPackage = require.resolve('astro/package.json');
const astro = resolve(dirname(astroPackage), require(astroPackage).bin.astro);
// This process too: the snapshot and the fingerprint it records read the pages as the release build has them.
process.env.SITE_RELEASE = '1';
const result = spawnSync(process.execPath, [astro, 'build'], { stdio: ['inherit', 'pipe', 'pipe'], encoding: 'utf8', env: process.env });
process.stdout.write(result.stdout ?? '');
process.stderr.write(result.stderr ?? '');
// A good build records its SEO snapshot. A build the release guard refused because pages still show competitor photos
// waits for the owner's photos (exit 2, site-run WAITS; the preflight lists them); any other failure is exit code 1.
if (result.status === 0) { await writeSnapshot(); await writeFingerprint(); }
const refused = `${result.stdout}${result.stderr}`.includes(LEAK_MESSAGE);
process.exitCode = result.status === 0 ? 0 : refused ? 2 : 1;
