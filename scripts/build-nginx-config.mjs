#!/usr/bin/env node

// Writes the Nginx config for this workspace's site from its identity (canonical host) into deploy/nginx/.
// The web root is the live release symlink that deploy/server/site-release.sh switches (<deploy_path>/current).
// Usage: node scripts/build-nginx-config.mjs [--root /var/www/<host>/current] [--api http://127.0.0.1:3001]

import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { cliArgs, runMain } from './lib/cli.mjs';
import { readJson } from './lib/json-io.mjs';
import { formRecipient } from './lib/lead-form.mjs';
import { nginxConfig, ownConfigFiles } from './lib/nginx-config.mjs';
import { contentSecurityPolicy, pageSources } from './lib/csp.mjs';
import { builtHtmlFiles } from './lib/built-site.mjs';

// The config of this workspace's build in memory: { host, sources, server, snippet }, or null without an origin.
export async function nginxFiles({ root = process.cwd(), webRoot, api } = {}) {
  const identity = await readJson(resolve(root, 'src/data/site-identity.json'), null);
  if (!identity?.origin) return null;
  const host = new URL(identity.origin).host;
  // Moved and removed pages, and the domains the site used before (the registry's previous_domains via site:config).
  const redirects = await readJson(resolve(root, 'src/data/redirects.json'), []);
  const runtime = await readJson(resolve(root, 'src/data/site-runtime.json'), {});
  const previousHosts = (runtime.site?.previousDomains ?? []).filter((old) => old !== host);
  // The enquiries' mailbox (config/lead-form.json recipient: info@ the site's domain), for the API behind /api/.
  const leadRecipient = formRecipient(identity.origin, await readJson(resolve(root, 'config/lead-form.json'), {}), await readJson(resolve(root, 'src/data/site-contact.json'), null));
  // The Content-Security-Policy of this build (run after pnpm build:release, as site-run's release step does): what its
  // pages load, inline scripts by hash (four-site audit 2026-11-17, Fable's plan T3).
  const sources = pageSources(await builtHtmlFiles(root));
  const csp = contentSecurityPolicy(sources);
  const { server, snippet } = nginxConfig({ host, root: webRoot ?? `/var/www/${host}/current`, redirects, previousHosts, leadRecipient, csp, ...(api ? { apiUpstream: api } : {}) });
  return { host, sources, server, snippet };
}

export async function buildNginxConfig({ root = process.cwd(), webRoot, api } = {}) {
  const files = await nginxFiles({ root, webRoot, api });
  if (!files) throw new Error('src/data/site-identity.json with an origin is required (run import:brand-kit first)');
  const { host, sources, server, snippet } = files;
  await mkdir(resolve(root, 'deploy/nginx'), { recursive: true });
  // The folder holds this site's config only: a leftover config for another domain would serve this build there too.
  for (const file of await readdir(resolve(root, 'deploy/nginx'))) {
    if (file.endsWith('.conf') && !ownConfigFiles(host).includes(file)) await rm(resolve(root, 'deploy/nginx', file));
  }
  const [serverFile, headersFile] = ownConfigFiles(host);
  await writeFile(resolve(root, 'deploy/nginx', serverFile), server);
  await writeFile(resolve(root, 'deploy/nginx', headersFile), snippet);
  return { host, sources };
}

runMain(import.meta.url, async () => {
  const { values } = cliArgs({ root: { type: 'string' }, api: { type: 'string' } });
  const { host, sources } = await buildNginxConfig({ webRoot: values.root, api: values.api });
  console.log(`deploy/nginx/${host}.conf and deploy/nginx/${host}-headers.conf written (CSP: ${sources.inline.length} inline script hash(es), script origins ${sources.scriptOrigins.join(' ') || 'none'})`);
  if (sources.handlers) console.warn(`warning: ${sources.handlers} inline event handler attribute(s) (onclick= and the like) in dist: the CSP blocks them; move them into a script`);
});
