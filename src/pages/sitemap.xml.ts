import { sitemapXml } from '../../scripts/lib/seo-head.mjs';
import { pageDates, pages, siteIdentity } from '../lib/authoring';

// Canonical, indexable pages only (placeholders are noindex); see scripts/lib/seo-head.mjs.
export function GET() {
  return new Response(sitemapXml(pages, siteIdentity, pageDates), { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
