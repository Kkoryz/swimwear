import { llmsTxt } from '../../scripts/lib/seo-head.mjs';
import { pages, siteIdentity } from '../lib/authoring';

// The site's indexable pages for AI agents, each with its meta description (scripts/lib/seo-head.mjs llmsTxt).
export function GET() {
  return new Response(llmsTxt(pages, siteIdentity), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
