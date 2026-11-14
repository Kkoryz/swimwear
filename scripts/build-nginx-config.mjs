#!/usr/bin/env node

// Writes the Nginx config for this workspace's site from its identity (canonical host) into deploy/nginx/.
// The web root is the live release symlink that deploy/server/site-release.sh switches (<deploy_path>/current).
// Usage: node scripts/build-nginx-config.mjs [--root /var/www/<host>/current] [--api http://127.0.0.1:3001]

import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { cliArgs, runMain } from './lib/cli.mjs';
import { readJson } from './lib/json-io.mjs';
import { nginxConfig, ownConfigFiles } from './lib/nginx-config.mjs';

export async function buildNginxConfig({ root = process.cwd(), webRoot, api } = {}) {
  const identity = await readJson(resolve(root, 'src/data/site-identity.json'), null);
  if (!identity?.origin) throw new Error('src/data/site-identity.json with an origin is required (run import:brand-kit first)');
  const host = new URL(identity.origin).host;
  // Moved and removed pages, and the domains the site used before (the registry's previous_domains via site:config).
  const redirects = await readJson(resolve(root, 'src/data/redirects.json'), []);
  const runtime = await readJson(resolve(root, 'src/data/site-runtime.json'), {});
  const previousHosts = (runtime.site?.previousDomains ?? []).filter((old) => old !== host);
  const { server, snippet } = nginxConfig({ host, root: webRoot ?? `/var/www/${host}/current`, redirects, previousHosts, ...(api ? { apiUpstream: api } : {}) });
  await mkdir(resolve(root, 'deploy/nginx'), { recursive: true });
  // The folder holds this site's config only: a leftover config for another domain would serve this build there too.
  for (const file of await readdir(resolve(root, 'deploy/nginx'))) {
    if (file.endsWith('.conf') && !ownConfigFiles(host).includes(file)) await rm(resolve(root, 'deploy/nginx', file));
  }
  const [serverFile, headersFile] = ownConfigFiles(host);
  await writeFile(resolve(root, 'deploy/nginx', serverFile), server);
  await writeFile(resolve(root, 'deploy/nginx', headersFile), snippet);
  return host;
}

runMain(import.meta.url, async () => {
  const { values } = cliArgs({ root: { type: 'string' }, api: { type: 'string' } });
  const host = await buildNginxConfig({ webRoot: values.root, api: values.api });
  console.log(`deploy/nginx/${host}.conf and deploy/nginx/${host}-headers.conf written`);
});
