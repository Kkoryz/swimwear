import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { postLaunch } from '../post-launch.mjs';

test('after a deploy: the live site is checked first, and search engines are told of the changed pages only when it passes', async () => {
  // Fable's 11-14 plan, item 10: verify-live, IndexNow and the SEO baseline were each run by hand, in no set order.
  const root = await mkdtemp(join(tmpdir(), 'post-launch-'));
  const told = [];
  const submit = async ({ dryRun }) => { told.push(dryRun); return { submitted: dryRun ? 0 : 2, urlList: ['https://x.test/a/', 'https://x.test/b/'] }; };
  const broken = await postLaunch({ root, verify: async () => ({ origin: 'https://x.test', problems: [{ check: 'robots', detail: 'missing' }] }), submit });
  assert.equal(broken.passed, false);
  assert.deepEqual(told, [], 'a broken live site is not announced');
  const live = await postLaunch({ root, verify: async () => ({ origin: 'https://x.test', problems: [] }), submit, dryRun: true });
  assert.equal(live.passed, true);
  assert.deepEqual(told, [true]);
  assert.equal(live.indexNow.urls, 2);
  const written = JSON.parse(await readFile(join(root, 'docs/research/post-launch.json'), 'utf8'));
  assert.equal(written.live.problems, 0);
  // The accepted SEO baseline stays the owner's (seo-snapshot.mjs --accept --by): the summary says so, it is not done here.
  assert.match(written.baseline, /--accept/);
});
