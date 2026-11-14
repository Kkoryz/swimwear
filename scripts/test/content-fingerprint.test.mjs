import assert from 'node:assert/strict';
import test from 'node:test';

import { crossSiteDuplicates, mainText, minhash, shingles, similarity } from '../lib/content-fingerprint.mjs';

const words = (count, seed) => Array.from({ length: count }, (_, index) => `${seed}${index % 97}w${index}`).join(' ');
const page = (text) => ({ minhash: minhash(shingles(mainText(`<header>Menu</header><main><nav>Home</nav><h1>T</h1><p>${text}</p><script>x()</script></main>`))) });

test('pages with a few words changed read as near-duplicates across sites; different pages do not', () => {
  const base = words(400, 'fabric');
  const tweaked = base.replace('fabric5w5', 'bikini').replace('fabric40w40', 'swim').replace('fabric90w90', 'resort');
  const own = { host: 'strandmill.com', pages: { '/bikinis-manufacturer/': page(base), '/about/': page(words(300, 'story')) } };
  const other = { host: 'seamtide.com', pages: { '/bikini-factory/': page(tweaked), '/contact/': page(words(300, 'contact')) } };
  assert.ok(similarity(own.pages['/bikinis-manufacturer/'].minhash, other.pages['/bikini-factory/'].minhash) > 0.9);
  assert.deepEqual(crossSiteDuplicates(own, [other]).map((item) => `${item.route}~${item.host}${item.otherRoute}`), ['/bikinis-manufacturer/~seamtide.com/bikini-factory/']);
  assert.deepEqual(crossSiteDuplicates(own, [{ ...other, host: 'strandmill.com' }]), [], 'the site is not compared with itself');
  assert.equal(mainText('<main><p>Hello, World!</p><script>bad()</script></main>'), 'hello world');
});

test('text in any script counts: German and Chinese pages get fingerprints, not an empty set', async () => {
  const { mainText, minhash, shingles, similarity } = await import('../lib/content-fingerprint.mjs');
  const zh = mainText('<main><p>我们的工厂位于浙江绍兴，每款每色起订量五十件，支持小批量订单。</p></main>');
  assert.ok(shingles(zh).size > 5);
  const de = mainText('<main><p>Größe und Qualität der Stoffe werden vor dem Zuschnitt geprüft und dokumentiert.</p></main>');
  assert.match(de, /größe und qualität/);
  assert.equal(similarity(minhash(shingles(zh)), minhash(shingles(zh))), 1);
});

test('only this host\'s two config files are its own', async () => {
  const { ownConfigFiles } = await import('../lib/nginx-config.mjs');
  assert.deepEqual(ownConfigFiles('example.com'), ['example.com.conf', 'example.com-headers.conf']);
  assert.ok(!ownConfigFiles('example.com').includes('example.com.au.conf'));
});
