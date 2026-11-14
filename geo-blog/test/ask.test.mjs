import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isErrorReply, isNonAnswer } from '../src/ask.mjs';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { judgeHomes } from '../src/codex-exec.mjs';

test('short app error messages are not answers', () => {
  assert.equal(isErrorReply('Sorry, something went wrong. Please try your request again.'), true);
  assert.equal(isErrorReply('An error occurred while generating the response.'), true);
  assert.equal(isErrorReply('Choosing a manufacturer starts with your brief. '.repeat(20) + 'If something went wrong in sampling, ask again.'), false);
  assert.equal(isErrorReply(''), false);
});

test('a short reply with no citations is a failure, whatever it says; no AI Overview at all is a result', () => {
  const refusal = { answer_text: "I'm having a hard time fulfilling your request. Can I help you with something else instead?", citations: [] };
  assert.equal(isNonAnswer('gemini', refusal), true);
  assert.equal(isNonAnswer('chatgpt', { answer_text: '', citations: [] }), true);
  assert.equal(isNonAnswer('gemini', { answer_text: 'Short but sourced.', citations: [{ url: 'https://a.com' }] }), false);
  assert.equal(isNonAnswer('claude', { answer_text: 'A full answer without links. '.repeat(20), citations: [] }), false);
  assert.equal(isNonAnswer('google_aio', { answer_text: '', citations: [] }), false);
  assert.equal(isNonAnswer('google_aio', { answer_text: 'A stub overview.', citations: [] }), true);
});

test('judge homes are found in the nearest folder above that holds a .codex-judge, also from a nested copy', (t) => {
  const top = mkdtempSync(join(tmpdir(), 'geo-homes-'));
  t.after(() => rmSync(top, { recursive: true }));
  mkdirSync(join(top, '.codex-judge'));
  mkdirSync(join(top, 'template', 'geo-blog'), { recursive: true });
  assert.deepEqual(judgeHomes(join(top, 'template', 'geo-blog'), {}), [join(top, '.codex-judge'), join(top, '.codex-judge2')]);
  assert.deepEqual(judgeHomes(join(top, 'geo-blog-research'), {}), [join(top, '.codex-judge'), join(top, '.codex-judge2')]);
  assert.deepEqual(judgeHomes(join(top, 'x'), { SF_CODEX_HOMES: JSON.stringify([join(top, 'h')]) }), [join(top, 'h')]);
});
