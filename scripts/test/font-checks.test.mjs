import assert from 'node:assert/strict';
import test from 'node:test';

import { fontProblems, matchedWeight, weightRange } from '../lib/font-checks.mjs';

const text = (family, weight, style = 'normal') => ({ family, weight, style, sample: 'Our services', where: 'h2' });
const face = (family, weight, style = 'normal', status = 'loaded') => ({ family, weight, style, status });

test('a face\'s weight range and the weight the browser picks', () => {
  assert.deepEqual(weightRange('400'), [400, 400]);
  assert.deepEqual(weightRange('100 900'), [100, 900]);
  assert.deepEqual(weightRange('bold'), [700, 700]);
  assert.equal(matchedWeight(700, [[400, 400]]), 400);
  assert.equal(matchedWeight(700, [[100, 900]]), 700);
  assert.equal(matchedWeight(600, [[400, 400], [700, 700]]), 700);
  assert.equal(matchedWeight(500, [[400, 400], [700, 700]]), 400);
  assert.equal(matchedWeight(300, [[400, 400], [700, 700]]), 400);
});

test('font_not_loaded: the first family has no loaded file (the browser shows a fallback)', () => {
  const problems = fontProblems({ used: [text('Source Serif 4', 400), text('Source Serif 4', 700)], faces: [face('Source Serif 4', '400', 'normal', 'error'), face('Josefin Sans', '700')] });
  assert.deepEqual(problems, [{ issue: 'font_not_loaded', family: 'Source Serif 4', weights: [400, 700], sample: 'Our services', where: 'h2' }]);
  // Georgia as the body face nobody installed is a fallback too; a system font the site uses on purpose, or a generic
  // family, is not.
  assert.equal(fontProblems({ used: [text('Georgia', 400)], faces: [] })[0].issue, 'font_not_loaded');
  assert.deepEqual(fontProblems({ used: [text('Georgia', 400), text('sans-serif', 400)], faces: [] }, { system: ['Georgia'] }), []);
});

test('font_synthesized: a bold drawn from a regular face, an italic with no italic face', () => {
  // The hotel site: Josefin Sans shipped as one static 400 file, headings at 700 and navigation at 600.
  const used = [text('Josefin Sans', 400), text('Josefin Sans', 700), text('Josefin Sans', 600), text('"Josefin Sans"', 400, 'italic')];
  const problems = fontProblems({ used, faces: [face('"Josefin Sans"', '400')] });
  assert.deepEqual(problems.map((problem) => [problem.issue, problem.weight, problem.style, problem.synthesized.join('+'), problem.drawnFrom]), [
    ['font_synthesized', 700, 'normal', 'weight', 400],
    ['font_synthesized', 600, 'normal', 'weight', 400],
    ['font_synthesized', 400, 'italic', 'style', 400],
  ]);
  // Every weight with its own face, or one variable face over the range: nothing synthesized. A 600 drawn from the 700
  // face is not synthesized either (the browser picks the heavier face).
  assert.deepEqual(fontProblems({ used: used.slice(0, 3), faces: [face('Josefin Sans', '400'), face('Josefin Sans', '700')] }), []);
  assert.deepEqual(fontProblems({ used: used.slice(0, 3), faces: [face('Josefin Sans', '100 900')] }), []);
  // A face that failed to load does not count.
  assert.equal(fontProblems({ used: [text('Josefin Sans', 700)], faces: [face('Josefin Sans', '400'), face('Josefin Sans', '700', 'normal', 'error')] })[0].issue, 'font_synthesized');
});
