import assert from 'node:assert/strict';
import test from 'node:test';

import { applyReplacements, articleFiles, rerouteLinks, reviewArticle, reviewPlaceholders } from '../lib/blog-review.mjs';
import { blogSchedule, dueToday } from '../lib/blog-schedule.mjs';

const page = (route) => ({ route, status: 'authored', seo: { title: route, description: route }, hero: { heading: route }, blocks: [] });

test('the writer\'s replacement list: a filled entry replaces its text, a removed one drops it, an example stays, our claim without real is pending', () => {
  const markdown = 'A. Our case: 12 minutes. B. Picture $1,000 in rent. C. We tested 40 locks. D. Old claim.';
  const { markdown: text, pending, broken } = applyReplacements(markdown, [
    { id: 'R1', kind: 'case', text: 'Our case: 12 minutes.', real: 'Our case: 9 minutes.' },
    { id: 'R2', kind: 'example', text: 'Picture $1,000 in rent.', status: 'placeholder' },
    { id: 'R3', kind: 'test_result', text: 'We tested 40 locks.', needed: 'the lock test record', status: 'placeholder' },
    { id: 'R4', kind: 'case', text: ' D. Old claim.', status: 'removed' },
  ]);
  assert.equal(text, 'A. Our case: 9 minutes. B. Picture $1,000 in rent. C. We tested 40 locks.');
  assert.deepEqual(pending.map((item) => [item.id, item.kind]), [['R3', 'test_result']]);
  assert.deepEqual(broken, []);
  // A text to replace that the article no longer holds once is an article broken on its way in.
  assert.match(applyReplacements('x x', [{ id: 'R9', kind: 'case', text: 'x', real: 'y' }]).broken.join(), /R9.*2 times/);
});

test('the final files of a run: the naturalized article and its list when the writer made them, else the first draft', () => {
  const has = (names) => (file) => names.some((name) => file.endsWith(name));
  assert.deepEqual(articleFiles('/run', has(['06-article.natural.md', '06-replacements.natural.json', '06-article.md'])), { article: '/run/06-article.natural.md', replacements: '/run/06-replacements.natural.json' });
  assert.deepEqual(articleFiles('/run', has(['06-article.md', '06-replacements.json'])), { article: '/run/06-article.md', replacements: '/run/06-replacements.json' });
  assert.deepEqual(articleFiles('/run', has(['06-article.md'])), { article: '/run/06-article.md', replacements: null });
});

test('links the writer placed for routes the site names otherwise are moved by a route map', () => {
  assert.equal(rerouteLinks('[co-hosting](/airbnb-co-hosting/) and [x](https://a.test/airbnb-co-hosting/)', { '/airbnb-co-hosting/': '/ota-optimization/' }), '[co-hosting](/ota-optimization/) and [x](https://a.test/airbnb-co-hosting/)');
});

test('the AI review holds an article with a link the site cannot open, a picture off the subject or a broken import; a placeholder is reported, not held (owner 11-18)', () => {
  const post = { lead: ['Open [pricing](/dynamic-pricing/).'], sections: [{ heading: 'H', body: [{ text: 'See [care](/care/#a).' }, { table: { columns: ['a', 'b'], rows: [['[quote](/request-a-quote/)', '1']] } }] }] };
  const pages = ['/dynamic-pricing/', '/care/', '/request-a-quote/'].map(page);
  assert.deepEqual(reviewArticle({ post, pages, pictures: [{ id: 'V1', fit: 'fits' }] }), []);
  const failures = reviewArticle({
    post: { ...post, lead: ['Open [services](/services/).'] },
    pages,
    pending: [{ id: 'R5', kind: 'case', needed: 'an authorized incident record' }],
    pictures: [{ id: 'V2', fit: 'off-subject' }, { id: 'V3', fit: 'fits', lookAlike: 'V2' }],
    missing: ['V5'],
    seoMissing: ['slug'],
    broken: ['replacement R9: its text occurs 0 times in the article (needs exactly 1)'],
  }).join('\n');
  assert.doesNotMatch(failures, /placeholder/);
  assert.match(reviewPlaceholders([{ id: 'R5', kind: 'case', needed: 'an authorized incident record' }])[0], /placeholder: R5 \(case\).*incident record/);
  assert.deepEqual(reviewArticle({ post, pages, pending: [{ id: 'R5', kind: 'case' }], pictures: [{ id: 'V1', fit: 'fits' }] }), []);
  assert.match(failures, /link:.*\/services\/.*the site does not have/);
  assert.match(failures, /picture: V2 .*off-subject/);
  assert.match(failures, /picture: V3 .*looks like V2/);
  assert.match(failures, /picture: V5 .*not made/);
  assert.match(failures, /article: the frontmatter has no slug/);
  assert.match(failures, /article: replacement R9/);
});

test('a site publishes on the days and as many a day as its site.json says; a tuesday a week by default', () => {
  assert.deepEqual(blogSchedule({}), { days: ['tue'], perDay: 1 });
  const daily = blogSchedule({ blogPublish: { days: 'daily', perDay: 2 } });
  assert.deepEqual(daily, { days: 'daily', perDay: 2 });
  assert.equal(dueToday(daily, new Date('2026-11-16T02:00:00Z')), true);
  const weekly = blogSchedule({ blogPublish: { days: ['mon', 'thu'] } });
  assert.equal(dueToday(weekly, new Date('2026-11-16T02:00:00Z')), true, '2026-11-16 is a Monday (UTC)');
  assert.equal(dueToday(weekly, new Date('2026-11-17T02:00:00Z')), false);
  assert.throws(() => blogSchedule({ blogPublish: { days: ['monday'] } }), /days/);
  assert.throws(() => blogSchedule({ blogPublish: { perDay: 0 } }), /perDay/);
});
