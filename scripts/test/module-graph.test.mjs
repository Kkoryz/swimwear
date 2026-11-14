import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { inputsHash } from '../site-run.mjs';
import { codeClosure, relativeImports } from '../lib/module-graph.mjs';

test('a script\'s code is its file and every file it imports by a relative path', async () => {
  assert.deepEqual(relativeImports("import a from './a.mjs';\nexport { b } from '../b.mjs';\nconst c = await import('./c.mjs');\nimport x from 'node:fs';\nimport y from 'sharp';\nimport k from '../../config/k.json' with { type: 'json' };"), ['./a.mjs', '../b.mjs', './c.mjs', '../../config/k.json']);
  const closure = await codeClosure(new URL('../..', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'), ['scripts/import-site-factory.mjs']);
  assert.ok(closure.includes('scripts/lib/page-assembly.mjs'));
  assert.ok(closure.includes('scripts/lib/sf-kinds.mjs'));
  assert.ok(closure.includes('config/block-kinds.json'), 'a JSON import is code too');
  assert.ok(!closure.includes('scripts/lib/image-plan.mjs'), 'the image plan is not import code');
});

test('a step\'s inputs count by content: a snapshot in another folder is the same input; only its code closure counts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'inputs-'));
  for (const dir of ['snapA', 'snapB', 'scripts/lib']) await mkdir(join(root, dir), { recursive: true });
  for (const dir of ['snapA', 'snapB']) await writeFile(join(root, dir, 'facts.yaml'), 'facts: [moq]\n');
  await writeFile(join(root, 'scripts/run.mjs'), "import { a } from './lib/a.mjs';\n");
  await writeFile(join(root, 'scripts/lib/a.mjs'), 'export const a = 1;\n');
  await writeFile(join(root, 'scripts/lib/other.mjs'), 'export const b = 1;\n');
  const hash = (snap) => inputsHash(root, [`${join(root, snap)}/facts.yaml`, 'code:scripts/run.mjs']);
  const before = await hash('snapA');
  assert.equal(await hash('snapB'), before, 'the same content in another folder');
  await writeFile(join(root, 'scripts/lib/other.mjs'), 'export const b = 2;\n');
  assert.equal(await hash('snapA'), before, 'a file outside the closure');
  await writeFile(join(root, 'scripts/lib/a.mjs'), 'export const a = 2;\n');
  assert.notEqual(await hash('snapA'), before, 'a file inside the closure');
});
