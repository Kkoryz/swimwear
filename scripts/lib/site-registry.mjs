// The site registry (deploy/registry/schema.sql, table `sites`): one row per site, the single source of its runtime
// settings. Read from Directus (DIRECTUS_URL + DIRECTUS_TOKEN, a static token of a role that may read and update
// `sites`) or, before Directus is set up and in tests, from a JSON file holding the rows. The Umami website is found
// or created through Umami's API (UMAMI_URL, UMAMI_USERNAME, UMAMI_PASSWORD).

import { readFile } from 'node:fs/promises';
import { writeJson } from './json-io.mjs';

export const SITE_STATUSES = Object.freeze(['building', 'live', 'paused', 'retired']);
export const bareHost = (value) => new URL(/^https?:\/\//.test(value) ? value : `https://${value}`).hostname.replace(/^www\./, '');

// A registry kept in a JSON file: [{ id, domain, ... }].
export function fileRegistry(path) {
  const load = async () => JSON.parse(await readFile(path, 'utf8'));
  return {
    async find(domain) { return (await load()).find((row) => bareHost(row.domain) === bareHost(domain)) ?? null; },
    async update(id, fields) {
      const rows = await load();
      const row = rows.find((item) => item.id === id);
      Object.assign(row, fields);
      await writeJson(path, rows);
    },
  };
}

// The registry in Directus (REST items API).
export function directusRegistry({ url, token, fetchImpl = fetch }) {
  const base = `${url.replace(/\/$/, '')}/items/sites`;
  const call = async (target, init = {}) => {
    const response = await fetchImpl(target, { ...init, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' } });
    if (!response.ok) throw new Error(`Directus ${init.method ?? 'GET'} ${target}: HTTP ${response.status}`);
    return response.json();
  };
  return {
    async find(domain) {
      const host = bareHost(domain);
      const { data } = await call(`${base}?filter[domain][_in]=${encodeURIComponent(`${host},www.${host}`)}&limit=1`);
      return data?.[0] ?? null;
    },
    async update(id, fields) { await call(`${base}/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(fields) }); },
  };
}

// The site's Umami website: the one already tracking its domain, else a new one named after the site.
const UMAMI_PAGE = 100;
export async function umamiWebsite({ url, username, password, name, domain, fetchImpl = fetch }) {
  const base = url.replace(/\/$/, '');
  const call = async (path, init = {}, token = null) => {
    const response = await fetchImpl(`${base}${path}`, { ...init, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) } });
    if (!response.ok) throw new Error(`Umami ${init.method ?? 'GET'} ${path}: HTTP ${response.status}`);
    return response.json();
  };
  const { token } = await call('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
  const host = bareHost(domain);
  // The list is paged ({ data, count }): every page is read until the site's website turns up.
  let existing = null;
  for (let page = 1; !existing; page += 1) {
    const listed = await call(`/api/websites?query=${encodeURIComponent(host)}&page=${page}&pageSize=${UMAMI_PAGE}`, {}, token);
    const rows = listed.data ?? listed;
    existing = rows.find?.((website) => bareHost(website.domain) === host) ?? null;
    if (!Array.isArray(rows) || rows.length < UMAMI_PAGE || page * UMAMI_PAGE >= (listed.count ?? Infinity)) break;
  }
  const website = existing ?? await call('/api/websites', { method: 'POST', body: JSON.stringify({ name, domain: host }) }, token);
  return { websiteId: website.id, created: !existing };
}

// The chat channels a registry row carries (setup-chat's channel data), or null when it names none yet.
export function chatChannels(row, env = {}) {
  const whatsapp = Array.isArray(row.whatsapp) ? row.whatsapp : [];
  const chatwoot = row.chatwoot_inbox_identifier && env.CHATWOOT_URL ? { baseUrl: env.CHATWOOT_URL, inboxIdentifier: row.chatwoot_inbox_identifier } : null;
  if (!whatsapp.length && !row.email && !chatwoot && !env.CHATWOOT_URL) return null;
  return {
    ...(whatsapp.length ? { whatsapp } : {}),
    ...(row.email ? { email: row.email } : {}),
    ...(row.reply_time ? { replyTime: row.reply_time } : {}),
    ...(row.agent_name ? { agent: { name: row.agent_name } } : {}),
    ...(chatwoot ? { chatwoot } : {}),
  };
}
