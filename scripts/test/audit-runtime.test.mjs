import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { assertServesDist, isBrowserCrash, isProcessCrash, retryCrash, takeRunLock } from '../lib/audit-runtime.mjs';

const site = async () => {
  const root = await mkdtemp(join(tmpdir(), 'audit-runtime-'));
  await mkdir(join(root, 'dist'), { recursive: true });
  await writeFile(join(root, 'dist/index.html'), '<html>ours</html>');
  return root;
};
const answering = (body) => async () => ({ text: async () => body });

test("an audit measures this site's build only: another site on the port stops it", async () => {
  const root = await site();
  await assertServesDist('http://127.0.0.1:4421/', root, answering('<html>ours</html>'));
  await assert.rejects(assertServesDist('http://127.0.0.1:4399/', root, answering('<html>another session</html>')), /does not serve this site's build/);
  // Without a build there is nothing to compare (a test's own pages).
  await assertServesDist('http://127.0.0.1:1/', join(root, 'none'), answering('x'));
});

test('a crashed browser or process is tried once more; a page that fails is not', async () => {
  assert.ok(isBrowserCrash(new Error('browser.newPage: Target crashed ')));
  assert.ok(!isBrowserCrash(new Error('page.goto: net::ERR_CONNECTION_REFUSED')));
  assert.ok(isProcessCrash(3221225794), '0xC0000142: a process the machine failed to start');
  assert.ok(!isProcessCrash(1) && !isProcessCrash(2) && !isProcessCrash(null));
  let calls = 0;
  let reset = 0;
  assert.equal(await retryCrash(async () => { calls += 1; if (calls === 1) throw new Error('Target crashed'); return 'measured'; }, async () => { reset += 1; }), 'measured');
  assert.deepEqual([calls, reset], [2, 1]);
  await assert.rejects(retryCrash(async () => { throw new Error('a real failure'); }), /a real failure/);
});

test('one run on a site at a time; a lock left by a run that is gone is taken over', async () => {
  const root = await site();
  const release = await takeRunLock(root, 111, () => true);
  await assert.rejects(takeRunLock(root, 222, () => true), /another run is going on this site \(process 111/);
  const taken = await takeRunLock(root, 333, () => false);
  assert.equal(await readFile(join(root, '.pipeline/run.lock'), 'utf8'), '333');
  await release();
  assert.ok(existsSync(join(root, '.pipeline/run.lock')), "a run lets go of its own lock only");
  await taken();
  assert.ok(!existsSync(join(root, '.pipeline/run.lock')));
});

test('a full-page shot the browser could not capture is taken once more', async () => {
  const { fullPageShot } = await import('../lib/audit-runtime.mjs');
  let tries = 0;
  const page = { screenshot: async () => { tries += 1; if (tries === 1) throw new Error('page.screenshot: Protocol error (Page.captureScreenshot): Unable to capture screenshot'); return 'png'; } };
  assert.equal(await fullPageShot(page, 1), 'png');
  assert.equal(tries, 2);
});
