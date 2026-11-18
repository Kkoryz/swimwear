import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import policy from '../../config/crawler-policy.json' with { type: 'json' };
import { llmsTxt, robotsAllows, robotsTxt } from '../lib/seo-head.mjs';

const identity = { origin: 'https://www.strandmill.com', siteName: 'Strandmill' };

test('robots.txt states the owner\'s decision for each kind of crawler as a group of its own (four-site audit 2026-11-17, G1/A2)', () => {
  const robots = robotsTxt(identity);
  const groups = robots.split(/\n\n/).filter((part) => /User-agent:/.test(part));
  assert.deepEqual(groups.map((group) => group.split('\n')[0]), ['# Search engines', '# AI search and answer engines: their search indexes and the pages a person asks them to read', '# AI model training', '# Everyone else']);
  assert.match(groups[0], /User-agent: Googlebot\nUser-agent: Bingbot\nAllow: \//);
  assert.match(groups[1], /User-agent: OAI-SearchBot\nUser-agent: ChatGPT-User\n[\s\S]*User-agent: Perplexity-User\nAllow: \//);
  assert.match(groups[2], /User-agent: GPTBot\n[\s\S]*User-agent: Amazonbot\nAllow: \//);
  assert.match(robots, /\nSitemap: https:\/\/www\.strandmill\.com\/sitemap\.xml\n$/);
  // The owner allows all (2026-09-25): every listed crawler may fetch the site, named in its own group.
  for (const crawler of policy.allow) {
    assert.ok(robotsAllows(robots, crawler.token), crawler.token);
    assert.match(robots, new RegExp(`^User-agent: ${crawler.token}$`, 'm'));
  }
  // A purpose the owner closes is closed for its crawlers only.
  const closed = robotsTxt(identity, { ...policy, groups: policy.groups.map((group) => (group.purposes.includes('ai-training') ? { ...group, allow: false } : group)) });
  assert.equal(robotsAllows(closed, 'GPTBot'), false);
  assert.equal(robotsAllows(closed, 'OAI-SearchBot'), true);
  assert.equal(robotsAllows(closed, 'SomeOtherBot'), true);
  // Without its identity the site stays closed.
  assert.equal(robotsTxt(null), 'User-agent: *\nDisallow: /\n');
});

test('llms.txt lists the indexable pages, the home first, each with its meta description (A6)', () => {
  const page = (route, title, description, status = 'authored') => ({ route, status, seo: { title, description, canonical: route } });
  const text = llmsTxt([page('/about-us/', 'About Strandmill', 'Our Guangzhou factory.'), page('/', 'Swimwear Manufacturer | Strandmill', 'OEM and ODM swimwear from 50 pieces.'), page('/draft/', 'Draft', 'Not yet.', 'placeholder'), page('/held/', 'Held', 'Held.', 'hold')], identity);
  assert.equal(text, '# Strandmill\n\n> OEM and ODM swimwear from 50 pieces.\n\n## Pages\n\n- [Swimwear Manufacturer | Strandmill](https://www.strandmill.com/): OEM and ODM swimwear from 50 pieces.\n- [About Strandmill](https://www.strandmill.com/about-us/): Our Guangzhou factory.\n');
});

test('the build serves both, and the SEO audit holds them to the pages and the policy', async () => {
  assert.match(await readFile(new URL('../../src/pages/llms.txt.ts', import.meta.url), 'utf8'), /llmsTxt\(pages, siteIdentity\)/);
  const audit = await readFile(new URL('../lib/seo-audit.mjs', import.meta.url), 'utf8');
  assert.match(audit, /issue: 'robots_groups_missing'/);
  assert.match(audit, /issue: 'llms_txt_mismatch'/);
});
