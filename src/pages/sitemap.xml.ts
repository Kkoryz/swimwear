import { sitemapXml } from '../../scripts/lib/seo-head.mjs';
import { pages, siteIdentity } from '../lib/authoring';

// When each page's content last changed (pnpm page-dates, run by the importer): optional.
const dateModules = import.meta.glob<{ default: Record<string, { hash: string; modified: string }> }>('../data/page-dates.json', { eager: true });
const dates = Object.values(dateModules)[0]?.default ?? null;

// Canonical, indexable pages only (placeholders are noindex); see scripts/lib/seo-head.mjs.
export function GET() {
  return new Response(sitemapXml(pages, siteIdentity, dates), { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
