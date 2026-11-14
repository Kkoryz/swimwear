import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { cssHooksDoc } from '../list-css-hooks.mjs';

test('CSS_HOOKS.md is current: every hook and every template variant the agents may use is listed', async () => {
  const { doc } = await cssHooksDoc();
  assert.equal((await readFile('docs/research/CSS_HOOKS.md', 'utf8')).replace(/\r\n/g, '\n'), doc, 'run node scripts/list-css-hooks.mjs');
  assert.match(doc, /phoneGroups\?: 'open' \| 'collapsed'/);
  // The overlay hero's geometry is the treatment's to set (a competitor's compact centred title strip): its height,
  // where its copy sits, the lead's size.
  for (const hook of ['--hero-min-height', '--hero-align', '--size-lead']) assert.match(doc, new RegExp(`\\| \`${hook}\` \\|`), `${hook} is a hook`);
});
