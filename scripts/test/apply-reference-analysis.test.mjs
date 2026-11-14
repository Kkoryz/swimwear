import assert from 'node:assert/strict';
import test from 'node:test';

import { designLockTokens, writeTokenBlock } from '../apply-reference-analysis.mjs';

const lock = { tokens: { '--surface-primary': '#FFFFFF', '--accent': '#306180' }, supplementaryRoles: { link: { token: '--link', value: '#08A4EC' } } };

test('design-lock tokens include supplementary roles', () => {
  assert.deepEqual(designLockTokens(lock), { '--surface-primary': '#FFFFFF', '--accent': '#306180', '--link': '#08A4EC' });
});

test('the token block replaces default definitions once and is idempotent', () => {
  const css = '@import "tailwindcss";\n@import "./template.css";\n\n:root {\n  --surface-primary: #ffffff;\n  --accent: #235347;\n  --gutter: 20px;\n}\n';
  const once = writeTokenBlock(css, designLockTokens(lock));
  assert.equal((once.match(/--accent:/g) || []).length, 1);
  assert.match(once, /--accent: #306180;/);
  assert.match(once, /--gutter: 20px;/);
  assert.equal(writeTokenBlock(once, designLockTokens(lock)), once);
});

test('a link colour below AA on the page is darkened in its own hue, and an adjustment noted in the block survives a new analysis', async () => {
  const { readableLink } = await import('../apply-reference-analysis.mjs');
  const { contrastRatio } = await import('../lib/contrast.mjs');
  const tokens = designLockTokens(lock);
  const link = readableLink(tokens);
  const rgb = (hex) => [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16));
  assert.ok(contrastRatio(rgb(link.value), [255, 255, 255]) >= 4.5);
  assert.match(link.note, /#08A4EC as link text is 2\.\d:1/);
  assert.equal(readableLink({ ...tokens, '--link': '#0a6fa0' }), null);
  const css = writeTokenBlock(':root {\n}\n', tokens, { '--link': link });
  assert.ok(css.includes(`  ${link.note}\n  --link: ${link.value};`));
  // A person's note on another token: kept when the analysis is applied again.
  const noted = css.replace('  --accent: #306180;', '  /* one step darker for AA */\n  --accent: #2a5570;');
  const again = writeTokenBlock(noted, tokens, { '--link': link });
  assert.match(again, /\/\* one step darker for AA \*\/\n  --accent: #2a5570;/);
  assert.equal(writeTokenBlock(again, tokens, { '--link': link }), again);
});
