import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveGoogleLink } from '../src/engines/google_aio.mjs';

// /goto tokens need a live redirect; the direct and /url forms resolve without the network.
const page = { context: () => ({ request: { get: async () => ({ headers: () => ({ location: 'https://target.com/a' }) }) } }) };

test('direct links pass through, Google pages are dropped', async () => {
  assert.equal(await resolveGoogleLink(page, 'https://makersrow.com/x'), 'https://makersrow.com/x');
  assert.equal(await resolveGoogleLink(page, 'https://www.google.com/search?q=x'), null);
  assert.equal(await resolveGoogleLink(page, 'javascript:void(0)'), null);
});

test('/url?q= and /goto redirects resolve to the target', async () => {
  assert.equal(await resolveGoogleLink(page, 'https://www.google.com/url?q=https://a.com/p&sa=U'), 'https://a.com/p');
  assert.equal(await resolveGoogleLink(page, 'https://www.google.com/goto?url=CAES123'), 'https://target.com/a');
});
