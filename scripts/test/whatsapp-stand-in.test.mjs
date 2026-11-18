import assert from 'node:assert/strict';
import test from 'node:test';

import { standInPhone, standInWhatsapp, withContactStandIns } from '../import-site-factory.mjs';
import { companyStandIns } from '../lib/site-company.mjs';
import { contactChannels } from '../lib/site-contact.mjs';

// Owner 2026-11-17 ("whatsapp号码随便编"); site13 blind audit H4: the copy offered WhatsApp and no number existed.
test('a site whose copy names WhatsApp gets a stand-in mobile number of its country, stable, never 555, in standIns', () => {
  const factory = withContactStandIns({ email: 'sales@strandmill.com', phone: '', address: 'Guangzhou, Guangdong, China', hours: 'x' }, { origin: 'https://strandmill.com', whatsapp: true });
  assert.match(factory.whatsapp, /^\+86 1[3-9]\d \d{4} \d{4}$/);
  assert.notEqual(factory.whatsapp.replace(/\D/g, ''), factory.phone.replace(/\D/g, ''), 'not the phone number');
  assert.equal(factory.whatsapp, standInWhatsapp('strandmill.com', 'Guangzhou, Guangdong, China'), 'the same on every run');
  assert.deepEqual(factory.standIns, ['phone', 'whatsapp']);
  assert.equal(factory.placeholder, true);
  assert.match(standInWhatsapp('rateharbor.com', 'Toronto, Ontario, Canada'), /^\+1 647 [2-9]\d{2} \d{4}$/);
  for (const host of ['motelpilot.com', 'a.com', 'b.com', 'c.com', 'd.com']) assert.doesNotMatch(standInWhatsapp(host, ''), /^\+1 \d{3} 555 /);
  assert.notEqual(standInWhatsapp('strandmill.com', 'China'), standInPhone('strandmill.com', 'China'));
  // No WhatsApp in the copy, or a number given: nothing is invented.
  assert.equal(withContactStandIns({ email: 'a@b.co', phone: '1', address: 'x', hours: 'y' }, { origin: 'https://b.co' }).whatsapp, undefined);
  assert.equal(withContactStandIns({ email: 'a@b.co', phone: '1', address: 'x', hours: 'y', whatsapp: '+86 138 1234 5678' }, { origin: 'https://b.co', whatsapp: true }).placeholder, undefined);
});

test('the WhatsApp number shows with the other contact channels as a wa.me link, once, and is listed for replacement', () => {
  const contact = { email: 'sales@strandmill.com', phone: '+86 20 5399 3238', whatsapp: '+86 158 1234 5678', address: 'Guangzhou, Guangdong, China', placeholder: true, standIns: ['phone', 'whatsapp'] };
  const channels = contactChannels({ contact });
  assert.deepEqual(channels.map((channel) => channel.kind), ['email', 'phone', 'whatsapp', 'address']);
  assert.deepEqual(channels[2], { kind: 'whatsapp', label: 'WhatsApp +86 158 1234 5678', href: 'https://wa.me/8615812345678' });
  // A chat line with the same number is not shown twice.
  assert.equal(contactChannels({ contact, chat: { whatsapp: [{ number: '+86 158 1234 5678' }] } }).filter((channel) => channel.kind === 'whatsapp').length, 1);
  assert.deepEqual(companyStandIns(null, contact).find((item) => item.field === 'contact.whatsapp'), { field: 'contact.whatsapp', value: '+86 158 1234 5678', schema: [], search: [] });
});
