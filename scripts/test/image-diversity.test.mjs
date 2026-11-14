import assert from 'node:assert/strict';
import test from 'node:test';

import { lookAlikes, normalise, symmetricEigenvalues, vendiScore } from '../lib/image-diversity.mjs';

test('Vendi Score counts distinct photos: identical ones count once, orthogonal ones each count', () => {
  const a = normalise([1, 0, 0]);
  const b = normalise([0, 1, 0]);
  const c = normalise([0, 0, 1]);
  assert.ok(Math.abs(vendiScore([a, b, c]) - 3) < 1e-6);
  assert.ok(Math.abs(vendiScore([a, a, a]) - 1) < 1e-6);
  const eigen = symmetricEigenvalues([[2, 1], [1, 2]]).sort();
  assert.ok(Math.abs(eigen[0] - 1) < 1e-9 && Math.abs(eigen[1] - 3) < 1e-9);
});

test('look-alikes send back the later photo and keep the first', () => {
  const photos = [{ id: 'x', vector: normalise([1, 0]) }, { id: 'y', vector: normalise([1, 0.1]) }, { id: 'z', vector: normalise([0, 1]) }];
  assert.deepEqual(lookAlikes(photos).map((pair) => [pair.keep, pair.reject]), [['x', 'y']]);
});

test('the most redundant photo is the one closest to all the others', async () => {
  const { mostRedundant } = await import('../lib/image-diversity.mjs');
  const photos = [{ id: 'a', vector: normalise([1, 0, 0]) }, { id: 'b', vector: normalise([1, 1, 0]) }, { id: 'c', vector: normalise([0, 1, 0]) }, { id: 'd', vector: normalise([0, 0, 1]) }];
  assert.equal(mostRedundant(photos)[0].id, 'b');
});
