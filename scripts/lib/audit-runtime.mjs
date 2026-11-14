// What keeps a run's measurements about this site and a run from colliding with another (the hotel run of 2026-11-12):
// an audit pointed at a port another session's preview held measured that site and cached its numbers as ours; a
// browser that crashed under load (Target crashed, a Windows process that failed to start: 0xC0000142) failed the
// whole run at its audits; two runs started on one site ran its photo briefs twice.

import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

// The page the server sends for the site's home is the home this site built (dist/index.html), byte for byte (the
// static server and astro preview send the built file as it is). Throws when another site answers; nothing to compare
// without a build (a test's own measure).
export async function assertServesDist(baseUrl, root = process.cwd(), fetcher = fetch) {
  const built = resolve(root, 'dist/index.html');
  if (!existsSync(built)) return;
  const response = await fetcher(new URL('/', baseUrl).href).catch((error) => { throw new Error(`nothing answers at ${baseUrl} (${error.message}): serve this site's dist there first`); });
  const served = await response.text();
  if (served !== await readFile(built, 'utf8')) throw new Error(`${baseUrl} does not serve this site's build (its home differs from dist/index.html): another server holds the port, or the build is not the one served`);
}

// A failure of the browser or the process, not of the page: worth one more try.
const CRASH = /Target (page, context or browser )?(crashed|closed)|Browser (has been )?closed|browser has disconnected|Page crashed|ECONNRESET|Unable to capture screenshot/i;
export const isBrowserCrash = (error) => CRASH.test(String(error?.message ?? error));
// Windows exit codes of a process that crashed or failed to start (NTSTATUS 0xC0000000 and up), as Node reports them.
export const isProcessCrash = (code) => typeof code === 'number' && code >= 0xC0000000;

// Runs work again once when it failed by a crash (onCrash: what to reset first, e.g. a fresh browser).
export async function retryCrash(work, onCrash = async () => {}) {
  try { return await work(); } catch (error) {
    if (!isBrowserCrash(error)) throw error;
    await onCrash(error);
    return work();
  }
}

// A full-page shot, taken once more after a moment when the browser could not capture it (the hotel run of 2026-11-13
// stopped at its design shots on "Unable to capture screenshot", a shot the first pass of the same pages had taken).
export const fullPageShot = (page, wait = 1500) => retryCrash(() => page.screenshot({ fullPage: true }), () => new Promise((done) => setTimeout(done, wait)));

// One run on a site at a time: .pipeline/run.lock holds the running process's id. A lock whose process is gone is
// taken over. Returns the release function.
export async function takeRunLock(root, pid = process.pid, alive = processAlive) {
  const path = resolve(root, '.pipeline/run.lock');
  if (existsSync(path)) {
    const holder = Number.parseInt(await readFile(path, 'utf8'), 10);
    if (holder && holder !== pid && alive(holder)) throw new Error(`another run is going on this site (process ${holder}, ${path}); wait for it, or stop it first`);
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, String(pid));
  return async () => { if (existsSync(path) && Number.parseInt(await readFile(path, 'utf8'), 10) === pid) await rm(path, { force: true }); };
}

function processAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; }
}
