// Site chat (src/data/site-runtime.json `chat`): the corner chat window. Live chat is the site's own window talking
// to a self-hosted Chatwoot API inbox (one per site, scripts/lib/chat-client.mjs); without it the window hands the
// visitor's message to WhatsApp or email. WhatsApp numbers and the email address are the site's own. Every channel
// starts from a message naming the page. `chat: false` turns the chat off for a site; no `chat` at all is undecided
// (stage 11 holds release).

export const DEFAULT_PREFILL = 'Hello, I would like to ask about {title}: {url}';
export const DEFAULT_GREETING = 'Hi there! Tell us about your project and we will get back to you.';
// Two questions a buyer can send with one tap (what B2B buyers ask first).
export const DEFAULT_QUICK_REPLIES = Object.freeze(['I would like a quote.', 'Can I order samples first?']);
// Green reads as "chat" at a glance; white text on it passes WCAG AA. `color: "accent"` follows the site accent.
export const DEFAULT_COLOR = '#15803d';
// Desktop only; 5-10 s after arrival is the usual advice (sooner feels invasive, later misses most visitors).
export const DEFAULT_AUTO_OPEN_SECONDS = 8;
export const DEFAULT_LABELS = Object.freeze({
  launcher: 'Chat with us',
  placeholder: 'Type your message…',
  send: 'Send',
  whatsapp: 'WhatsApp',
  email: 'Email',
  close: 'Close',
  emailAsk: 'Leave your email so we can reply even if you leave this page.',
  emailSave: 'Save',
  emailSaved: 'Thanks, we will reply to {email}.',
  unavailable: 'Chat is not available right now. Please continue on WhatsApp or by email.',
});

// Black or white, whichever reads better on a colour (WCAG relative luminance).
export function contrastText(hex) {
  const channels = hex.replace('#', '').match(/../g).map((part) => parseInt(part, 16) / 255).map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  const luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  return 1.05 / (luminance + 0.05) >= (luminance + 0.05) / 0.05 ? '#ffffff' : '#000000';
}

// https, or a local development server.
const isHttps = (value) => typeof value === 'string' && (/^https:\/\/[^/\s]+(\/[^\s]*)?$/.test(value) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(value));
// WhatsApp click-to-chat takes the full international number, digits only (no +, spaces or leading zeros).
export const whatsappDigits = (number) => String(number ?? '').replace(/[^\d]/g, '');
const isWhatsapp = (number) => /^[1-9]\d{7,14}$/.test(whatsappDigits(number));
const isEmail = (value) => typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const isText = (value) => typeof value === 'string' && value.trim().length > 0;

// Problems with a chat config (empty when usable). `false` (chat off) has none.
export function chatProblems(chat) {
  if (chat === false) return [];
  if (!chat || typeof chat !== 'object') return ['chat must be an object, or false for no chat'];
  const problems = [];
  if (chat.chatwoot != null && !(isHttps(chat.chatwoot.baseUrl) && isText(chat.chatwoot.inboxIdentifier))) problems.push('chat.chatwoot needs an https baseUrl and the API inbox inboxIdentifier');
  for (const [index, line] of (chat.whatsapp || []).entries()) if (!isWhatsapp(line?.number)) problems.push(`chat.whatsapp[${index}].number must be a full international number (country code first, 8-15 digits)`);
  if (chat.email != null && !isEmail(chat.email)) problems.push('chat.email must be an email address');
  if (!chat.chatwoot && !chat.whatsapp?.length && !chat.email) problems.push('chat has no channel (chatwoot, whatsapp or email)');
  if (chat.prefill != null && !(isText(chat.prefill) && chat.prefill.includes('{url}'))) problems.push('chat.prefill must name the page with {url}');
  if (chat.color != null && chat.color !== 'accent' && !/^#[0-9a-f]{6}$/i.test(chat.color)) problems.push('chat.color must be a #rrggbb colour, or "accent" for the site accent');
  if (chat.autoOpen != null && !(Number.isFinite(chat.autoOpen) && chat.autoOpen >= 0)) problems.push('chat.autoOpen must be seconds (0: never opens by itself)');
  if (chat.quickReplies != null && !(Array.isArray(chat.quickReplies) && chat.quickReplies.length <= 3 && chat.quickReplies.every(isText))) problems.push('chat.quickReplies must be up to 3 texts');
  if (chat.agent != null && !(isText(chat.agent.name) && (chat.agent.avatar == null || (typeof chat.agent.avatar === 'string' && chat.agent.avatar.startsWith('/'))))) problems.push('chat.agent needs a name and, when it has one, an avatar path starting with /');
  for (const key of ['greeting', 'replyTime']) if (chat[key] != null && !isText(chat[key])) problems.push(`chat.${key} must be text`);
  return problems;
}

// The chat's virtual agent (a first name and an AI-generated headshot per site, scripts/lib/chat-setup.mjs) greets
// under its own name; the team replies under it.
export const agentGreeting = (agent, siteName) => `Hi, I'm ${agent.name}${siteName ? ` from ${siteName}` : ''}. Tell us about your project and we will get back to you.`;

// The opening message for one page.
export const prefillFor = (chat, { title, url }) => (chat.prefill ?? DEFAULT_PREFILL).replaceAll('{title}', title).replaceAll('{url}', url);

export const whatsappLink = (number, text) => `https://wa.me/${whatsappDigits(number)}?text=${encodeURIComponent(text)}`;
export const mailtoLink = (email, subject, body) => `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
