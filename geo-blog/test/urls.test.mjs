import { test } from 'node:test';
import assert from 'node:assert/strict';
import { citedUrls, isJunk, normalizeUrl, priorityUrls, siteHits } from '../src/urls.mjs';

test('normalizeUrl drops tracking params and text fragments', () => {
  assert.equal(
    normalizeUrl('https://a.com/p?utm_source=chatgpt.com&x=1#:~:text=foo'),
    'https://a.com/p?x=1',
  );
});

test('siteHits finds brand terms in text and domain in citations', () => {
  const site = { domain: 'alohaandco.com', brand_terms: ['aloha & co'] };
  const hit = siteHits(site, 'vendors like Bali Swim or Aloha & Co. go low', [{ url: 'https://alohaandco.com/news/x' }]);
  assert.equal(hit.mentioned_in_text, true);
  assert.equal(hit.cited, true);
  assert.equal(siteHits(site, 'nothing here', []).mentioned_in_text, false);
});

test('isJunk skips video, tariff tables, PDFs and marketplaces', () => {
  for (const u of ['https://www.youtube.com/watch?v=1', 'https://hts.usitc.gov/x', 'https://a.com/f.pdf', 'https://seller.alibaba.com/x']) assert.equal(isJunk(u), true, u);
  assert.equal(isJunk('https://makersrow.com/blog/x'), false);
});

test('priorityUrls keeps repeat-cited, AI Overview and competitor pages only', () => {
  const receipts = [
    { question_id: 'q1', engine: 'chatgpt', citations: [{ url: 'https://shared.com/a' }, { url: 'https://once.com/a' }] },
    { question_id: 'q1', engine: 'claude', citations: [{ url: 'https://shared.com/a?utm_source=x' }] },
    { question_id: 'q2', engine: 'google_aio', citations: [{ url: 'https://aio.com/a' }, { url: 'https://youtube.com/watch?v=1' }] },
    { question_id: 'q2', engine: 'gemini', citations: [{ url: 'https://www.arcusag.com/a' }] },
  ];
  const urls = priorityUrls(citedUrls(receipts), ['arcusag.com']).map((p) => p.url).sort();
  assert.deepEqual(urls, ['https://aio.com/a', 'https://shared.com/a', 'https://www.arcusag.com/a']);
});
