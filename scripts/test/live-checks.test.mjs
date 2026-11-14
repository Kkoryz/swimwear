import assert from 'node:assert/strict';
import test from 'node:test';

import { liveProblems, liveRequests } from '../lib/live-checks.mjs';

const origin = 'https://knitpace.com';
const headers = { 'strict-transport-security': 'max-age=31536000', 'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin', 'x-frame-options': 'SAMEORIGIN', 'cache-control': 'no-cache' };
const good = () => ({
  http: { status: 301, headers: { location: `${origin}/` } },
  www: { status: 301, headers: { location: `${origin}/` } },
  home: { status: 200, headers: { ...headers }, body: `<link rel="canonical" href="${origin}/">` },
  missing: { status: 404, headers: {}, body: '' },
  robots: { status: 200, headers: {}, body: `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n` },
  sitemap: { status: 200, headers: {}, body: `<urlset><url><loc>${origin}/a/</loc></url></urlset>` },
});

test('a correctly served site has no problems', () => {
  assert.deepEqual(liveProblems(origin, good(), [`${origin}/a/`]), []);
  assert.equal(liveRequests(origin).find((request) => request.id === 'www').url, 'https://www.knitpace.com/');
});

test('redirect chains, soft 404s, missing headers, closed robots and sitemap drift are reported', () => {
  const responses = good();
  responses.http = { status: 301, headers: { location: 'https://www.knitpace.com/' } };
  responses.missing = { status: 200, headers: {}, body: 'home' };
  delete responses.home.headers['x-frame-options'];
  responses.robots.body = 'User-agent: *\nDisallow: /\n';
  const checks = liveProblems(origin, responses, [`${origin}/a/`, `${origin}/b/`]).map((problem) => problem.check);
  assert.deepEqual(checks, ['http_redirect', 'security_header_missing', 'soft_404', 'robots_sitemap', 'robots_closed', 'sitemap_differs_from_build']);
});

test('robots.txt must not block a crawler the owner allows', async () => {
  const { robotsAllows } = await import('../lib/seo-head.mjs');
  assert.equal(robotsAllows('User-agent: *\nAllow: /\n', 'GPTBot'), true);
  assert.equal(robotsAllows('User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nAllow: /\n', 'GPTBot'), false);
  assert.equal(robotsAllows('User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nAllow: /\n', 'ClaudeBot'), true);
  assert.equal(robotsAllows('User-agent: *\nDisallow: /private/\n', 'Bingbot', '/'), true);
  const responses = good();
  responses.robots.body = `User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`;
  assert.deepEqual(liveProblems(origin, responses, null, ['GPTBot', 'ClaudeBot']).map((problem) => `${problem.check} ${problem.detail}`), ['crawler_blocked GPTBot']);
});
