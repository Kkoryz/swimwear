import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { chatClient, visibleMessages } from '../lib/chat-client.mjs';
import { agentGreeting, chatProblems, contrastText, DEFAULT_COLOR, mailtoLink, prefillFor, whatsappDigits, whatsappLink } from '../lib/chat-config.mjs';
import { agentFor, avatarPrompt, setupChat } from '../lib/chat-setup.mjs';

const chat = {
  chatwoot: { baseUrl: 'https://chat.example.com', inboxIdentifier: 'abc123' },
  whatsapp: [{ label: 'Sales', number: '+86 138 0013 8000' }, { number: '447700900123' }],
  email: 'sales@example.com',
};

test('a site chat names its channels; false turns it off; a dead channel is a problem', () => {
  assert.deepEqual(chatProblems(chat), []);
  assert.deepEqual(chatProblems(false), []);
  assert.match(chatProblems(undefined)[0], /or false/);
  assert.match(chatProblems({ ...chat, chatwoot: { baseUrl: 'http://chat.example.com', inboxIdentifier: 'x' } })[0], /https baseUrl/);
  assert.match(chatProblems({ ...chat, chatwoot: { baseUrl: 'https://chat.example.com', websiteToken: 'x' } })[0], /inboxIdentifier/);
  assert.match(chatProblems({ whatsapp: [{ number: '0138 0013 8000' }] })[0], /international number/);
  assert.match(chatProblems({ email: 'sales-at-example' })[0], /email address/);
  assert.match(chatProblems({})[0], /no channel/);
  assert.match(chatProblems({ ...chat, prefill: 'Hello' })[0], /\{url\}/);
});

test('every channel opens with a message naming the page', () => {
  const message = prefillFor(chat, { title: 'Bikini manufacturer', url: 'https://brand.com/bikinis/' });
  assert.equal(message, 'Hello, I would like to ask about Bikini manufacturer: https://brand.com/bikinis/');
  assert.equal(whatsappDigits('+86 138-0013-8000'), '8613800138000');
  assert.equal(whatsappLink('+86 138 0013 8000', 'Hi & bye'), 'https://wa.me/8613800138000?text=Hi%20%26%20bye');
  assert.equal(mailtoLink('a@b.co', 'Bikinis', 'Hi'), 'mailto:a@b.co?subject=Bikinis&body=Hi');
  assert.equal(prefillFor({ prefill: 'Hi {url}' }, { title: 'T', url: 'u' }), 'Hi u');
});

test('the chat is green by default with readable text; a site may use its accent or another colour', () => {
  assert.equal(contrastText(DEFAULT_COLOR), '#ffffff');
  assert.equal(contrastText('#1da851'), '#000000');
  assert.deepEqual(chatProblems({ ...chat, color: 'accent' }), []);
  assert.match(chatProblems({ ...chat, color: 'green' })[0], /#rrggbb/);
  assert.match(chatProblems({ ...chat, autoOpen: -1 })[0], /seconds/);
  assert.match(chatProblems({ ...chat, quickReplies: ['a', 'b', 'c', 'd'] })[0], /up to 3/);
  assert.deepEqual(chatProblems({ ...chat, quickReplies: ['I would like a quote.'] }), []);
  assert.deepEqual(chatProblems({ ...chat, color: '#1DA851', autoOpen: 0, greeting: 'Hi', replyTime: 'Replies within a day' }), []);
});

// A fake Chatwoot client API: contacts, conversations and messages in memory.
function fakeChatwoot() {
  const calls = [];
  const messages = [];
  const fetchImpl = async (url, init = {}) => {
    const path = new URL(url).pathname.replace('/public/api/v1/inboxes/abc123', '');
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ method: init.method ?? 'GET', path, body });
    const reply = (value, status = 200) => ({ ok: status < 400, status, json: async () => value });
    if (path === '/contacts' && init.method === 'POST') return reply({ id: 1, source_id: 'src-1', pubsub_token: 'p' });
    if (path === '/contacts/src-1/conversations' && init.method === 'POST') return reply({ id: 7, messages: [] });
    if (path === '/contacts/src-1/conversations/7/messages' && init.method === 'POST') { const message = { id: messages.length + 1, content: body.content, message_type: 0 }; messages.push(message); return reply(message); }
    if (path === '/contacts/src-1/conversations/7/messages') return reply([...messages, { id: 99, content: 'Hi, how many pieces?', message_type: 1 }, { id: 100, content: 'Conversation assigned', message_type: 2 }]);
    if (path === '/contacts/src-1' && init.method === 'PATCH') return reply({ id: 1, email: body.email });
    return reply({}, 404);
  };
  return { calls, fetchImpl };
}
const memoryStorage = () => { const data = new Map(); return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) }; };

test('the chat window starts a Chatwoot conversation with the first message and shows the team replies', async () => {
  const { calls, fetchImpl } = fakeChatwoot();
  const storage = memoryStorage();
  const client = chatClient({ baseUrl: 'https://chat.example.com/', inboxIdentifier: 'abc123', fetchImpl, storage });
  assert.equal(client.started, false);
  await client.send('Can you make 300 bikinis?', { page_url: 'https://brand.com/bikinis/' });
  assert.deepEqual(calls.map((call) => `${call.method} ${call.path}`), ['POST /contacts', 'POST /contacts/src-1/conversations', 'POST /contacts/src-1/conversations/7/messages']);
  assert.equal(calls[1].body.custom_attributes.page_url, 'https://brand.com/bikinis/', 'the team sees the page the visitor wrote from');
  assert.deepEqual(await client.messages(), [{ id: 1, text: 'Can you make 300 bikinis?', mine: true }, { id: 99, text: 'Hi, how many pieces?', mine: false }]);
  // The next page continues the same conversation.
  const next = chatClient({ baseUrl: 'https://chat.example.com', inboxIdentifier: 'abc123', fetchImpl, storage });
  assert.equal(next.started, true);
  await next.send('Sizes S-XL');
  assert.equal(calls.filter((call) => call.path === '/contacts').length, 1);
  await next.setEmail('buyer@shop.com');
  assert.equal(next.email, 'buyer@shop.com');
  assert.deepEqual(visibleMessages({ payload: [{ id: 1, content: '', message_type: 1 }] }), []);
});

