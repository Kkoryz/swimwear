import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { bareHost, chatChannels, directusRegistry, fileRegistry, umamiWebsite } from '../lib/site-registry.mjs';
import { siteConfig } from '../site-config.mjs';

const json = (value, status = 200) => ({ ok: status < 400, status, json: async () => value });

async function workspace(rows) {
  const root = await mkdtemp(join(tmpdir(), 'site-config-'));
  await mkdir(join(root, 'src/data'), { recursive: true });
  await writeFile(join(root, 'src/data/site-identity.json'), JSON.stringify({ siteName: 'Strandmill', origin: 'https://strandmill.com' }));
  await writeFile(join(root, 'registry.json'), JSON.stringify(rows));
  return root;
}
const avatarMaker = async () => '/media/site/chat-agent.webp';

test('a registry row gives the site its runtime: status, its own Umami website, the chat; new ids go back to the row', async () => {
  const root = await workspace([{ id: 'strandmill', domain: 'www.strandmill.com', name: 'Strandmill', status: 'building', whatsapp: [{ label: 'Sales', number: '+86 138 0013 8000' }], email: 'sales@strandmill.com', chat_enabled: true }]);
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push(`${init.method ?? 'GET'} ${new URL(url).pathname}`);
    if (url.endsWith('/api/auth/login')) return json({ token: 't' });
    if (url.includes('/api/websites?')) return json({ data: [{ id: 'other', domain: 'other.com' }] });
    if (url.endsWith('/api/websites')) return json({ id: 'umami-1', domain: 'strandmill.com' });
    return json({}, 404);
  };
  const env = { UMAMI_URL: 'https://analytics.example.com/', UMAMI_USERNAME: 'u', UMAMI_PASSWORD: 'p' };
  const registry = fileRegistry(join(root, 'registry.json'));
  const result = await siteConfig({ root, registry, env, fetchImpl, avatarMaker });
  assert.deepEqual(calls, ['POST /api/auth/login', 'GET /api/websites', 'POST /api/websites']);
  assert.equal(result.chat, 'on');
  const runtime = JSON.parse(await readFile(join(root, 'src/data/site-runtime.json'), 'utf8'));
  assert.match(runtime.site.indexnowKey, /^[0-9a-f]{32}$/, 'an IndexNow key is made once');
  assert.deepEqual({ ...runtime.site, indexnowKey: undefined }, { id: 'strandmill', status: 'building', indexnowKey: undefined });
  assert.equal(await readFile(join(root, 'public', `${runtime.site.indexnowKey}.txt`), 'utf8'), runtime.site.indexnowKey, 'and served at the site root');
  assert.deepEqual(runtime.analytics, { provider: 'umami', scriptSrc: 'https://analytics.example.com/script.js', websiteId: 'umami-1' });
  assert.equal(runtime.chat.whatsapp[0].number, '+86 138 0013 8000');
  assert.ok(!JSON.stringify(runtime).includes('"p"'), 'no secret is written');
  const [row] = JSON.parse(await readFile(join(root, 'registry.json'), 'utf8'));
  assert.equal(row.umami_website_id, 'umami-1', 'the new id is written back to the registry');
  assert.equal(row.indexnow_key, runtime.site.indexnowKey);
  assert.equal(row.agent_name, runtime.chat.agent.name);
  // A second run creates nothing.
  calls.length = 0;
  await siteConfig({ root, registry, env, fetchImpl, avatarMaker });
  assert.deepEqual(calls, []);
});

test('a row without channels leaves the chat undecided; chat_enabled false turns it off; an unknown site fails', async () => {
  const root = await workspace([{ id: 's', domain: 'strandmill.com', name: 'Strandmill', status: 'paused', chat_enabled: true, whatsapp: [] }]);
  const registry = fileRegistry(join(root, 'registry.json'));
  assert.equal((await siteConfig({ root, registry, env: {}, avatarMaker })).chat, 'undecided');
  const runtime = JSON.parse(await readFile(join(root, 'src/data/site-runtime.json'), 'utf8'));
  assert.equal(runtime.site.status, 'paused');
  assert.equal(runtime.chat, undefined);
  await registry.update('s', { chat_enabled: false });
  assert.equal((await siteConfig({ root, registry, env: {}, avatarMaker })).chat, 'off');
  await writeFile(join(root, 'registry.json'), JSON.stringify([]));
  await assert.rejects(siteConfig({ root, registry, env: {}, avatarMaker }), /no registry row for https:\/\/strandmill.com/);
});

test('Directus and Umami adapters: the row by bare domain, updates by id, an existing website is found', async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: decodeURIComponent(url), method: init.method ?? 'GET', auth: init.headers.authorization, body: init.body });
    if (url.includes('/items/sites?')) return json({ data: [{ id: 'strandmill' }] });
    if (url.endsWith('/api/auth/login')) return json({ token: 't' });
    if (url.includes('/api/websites?')) return json({ data: [{ id: 'w1', domain: 'www.strandmill.com' }] });
    return json({});
  };
  const registry = directusRegistry({ url: 'https://admin.example.com/', token: 'secret', fetchImpl });
  assert.equal((await registry.find('https://www.strandmill.com')).id, 'strandmill');
  assert.match(calls[0].url, /filter\[domain\]\[_in\]=strandmill\.com,www\.strandmill\.com/);
  assert.equal(calls[0].auth, 'Bearer secret');
  await registry.update('strandmill', { umami_website_id: 'w1' });
  assert.equal(calls[1].method, 'PATCH');
  assert.deepEqual(await umamiWebsite({ url: 'https://analytics.example.com', username: 'u', password: 'p', name: 'Strandmill', domain: 'strandmill.com', fetchImpl }), { websiteId: 'w1', created: false });
  // A website past the first page of the list is still found.
  const pages = [];
  const paged = async (url) => {
    if (url.endsWith('/api/auth/login')) return json({ token: 't' });
    const page = Number(new URL(url).searchParams.get('page'));
    pages.push(page);
    const data = page === 1 ? Array.from({ length: 100 }, (_, index) => ({ id: `o${index}`, domain: `strandmill.com.other${index}.net` })) : [{ id: 'w2', domain: 'strandmill.com' }];
    return json({ data, count: 101, page, pageSize: 100 });
  };
  assert.deepEqual(await umamiWebsite({ url: 'https://analytics.example.com', username: 'u', password: 'p', name: 'Strandmill', domain: 'strandmill.com', fetchImpl: paged }), { websiteId: 'w2', created: false });
  assert.deepEqual(pages, [1, 2]);
  assert.equal(bareHost('https://www.Strandmill.com/about/'), 'strandmill.com');
  assert.equal(chatChannels({ whatsapp: [], email: null }), null);
  assert.deepEqual(chatChannels({ chatwoot_inbox_identifier: 'i1' }, { CHATWOOT_URL: 'https://chat.example.com' }).chatwoot, { baseUrl: 'https://chat.example.com', inboxIdentifier: 'i1' });
});
