#!/usr/bin/env node

// Stage 09: the site's corner chat (scripts/lib/chat-setup.mjs). Writes `chat` into src/data/site-runtime.json from the
// owner's channel file (WhatsApp numbers, email, greeting, reply time; the site's own, never invented) and, when the
// Chatwoot server is given in the environment, finds or creates this site's API inbox ("<site name> website chat", the
// inbox the site's chat window talks to through Chatwoot's client API) and records its inboxIdentifier.
// Environment (never written to a file): CHATWOOT_URL, CHATWOOT_ACCOUNT_ID, CHATWOOT_API_TOKEN (an agent or admin
// access token from the Chatwoot profile settings).
// The chat's virtual agent: a first name picked from the site's domain (or the channel file's agent.name) and an
// AI-generated professional headshot made once with Codex (public/media/site/chat-agent.webp; recorded as AI in
// docs/research/images/masters/chat-agent.record.json, the file itself carries no metadata).
// Usage: node scripts/setup-chat.mjs --channels <site-channels.json> [--no-avatar] | --off

import { setupChat } from './lib/chat-setup.mjs';
import { cliArgs, runMain, usage } from './lib/cli.mjs';

runMain(import.meta.url, async () => {
  const { values } = cliArgs({ channels: { type: 'string' }, off: { type: 'boolean' }, 'no-avatar': { type: 'boolean' } });
  const off = values.off === true;
  if (!off && !values.channels) return usage('Usage: node scripts/setup-chat.mjs --channels <site-channels.json> | --off');
  const { chat, inbox } = await setupChat({ channelsPath: off ? null : values.channels, off, avatar: values['no-avatar'] !== true });
  if (chat === false) console.log('chat: off');
  else console.log(`chat: ${[chat.chatwoot && `live chat (${inbox ? (inbox.created ? 'inbox created' : 'inbox found') : 'kept'})`, chat.whatsapp?.length && `${chat.whatsapp.length} WhatsApp`, chat.email && 'email', `agent ${chat.agent.name}${chat.agent.avatar ? ' with headshot' : ''}`].filter(Boolean).join(', ')}`);
});