test('setup:chat writes the site channels and finds or creates the site Chatwoot API inbox', async () => {
  const root = await mkdtemp(join(tmpdir(), 'chat-'));
  await mkdir(join(root, 'src/data'), { recursive: true });
  await writeFile(join(root, 'src/data/site-identity.json'), JSON.stringify({ siteName: 'Strandmill', origin: 'https://strandmill.com' }));
  await writeFile(join(root, 'src/data/site-runtime.json'), JSON.stringify({ analytics: { provider: 'umami', scriptSrc: 's', websiteId: 'w' } }));
  await writeFile(join(root, 'channels.json'), JSON.stringify({ whatsapp: [{ number: '+86 138 0013 8000' }], email: 'sales@strandmill.com', wechat: { id: 'x' } }));
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, method: init.method ?? 'GET', body: init.body && JSON.parse(init.body), token: init.headers.api_access_token });
    return { ok: true, json: async () => (init.method === 'POST' ? { inbox_identifier: 'new-inbox' } : { payload: [{ channel_type: 'Channel::Api', name: 'Other website chat', inbox_identifier: 'x' }] }) };
  };
  const env = { CHATWOOT_URL: 'https://chat.example.com/', CHATWOOT_ACCOUNT_ID: '1', CHATWOOT_API_TOKEN: 'secret' };
  const made = [];
  const avatarMaker = async ({ look }) => { made.push(look); await mkdir(join(root, 'public/media/site'), { recursive: true }); await writeFile(join(root, 'public/media/site/chat-agent.webp'), 'x'); return '/media/site/chat-agent.webp'; };
  const { inbox } = await setupChat({ root, channelsPath: join(root, 'channels.json'), env, fetchImpl, avatarMaker });
  assert.equal(inbox.created, true);
  assert.deepEqual(calls[1].body, { name: 'Strandmill website chat', channel: { type: 'api' } });
  assert.equal(calls[1].token, 'secret');
  const written = JSON.parse(await readFile(join(root, 'src/data/site-runtime.json'), 'utf8'));
  assert.equal(written.analytics.websiteId, 'w', 'other runtime settings are kept');
  assert.deepEqual(written.chat.chatwoot, { baseUrl: 'https://chat.example.com', inboxIdentifier: 'new-inbox' });
  assert.equal(written.chat.wechat, undefined, 'only the known channels are written');
  assert.ok(!JSON.stringify(written).includes('secret'), 'the API token is never written');
  assert.deepEqual(written.chat.agent, { name: agentFor('https://strandmill.com').name, avatar: '/media/site/chat-agent.webp' }, 'a virtual agent with a headshot');
  assert.equal(made.length, 1);
  // Run again: the inbox named for the site is found, not created twice.
  const again = async () => ({ ok: true, json: async () => ({ payload: [{ channel_type: 'Channel::Api', name: 'Strandmill website chat', inbox_identifier: 'new-inbox' }] }) });
  assert.equal((await setupChat({ root, channelsPath: join(root, 'channels.json'), env, fetchImpl: again, avatarMaker })).inbox.created, false);
  assert.equal(made.length, 1, 'the headshot is made once');
  await setupChat({ root, off: true });
  assert.equal(JSON.parse(await readFile(join(root, 'src/data/site-runtime.json'), 'utf8')).chat, false);
  assert.equal(JSON.parse(await readFile(join(root, 'src/data/site-runtime.json'), 'utf8')).chat, false);
  const bare = await mkdtemp(join(tmpdir(), 'chat-bare-'));
  await assert.rejects(setupChat({ root: bare, channelsPath: join(root, 'channels.json'), env: {}, avatarMaker }), /company name first/);
  await writeFile(join(root, 'bad.json'), JSON.stringify({ whatsapp: [{ number: '138' }] }));
  await assert.rejects(setupChat({ root, channelsPath: join(root, 'bad.json'), env: {}, avatarMaker }), /international number/);
  assert.equal(made.length, 1, 'nothing is made for unusable channels');
});

test('each site gets its own virtual agent name, kept across runs', () => {
  assert.deepEqual(agentFor('https://strandmill.com'), agentFor('https://strandmill.com'));
  const names = new Set(['https://a-one.com', 'https://b-two.com', 'https://c-three.com', 'https://d-four.com', 'https://e-five.com'].map((origin) => agentFor(origin).name));
  assert.ok(names.size >= 3, 'sites differ');
  const agents = { names: ['Ada'], looks: ['a person with short hair'], headshot: 'Headshot of {look}.', headshotAvoid: 'No logos.' };
  assert.deepEqual(agentFor('https://strandmill.com', agents), { name: 'Ada', look: 'a person with short hair' }, 'names and looks come from the config');
  assert.deepEqual(avatarPrompt({ look: 'a person with short hair', master: 'm.png' }, agents).split('\n').slice(1, 3), ['Headshot of a person with short hair.', 'No logos.']);
  assert.equal(agentGreeting({ name: 'Emma' }, 'Strandmill'), "Hi, I'm Emma from Strandmill. Tell us about your project and we will get back to you.");
  assert.match(chatProblems({ ...chat, agent: { avatar: '/x.webp' } })[0], /agent needs a name/);
});
