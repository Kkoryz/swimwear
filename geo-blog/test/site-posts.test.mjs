import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { answeredBy, overlap, sitePosts } from '../src/site-posts.mjs';
import { pickQuestions } from '../src/questions.mjs';

test('reworded versions of one question overlap; different questions do not', () => {
  assert.ok(overlap('How do I start and launch my own swimwear brand?', 'What steps should I follow to start and launch my own swimwear brand?') >= 0.6);
  assert.ok(overlap('How can I find and shortlist manufacturers for my swimwear line?', 'How do you find and shortlist swimwear manufacturers?') >= 0.6);
  assert.ok(overlap('Which fabrics and blends suit my swimwear collection?', 'How much will my swimwear cost per unit?') < 0.6);
});

test('site posts in review or published count; the run’s own slug and drafts do not', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'geo-posts-'));
  t.after(() => rmSync(dir, { recursive: true }));
  mkdirSync(join(dir, 'src/data'), { recursive: true });
  writeFileSync(join(dir, 'src/data/blog-posts.json'), JSON.stringify([
    { slug: 'guide', status: 'review', title: 'Guide', sections: [{ heading: 'How can I find and shortlist manufacturers for my swimwear line?' }] },
    { slug: 'mine', status: 'review', title: 'Mine', sections: [{ heading: 'Which fabrics suit swimwear?' }] },
    { slug: 'draft', status: 'draft', title: 'Draft', sections: [{ heading: 'Anything' }] },
  ]));
  const posts = sitePosts({ site_import: { cwd: dir } }, { excludeSlug: 'mine' });
  assert.deepEqual(posts.map((p) => p.slug), ['guide']);
  assert.deepEqual(answeredBy('How do I find and shortlist swimwear manufacturers?', posts).map((h) => h.slug), ['guide']);
});

test('the picker leaves out answered questions and ranks the focus terms first', () => {
  const q = (stage, priority, n, text) => ({ stage, priority, canonical_question: text, evidence: Array(n).fill('e'), evidence_types: ['paa'] });
  const bank = [
    q('start', 'high', 20, 'How do I start my swimwear brand?'), q('start', 'medium', 3, 'Which swimwear fabric trends matter?'),
    q('find', 'high', 23, 'How can I find and shortlist manufacturers for my swimwear line?'), q('find', 'medium', 5, 'Where can I source swimwear fabric?'),
    q('vet', 'high', 10, 'What questions should I ask a factory?'), q('fabric', 'medium', 4, 'How do I test swimwear fabric quality?'),
    q('produce', 'high', 22, 'How much does swimwear cost?'), q('produce', 'medium', 6, 'What should a swimwear quality control checklist include?'),
  ];
  const skip = (text) => /shortlist manufacturers/.test(text);
  const picked = pickQuestions(bank, { count: 4, focus: ['fabric', 'quality control'], skip }).map((p) => p.question);
  assert.deepEqual(picked, ['Which swimwear fabric trends matter?', 'Where can I source swimwear fabric?', 'How do I test swimwear fabric quality?', 'What should a swimwear quality control checklist include?']);
});

test('questions another run for the same site picked are left out; other sites do not count', async (t) => {
  const { siblingRuns } = await import('../src/site-posts.mjs');
  const runs = mkdtempSync(join(tmpdir(), 'geo-runs-'));
  t.after(() => rmSync(runs, { recursive: true }));
  const make = (name, site, questions) => {
    mkdirSync(join(runs, name));
    writeFileSync(join(runs, name, 'config.json'), JSON.stringify({ keyword: name, site_import: { cwd: site } }));
    if (questions) writeFileSync(join(runs, name, '01-questions.json'), JSON.stringify({ questions: questions.map((q) => ({ question: q })) }));
  };
  make('mine', 'S');
  make('other', 'S', ['Is starting a swimwear brand profitable?']);
  make('elsewhere', 'T', ['Where can I find wholesale swimwear suppliers?']);
  const sib = siblingRuns({ runDir: join(runs, 'mine'), site_import: { cwd: 'S' } });
  assert.deepEqual(sib.map((s) => s.headings), [['Is starting a swimwear brand profitable?']]);
});

test('a stage takes a question on the keyword over a stronger off-keyword one; the niche word does not count', () => {
  const q = (stage, priority, n, text) => ({ stage, priority, canonical_question: text, evidence: Array(n).fill('e'), evidence_types: ['paa'] });
  const bank = [
    q('start', 'high', 23, 'Is starting a swimwear brand profitable?'), q('start', 'low', 2, 'Do I need a swimwear tech pack before I start?'),
    q('find', 'high', 15, 'Where can I find wholesale swimwear suppliers?'), q('find', 'low', 3, 'Who can make a swimwear tech pack for me?'),
    q('vet', 'high', 13, 'What should I ask a swimwear factory?'), q('develop', 'high', 26, 'What should a swimwear tech pack include?'),
    q('produce', 'high', 22, 'How much does swimwear cost?'), q('produce', 'low', 2, 'Can a factory quote from a swimwear tech pack?'),
  ];
  const picked = pickQuestions(bank, { count: 4, keyword: 'swimwear tech pack' }).map((p) => p.question);
  assert.deepEqual(picked, ['Do I need a swimwear tech pack before I start?', 'Who can make a swimwear tech pack for me?', 'What should a swimwear tech pack include?', 'Can a factory quote from a swimwear tech pack?']);
});
