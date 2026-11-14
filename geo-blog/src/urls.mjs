import { createHash } from 'node:crypto';

// Strip tracking params and fragments (incl. #:~:text=) so the same page cited twice counts once.
export function normalizeUrl(url) {
  const u = new URL(url);
  for (const key of [...u.searchParams.keys()]) if (key.startsWith('utm_') || key === 'srsltid') u.searchParams.delete(key);
  u.hash = '';
  return u.toString();
}

export const hostOf = (url) => new URL(url).hostname.replace(/^www\./, '');
export const urlId = (url) => createHash('sha1').update(url).digest('hex').slice(0, 16);

// Where a site (domain + brand terms) shows up in one answer.
export function siteHits(site, answerText, citations) {
  if (!site?.domain) return { mentioned_in_text: false, cited: false, matches: [] };
  const text = (answerText || '').toLowerCase();
  const terms = [site.domain, ...(site.brand_terms || [])].map((t) => t.toLowerCase());
  const mentioned = terms.filter((t) => text.includes(t));
  const cited = citations.filter((c) => { try { return hostOf(c.url).endsWith(site.domain); } catch { return false; } }).map((c) => c.url);
  return { mentioned_in_text: mentioned.length > 0, cited: cited.length > 0, matches: [...mentioned, ...cited] };
}

// Pages not worth fetching for content comparison: video, social posts, marketplaces, tariff tables, PDFs.
const JUNK_HOSTS = /(^|\.)(youtube\.com|youtu\.be|linkedin\.com|alibaba\.com|accio\.com|amazon\.com|etsy\.com|made-in-china\.com)$/;
export function isJunk(url) {
  const host = hostOf(url);
  return JUNK_HOSTS.test(host) || /\.gov$|usitc|cbsa/.test(host) || /\.pdf($|\?)/i.test(url);
}

// Collect every cited URL across receipts: url -> [{question_id, engine, run}].
export function citedUrls(receipts) {
  const map = new Map();
  for (const r of receipts) {
    for (const c of r.citations || []) {
      let url;
      try { url = normalizeUrl(c.url); } catch { continue; }
      if (!map.has(url)) map.set(url, []);
      map.get(url).push({ question_id: r.question_id, engine: r.engine, run: r.run ?? 1 });
    }
  }
  return map;
}

// Priority pages: cited in 2+ receipts, cited by Google AI Overview, or on a competitor domain.
export function priorityUrls(cited, competitors = []) {
  return [...cited.entries()]
    .filter(([url]) => !isJunk(url))
    .filter(([url, by]) => by.length >= 2 || by.some((b) => b.engine === 'google_aio') || competitors.some((d) => hostOf(url).endsWith(d)))
    .map(([url, by]) => ({ id: urlId(url), url, cited_by: by }));
}
