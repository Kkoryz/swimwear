#!/usr/bin/env node

// Stage 09: generate the site's runtime settings (src/data/site-runtime.json) from its row in the site registry, the
// single place a site's operations are recorded (deploy/registry/schema.sql). The row is found by the site identity's
// domain. Missing services are created and their ids written back to the row: the Umami website (when UMAMI_* is
// set) and, through setup-chat, the Chatwoot API inbox and the chat agent. A row naming no chat channel yet leaves the
// chat undecided (stage 11 holds); `chat_enabled = false` turns it off. The row's status travels with the site
// (stage 11 holds a retired site, and a paused one without its notice), and so does its IndexNow key.
// Registry: DIRECTUS_URL + DIRECTUS_TOKEN, or --registry <rows.json>. Secrets come only from the environment.
// Usage: node scripts/site-config.mjs [--registry <rows.json>] [--no-avatar]

import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { makeAvatar, setupChat } from './lib/chat-setup.mjs';
import { cliArgs, runMain, usage } from './lib/cli.mjs';
import { readJson, writeJson } from './lib/json-io.mjs';
import { SITE_STATUSES, chatChannels, directusRegistry, fileRegistry, umamiWebsite } from './lib/site-registry.mjs';

export async function siteConfig({ root = process.cwd(), registry, env = process.env, fetchImpl = fetch, avatar = true, avatarMaker = makeAvatar } = {}) {
  const identity = await readJson(resolve(root, 'src/data/site-identity.json'), null);
  if (!identity?.origin) throw new Error('the site identity (its domain) comes first: import the brand kit (src/data/site-identity.json)');
  const row = await registry.find(identity.origin);
  if (!row) throw new Error(`no registry row for ${identity.origin}: add the site to the registry (table sites)`);
  if (!SITE_STATUSES.includes(row.status)) throw new Error(`registry row ${row.id} has an unknown status: ${row.status}`);
  const written = {};
  const runtimePath = resolve(root, 'src/data/site-runtime.json');
  const runtime = await readJson(runtimePath, {});

  // Analytics: the site's own Umami website.
  let analytics = runtime.analytics ?? null;
  if (env.UMAMI_URL) {
    let websiteId = row.umami_website_id;
    if (!websiteId) {
      if (!env.UMAMI_USERNAME || !env.UMAMI_PASSWORD) throw new Error('UMAMI_URL needs UMAMI_USERNAME and UMAMI_PASSWORD to create the site\'s website');
      ({ websiteId } = await umamiWebsite({ url: env.UMAMI_URL, username: env.UMAMI_USERNAME, password: env.UMAMI_PASSWORD, name: row.name, domain: row.domain, fetchImpl }));
      written.umami_website_id = websiteId;
    }
    analytics = { provider: 'umami', scriptSrc: `${env.UMAMI_URL.replace(/\/$/, '')}/script.js`, websiteId };
  }
  // The site's IndexNow key: made once, kept in the registry, served as public/<key>.txt.
  let indexnowKey = row.indexnow_key;
  if (!/^[a-zA-Z0-9-]{8,128}$/.test(indexnowKey ?? '')) {
    indexnowKey = randomBytes(16).toString('hex');
    written.indexnow_key = indexnowKey;
  }
  await mkdir(resolve(root, 'public'), { recursive: true });
  await writeFile(resolve(root, 'public', `${indexnowKey}.txt`), indexnowKey);
  // A paused site stays online with a notice (Google: pause a business without taking the site down).
  const site = {
    id: row.id,
    status: row.status,
    indexnowKey,
    ...(row.site_notice ? { notice: row.site_notice } : {}),
    ...(row.announcement ? { announcement: row.announcement } : {}),
    ...(Array.isArray(row.previous_domains) && row.previous_domains.length ? { previousDomains: row.previous_domains } : {}),
  };
  await writeJson(runtimePath, { ...runtime, site, ...(analytics ? { analytics } : {}) });

  // Chat: the row's channels (setup-chat makes the inbox and the agent when missing).
  let chat = 'undecided';
  if (row.chat_enabled === false) {
    await setupChat({ root, off: true, env, fetchImpl });
    chat = 'off';
  } else {
    const channels = chatChannels(row, env);
    if (channels) {
      const result = await setupChat({ root, channels, env, fetchImpl, avatar, avatarMaker });
      if (result.chat.chatwoot && result.chat.chatwoot.inboxIdentifier !== row.chatwoot_inbox_identifier) written.chatwoot_inbox_identifier = result.chat.chatwoot.inboxIdentifier;
      if (result.chat.agent.name !== row.agent_name) written.agent_name = result.chat.agent.name;
      chat = 'on';
    }
  }
  if (Object.keys(written).length) await registry.update(row.id, written);
  return { site: row.id, status: row.status, analytics: Boolean(analytics), chat, written };
}

runMain(import.meta.url, async () => {
  const { values } = cliArgs({ registry: { type: 'string' }, 'no-avatar': { type: 'boolean' } });
  const registry = values.registry ? fileRegistry(resolve(values.registry))
    : process.env.DIRECTUS_URL && process.env.DIRECTUS_TOKEN ? directusRegistry({ url: process.env.DIRECTUS_URL, token: process.env.DIRECTUS_TOKEN })
    : null;
  if (!registry) return usage('Usage: node scripts/site-config.mjs [--registry <rows.json>] [--no-avatar]  (or set DIRECTUS_URL and DIRECTUS_TOKEN)');
  const result = await siteConfig({ registry, avatar: values['no-avatar'] !== true });
  console.log(`${result.site} (${result.status}): analytics ${result.analytics ? 'on' : 'not set'}, chat ${result.chat}${Object.keys(result.written).length ? `; registry updated: ${Object.keys(result.written).join(', ')}` : ''}`);
});
