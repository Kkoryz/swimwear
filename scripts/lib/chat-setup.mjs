// Stage 09: the site's corner chat (scripts/setup-chat.mjs, and site:config from the registry row). Writes `chat` into
// src/data/site-runtime.json from the owner's channels (WhatsApp numbers, email, greeting, reply time; the site's own,
// never invented) and, when the Chatwoot server is given in the environment, finds or creates this site's API inbox
// ("<site name> website chat") and records its inboxIdentifier. The chat's virtual agent: a first name picked from the
// site's domain (or the channels' agent.name) and an AI-generated professional headshot made once with Codex.

import { access, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import agents from '../../config/chat-agents.json' with { type: 'json' };
import { chatProblems } from './chat-config.mjs';
import { runCodex } from './codex-exec.mjs';
import { readJson, writeJson } from './json-io.mjs';
import { renderAvatar } from './web-image.mjs';

const CHANNEL_KEYS = ['whatsapp', 'email', 'prefill', 'greeting', 'quickReplies', 'replyTime', 'color', 'autoOpen', 'labels'];
export const AVATAR_SRC = '/media/site/chat-agent.webp';

// The site's agent, picked from its domain (config/chat-agents.json names and looks).
const hashOf = (text) => [...String(text)].reduce((hash, character) => (hash * 31 + character.codePointAt(0)) >>> 0, 7);
export const agentFor = (key, { names, looks } = agents) => ({ name: names[hashOf(key) % names.length], look: looks[hashOf(`${key}:look`) % looks.length] });
export const avatarPrompt = ({ look, master }, { headshot, headshotAvoid } = agents) => [
  'Use the built-in image_gen tool (not the CLI fallback).',
  headshot.replaceAll('{look}', look),
  headshotAvoid,
  `Save the final image into this workspace as ${master} (copy it there from the generated_images folder).`,
  `Finish by replying with only this JSON on one line: {"file": "${master}"}`,
].join('\n');

// The agent's headshot, made once with Codex: master in docs/research/images/masters, a 96 px WebP for the chat header.
export async function makeAvatar({ root, look }) {
  const { default: sharp } = await import('sharp');
  const master = 'docs/research/images/masters/chat-agent.png';
  const lastMessage = resolve(root, 'docs/research/images/masters/chat-agent.reply.json');
  await mkdir(resolve(root, 'docs/research/images/masters'), { recursive: true });
  const run = await runCodex({ root, prompt: avatarPrompt({ look, master }), lastMessage });
  if (run.code !== 0) throw new Error(`Codex could not make the chat avatar: ${run.stderr.trim().slice(-300)}`);
  await mkdir(resolve(root, 'public/media/site'), { recursive: true });
  await renderAvatar(sharp, resolve(root, master), resolve(root, 'public', AVATAR_SRC.slice(1)));
  // AI provenance is recorded next to the master, not in the published file.
  await writeJson(resolve(root, 'docs/research/images/masters/chat-agent.record.json'), { file: AVATAR_SRC, aiGenerated: { tool: 'Codex image_gen', at: new Date().toISOString() } });
  return AVATAR_SRC;
}

// The site's Chatwoot API inbox: the one already named for it, else a new one.
export const inboxName = (identity) => `${identity.siteName} website chat`;
export async function apiInbox({ server, identity, fetchImpl = fetch }) {
  const base = `${server.url.replace(/\/$/, '')}/api/v1/accounts/${server.accountId}/inboxes`;
  const headers = { api_access_token: server.token, 'content-type': 'application/json' };
  const call = async (url, init = {}) => {
    const response = await fetchImpl(url, { ...init, headers });
    if (!response.ok) throw new Error(`Chatwoot ${init.method ?? 'GET'} ${url}: HTTP ${response.status}`);
    return response.json();
  };
  const existing = (await call(base)).payload?.find((inbox) => inbox.channel_type === 'Channel::Api' && inbox.name === inboxName(identity));
  const inbox = existing ?? await call(base, { method: 'POST', body: JSON.stringify({ name: inboxName(identity), channel: { type: 'api' } }) });
  if (!inbox.inbox_identifier) throw new Error(`Chatwoot inbox ${inboxName(identity)} has no inbox_identifier`);
  return { inboxIdentifier: inbox.inbox_identifier, created: !existing };
}

// channels: the channel data itself (site:config passes the registry row), else channelsPath is read.
export async function setupChat({ root = process.cwd(), channelsPath = null, channels: given = null, off = false, avatar = true, env = process.env, fetchImpl = fetch, avatarMaker = makeAvatar } = {}) {
  const runtimePath = resolve(root, 'src/data/site-runtime.json');
  const runtime = await readJson(runtimePath, {});
  let chat = false;
  let inbox = null;
  if (!off) {
    const channels = given ?? await readJson(resolve(channelsPath));
    chat = Object.fromEntries(CHANNEL_KEYS.filter((key) => channels[key] !== undefined).map((key) => [key, channels[key]]));
    // An inbox the registry already records is used as it is; otherwise the Chatwoot server finds or creates it.
    if (channels.chatwoot?.baseUrl && channels.chatwoot?.inboxIdentifier) {
      chat.chatwoot = { baseUrl: channels.chatwoot.baseUrl.replace(/\/$/, ''), inboxIdentifier: channels.chatwoot.inboxIdentifier };
    } else if (env.CHATWOOT_URL) {
      if (!env.CHATWOOT_ACCOUNT_ID || !env.CHATWOOT_API_TOKEN) throw new Error('CHATWOOT_URL needs CHATWOOT_ACCOUNT_ID and CHATWOOT_API_TOKEN');
      const identity = await readJson(resolve(root, 'src/data/site-identity.json'), null);
      if (!identity?.origin) throw new Error('live chat needs the site identity (its domain) first: src/data/site-identity.json');
      inbox = await apiInbox({ server: { url: env.CHATWOOT_URL, accountId: env.CHATWOOT_ACCOUNT_ID, token: env.CHATWOOT_API_TOKEN }, identity, fetchImpl });
      chat.chatwoot = { baseUrl: env.CHATWOOT_URL.replace(/\/$/, ''), inboxIdentifier: inbox.inboxIdentifier };
    } else if (runtime.chat?.chatwoot) {
      chat.chatwoot = runtime.chat.chatwoot;
    }
    // Channels are checked before anything is made.
    const early = chatProblems(chat);
    if (early.length) throw new Error(`chat channels are not usable:\n${early.join('\n')}`);
    // The agent: the channel file's name, else one picked from the site's domain; the headshot is kept once made.
    // She introduces herself with the company's name (the site identity), so the identity comes first.
    const identity = await readJson(resolve(root, 'src/data/site-identity.json'), null);
    if (!identity?.siteName) throw new Error('the chat needs the company name first: import the brand kit (src/data/site-identity.json)');
    const picked = agentFor(identity.origin ?? identity.siteName);
    const name = channels.agent?.name ?? runtime.chat?.agent?.name ?? picked.name;
    const kept = runtime.chat?.agent?.avatar;
    const keptExists = kept ? await access(resolve(root, 'public', kept.slice(1))).then(() => true, () => false) : false;
    const image = keptExists ? kept : avatar ? await avatarMaker({ root, look: channels.agent?.look ?? picked.look }) : null;
    chat.agent = { name, ...(channels.agent?.title ? { title: channels.agent.title } : {}), ...(image ? { avatar: image } : {}) };
  }
  const problems = chatProblems(chat);
  if (problems.length) throw new Error(`chat channels are not usable:\n${problems.join('\n')}`);
  await writeJson(runtimePath, { ...runtime, chat });
  return { chat, inbox };
}
