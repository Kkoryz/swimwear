// The company's ways to be reached, as one list for every place that shows them (the footer, the contact page's
// channels): its own details (src/data/site-contact.json) first, then the site's chat lines (site-runtime.json chat).
// Each has its kind (for its icon), a label to show and, where it can be acted on, a link.

import { whatsappDigits } from './chat-config.mjs';

export const CHANNEL_KINDS = Object.freeze(['email', 'phone', 'whatsapp', 'address', 'hours']);

/** @param {{ contact?: { email?: string, phone?: string, address?: string, hours?: string } | null, chat?: { email?: string, whatsapp?: { number: string }[] } | false | null }} [sources] */
export function contactChannels({ contact = null, chat = null } = {}) {
  const email = contact?.email || chat?.email;
  return [
    ...(email ? [{ kind: 'email', label: email, href: `mailto:${email}` }] : []),
    ...(contact?.phone ? [{ kind: 'phone', label: contact.phone, href: `tel:${contact.phone.replace(/[^+0-9]/g, '')}` }] : []),
    ...(chat?.whatsapp ?? []).map((line) => ({ kind: 'whatsapp', label: `WhatsApp ${line.number}`, href: `https://wa.me/${whatsappDigits(line.number)}` })),
    ...(contact?.address ? [{ kind: 'address', label: contact.address }] : []),
    ...(contact?.hours ? [{ kind: 'hours', label: contact.hours }] : []),
  ];
}
