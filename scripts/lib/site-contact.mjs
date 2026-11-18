// The company's ways to be reached, as one list for every place that shows them (the footer, the contact page's
// channels): its own details (src/data/site-contact.json) first, then the site's chat lines (site-runtime.json chat).
// Each has its kind (for its icon), a label to show and, where it can be acted on, a link.

import { whatsappDigits } from './chat-config.mjs';
import { publicAddressText } from './site-company.mjs';

export const CHANNEL_KINDS = Object.freeze(['email', 'phone', 'whatsapp', 'address', 'hours']);

// The company's own WhatsApp number (site-contact.json whatsapp, a stand-in until the owner gives one) shows beside the
// phone unless a chat line has the same number.
/** @param {{ contact?: { email?: string, phone?: string, whatsapp?: string, address?: string, hours?: string } | null, chat?: { email?: string, whatsapp?: { number: string }[] } | false | null }} [sources] */
export function contactChannels({ contact = null, chat = null } = {}) {
  const email = contact?.email || chat?.email;
  const lines = (chat?.whatsapp ?? []).map((line) => whatsappDigits(line.number));
  const ownWhatsapp = contact?.whatsapp && whatsappDigits(contact.whatsapp) && !lines.includes(whatsappDigits(contact.whatsapp)) ? contact.whatsapp : null;
  return [
    ...(email ? [{ kind: 'email', label: email, href: `mailto:${email}` }] : []),
    ...(contact?.phone ? [{ kind: 'phone', label: contact.phone, href: `tel:${contact.phone.replace(/[^+0-9]/g, '')}` }] : []),
    ...(ownWhatsapp ? [{ kind: 'whatsapp', label: `WhatsApp ${ownWhatsapp}`, href: `https://wa.me/${whatsappDigits(ownWhatsapp)}` }] : []),
    ...(chat?.whatsapp ?? []).map((line) => ({ kind: 'whatsapp', label: `WhatsApp ${line.number}`, href: `https://wa.me/${whatsappDigits(line.number)}` })),
    // The street stays off the pages for now (lib/site-company.mjs publicAddressText, owner 2026-11-17).
    ...(contact?.address ? [{ kind: 'address', label: publicAddressText(contact.address) }] : []),
    ...(contact?.hours ? [{ kind: 'hours', label: contact.hours }] : []),
  ];
}
