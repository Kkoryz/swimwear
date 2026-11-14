// Post-deploy checks of the live host (stage 11 post-deploy, stage 12 schedule): what the Nginx config promises,
// verified from outside. Pure evaluation of fetched responses; scripts/verify-live.mjs does the fetching.
// Modelled on claude-seo's redirect-chain and robots/404 checks (MIT, AgriciDaniel/claude-seo: scripts/fetch_page.py,
// scripts/agentic_check.py), ported.

import { parsePage } from './built-site.mjs';
import { robotsAllows } from './seo-head.mjs';

export const SECURITY_HEADERS = ['strict-transport-security', 'x-content-type-options', 'referrer-policy', 'x-frame-options'];

// The requests to make for a site origin (https://example.com): { id, url, follow }.
export function liveRequests(origin) {
  const host = new URL(origin).host;
  return [
    { id: 'http', url: `http://${host}/`, follow: false },
    { id: 'www', url: `https://www.${host}/`, follow: false },
    { id: 'home', url: `${origin}/`, follow: false },
    { id: 'missing', url: `${origin}/__seo-site-missing-page-check__/`, follow: false },
    { id: 'robots', url: `${origin}/robots.txt`, follow: false },
    { id: 'sitemap', url: `${origin}/sitemap.xml`, follow: false },
  ];
}

// Problems from the responses: { id: { status, headers (lower-case keys), body } }.
export function liveProblems(origin, responses, expectedSitemapUrls = null, allowedCrawlers = []) {
  const problems = [];
  const add = (check, detail) => problems.push({ check, detail });
  const redirect = (response) => ({ status: response?.status, location: response?.headers?.location ?? null });
  for (const id of ['http', 'www']) {
    const { status, location } = redirect(responses[id]);
    if (status !== 301 || location !== `${origin}/`) add(`${id}_redirect`, `${responses[id]?.status} -> ${location} (want one 301 to ${origin}/)`);
  }
  const home = responses.home;
  if (home?.status !== 200) add('home_status', String(home?.status));
  for (const header of SECURITY_HEADERS) if (!home?.headers?.[header]) add('security_header_missing', header);
  if (!/no-cache|max-age=0/.test(home?.headers?.['cache-control'] ?? '')) add('html_cache', home?.headers?.['cache-control'] ?? 'none');
  const { canonical, robots: homeRobots } = parsePage(home?.body ?? '');
  if (canonical !== `${origin}/`) add('home_canonical', String(canonical));
  if (homeRobots?.includes('noindex')) add('home_noindex', 'the live home page is noindex');
  if (responses.missing?.status !== 404) add('soft_404', `missing page returned ${responses.missing?.status}`);
  const robots = responses.robots;
  if (robots?.status !== 200) add('robots_status', String(robots?.status));
  else {
    if (!robots.body.includes(`Sitemap: ${origin}/sitemap.xml`)) add('robots_sitemap', 'no Sitemap line for this origin');
    if (/^Disallow:\s*\/\s*$/m.test(robots.body) && !/^Allow:\s*\/\s*$/m.test(robots.body)) add('robots_closed', 'robots.txt disallows the whole site');
    // The owner's crawler policy (config/crawler-policy.json): every listed crawler may fetch the site.
    for (const token of allowedCrawlers) if (!robotsAllows(robots.body, token)) add('crawler_blocked', token);
  }
  const sitemap = responses.sitemap;
  if (sitemap?.status !== 200) add('sitemap_status', String(sitemap?.status));
  else if (expectedSitemapUrls) {
    const listed = [...sitemap.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]).sort();
    if (JSON.stringify(listed) !== JSON.stringify([...expectedSitemapUrls].sort())) add('sitemap_differs_from_build', `${listed.length} live vs ${expectedSitemapUrls.length} built`);
  }
  return problems;
}
