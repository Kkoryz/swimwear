import { robotsTxt } from '../../scripts/lib/seo-head.mjs';
import { siteIdentity } from '../lib/authoring';

// Open with the sitemap once the site has its identity; closed while it has none.
export function GET() {
  return new Response(robotsTxt(siteIdentity), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
