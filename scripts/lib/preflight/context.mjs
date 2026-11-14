// The preflight's context: everything its checks read, loaded once from the site's files and its release build.
import { existsSync, statSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { readBuiltPages } from '../built-site.mjs';
import { readJson, readText } from '../json-io.mjs';
import { auditSeo } from '../seo-audit.mjs';
import { buildSnapshot, snapshotDrift } from '../seo-snapshot.mjs';
import { loadSitePages, mainKeywords } from '../site-pages.mjs';
import { verifiedNow } from '../verified-build.mjs';

// Everything the checks read, loaded once. built: html by route (null when not built); distStat(path): the stat of a
// file under dist/, or null; drift: changes from the accepted SEO baseline; seoAuditError: the stage 10 audit's failure.
export async function loadContext(root) {
  const data = (path, fallback = null) => readJson(resolve(root, path), fallback);
  // The gate checks a release build: its pages as that build has them (a post in review is not on the blog hub).
  const pages = await loadSitePages(root, { release: true });
  const built = await readBuiltPages(root, pages);
  const identity = await data('src/data/site-identity.json');
  const baseline = await data('docs/research/seo-baseline.json');
  const host = identity?.origin ? new URL(identity.origin).host : null;
  // The site plan of the Site Factory snapshot the site is built from (site.json siteFactory): its nav_only and withheld pages.
  const site = await data('site.json');
  const sitePlan = site?.siteFactory ? await readJson(resolve(root, site.siteFactory, 'pages.json'), null) : null;
  let seoAuditError = null;
  try { await auditSeo({ root, pages, built }); } catch (error) { seoAuditError = error.message; }
  return {
    pages, built, identity, baseline, seoAuditError, sitePlan,
    hasDist: existsSync(resolve(root, 'dist')),
    distStat: (path) => (existsSync(resolve(root, 'dist', path)) ? statSync(resolve(root, 'dist', path)) : null),
    runtime: await data('src/data/site-runtime.json'),
    plan: await data('docs/research/image-plan.json'),
    imageFit: await data('docs/research/image-fit.json'),
    siteMedia: await data('src/data/site-media.json'),
    handoff: await data('docs/research/handoff.json'),
    imported: await data('docs/research/site-factory-import.json'),
    signoff: await data('docs/research/release-signoff.json'),
    diversity: await data('docs/research/images/diversity.json'),
    form: await data('config/lead-form.json'),
    contact: await data('src/data/site-contact.json'),
    redirects: await data('src/data/redirects.json', []),
    crossSite: await data('docs/research/cross-site.json'),
    // Whether these sources are the audited and reviewed ones (lib/verified-build.mjs).
    verification: await verifiedNow(root),
    keywords: await mainKeywords(root),
    drift: baseline ? snapshotDrift(baseline, await buildSnapshot(root, { pages, built })) : [],
    nginx: host ? {
      configs: await readdir(resolve(root, 'deploy/nginx')).catch((error) => { if (error.code !== 'ENOENT') throw error; return []; }),
      own: await readText(resolve(root, 'deploy/nginx', `${host}.conf`), null),
    } : null,
  };
}
