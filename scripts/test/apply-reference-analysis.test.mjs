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
  const { readableTokens, rootTokens } = await import('../lib/token-contrast.mjs');
  const { contrastRatio } = await import('../lib/contrast.mjs');
  const tokens = designLockTokens(lock);
  const page = rootTokens([':root { --surface-primary: #FFFFFF; --surface-secondary: #f6f3ed; --text-primary: #171717; --text-muted: #5f5f5f; --text-inverse: #fff; --surface-dark: #171717; --accent: #306180; --accent-contrast: #fff; --link: #08A4EC; --input-border: #767676; }']);
  const { tokens: derived } = readableTokens(page, new Set(Object.keys(tokens)));
  const link = derived['--link'];
  const rgb = (value) => value.match(/\d+/g).slice(0, 3).map(Number);
  assert.ok(contrastRatio(rgb(link.value), [255, 255, 255]) >= 4.5 && contrastRatio(rgb(link.value), [246, 243, 237]) >= 4.5);
  assert.match(link.note, /the reference's #08A4EC is 2\.\d+:1 on #FFFFFF .*a shade of it in its own hue/);
  assert.equal(readableTokens(new Map([...page, ['--link', '#0a5f8a']]), new Set(Object.keys(tokens))).tokens['--link'], undefined);
  const css = writeTokenBlock(':root {\n}\n', tokens, { '--link': link });
  assert.ok(css.includes(`  ${link.note}\n  --link: ${link.value};`));
  // A person's note on another token: kept when the analysis is applied again; the code's own derivation is made anew.
  const noted = css.replace('  --accent: #306180;', '  /* one step darker for AA */\n  --accent: #2a5570;');
  const again = writeTokenBlock(noted, tokens, { '--link': link });
  assert.match(again, /\/\* one step darker for AA \*\/\n  --accent: #2a5570;/);
  assert.equal(writeTokenBlock(again, tokens, { '--link': link }), again);
  assert.doesNotMatch(writeTokenBlock(again, tokens), /--link: rgb/, 'a derived colour no longer needed leaves the block');
});

test('the template\'s default tokens leave its :root whatever the line endings, so the design lock is what the page paints (four-site audit 2026-11-17)', async () => {
  const { rootTokens } = await import('../lib/token-contrast.mjs');
  const crlf = '@import "tailwindcss";\r\n@import "./template.css";\r\n\r\n:root {\r\n  --surface-primary: #ffffff;\r\n  --accent: #235347;\r\n  --gutter: 20px;\r\n}\r\n';
  const once = writeTokenBlock(crlf, designLockTokens(lock));
  assert.equal(rootTokens([once]).get('--accent'), '#306180');
  assert.equal(rootTokens([once]).get('--gutter'), '20px');
  // A workspace whose block was written while the defaults stayed after it: the next write takes them out.
  const stale = once.replace(':root {\r\n  --gutter', ':root {\r\n  --surface-primary: #ffffff;\r\n  --accent: #235347;\r\n  --gutter');
  assert.equal(rootTokens([stale]).get('--accent'), '#235347');
  const mended = writeTokenBlock(stale, designLockTokens(lock));
  assert.equal(rootTokens([mended]).get('--accent'), '#306180');
  assert.equal(writeTokenBlock(mended, designLockTokens(lock)), mended);
});
