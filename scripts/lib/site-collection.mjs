// The collection contract (config/site-collection.json, site-collection/v1): what a site of this template may collect,
// item by item, with the switch that turns each on, exported for Site Factory (integ deb67119, 2026-11-17: its
// domain/site-collection.json was made by hand from 08 e8f01d79's data-practices.mjs until 08 exported it; Site Factory
// copies this file byte for byte, builds the privacy page's data_practices from it and names its sha256 in the
// handoff's contracts.site_collection_sha256, which the import checks: lib/sf-handoff.mjs). Every item's what, recorded
// and why is lib/data-practices.mjs's, word for word, so the package's table is the one 08 would write
// (scripts/test/site-collection.test.mjs). Written by scripts/export-site-collection.mjs; a test keeps the file current.

import { createHash } from 'node:crypto';
import LEAD_FORM from '../../config/lead-form.json' with { type: 'json' };
import { COLLECTION_DEFAULTS, DATA_PRACTICES_COLUMNS, DATA_PRACTICES_HEADING, ENQUIRY_CONTEXT, collectionItems } from './data-practices.mjs';
import { leadFormBlock, resourceFormBlock } from './lead-form.mjs';

export const SITE_COLLECTION_SCHEMA = 'site-collection/v1';
export const SITE_COLLECTION_PATH = 'config/site-collection.json';

// Site Factory's own sentences for its site facts (05_9: what the site collects, how it is reached, how a visitor gets
// a resource, the owner's privacy facts), word for word those of its hand-made domain/site-collection.json (integ
// deb67119, 2026-11-17), whose reader (sitefactory.shared.site_collection) takes them from this file once it copies it.
// 08 renders none of them: they are here so the copy keeps them.
export const SITE_FACTS = Object.freeze({
  collects: '{what}: {why_lower}.',
  channels: {
    label: 'Ways to reach us',
    text: 'only {items}',
    items: { email: 'email ({email})', phone: 'phone ({phone})', whatsapp: 'WhatsApp ({whatsapp_number})', form: 'the enquiry form on this website', chat: 'the live chat on this website' },
    join: [', ', ' and '],
  },
  attachments: { label: 'Files and attachments', text: 'the forms on this website take no attachments; files are sent to us by email' },
  resource_delivery: {
    form: 'Visitors ask for a resource through the resource request form on this website, and we email it to them.',
    files: 'These resources are files on this website for visitors to open: {names}.',
  },
  privacy_retention: 'We keep the details sent through this website for {retention}.',
  privacy_contact: 'Questions about the details this website holds go to {contact}.',
  privacy_rights: 'To see, correct or delete the details we hold about you, write to {contact}.',
});

// The contract from the form contract (config/lead-form.json): no date and no commit in it, so the same sources give
// the same bytes (Site Factory's fingerprint moves only when what the sites collect does).
export function siteCollection(form = LEAD_FORM) {
  // The enquiry form as a maker's site asks it; a service business's asks fewer ask fields, which record the same
  // (config/lead-form.json ask: one row for both kinds, site13 claude-seo audit 2026-11-17, M-15).
  const enquiry = leadFormBlock('form', form, { kind: 'product' });
  const service = leadFormBlock('form', form, { kind: 'service' });
  const resource = resourceFormBlock('resource-request', [], form);
  return {
    schemaVersion: SITE_COLLECTION_SCHEMA,
    source: {
      made: 'exported by stage 08 (seo_website_template scripts/export-site-collection.mjs); Site Factory copies it byte for byte to domain/site-collection.json',
      files: [
        'config/lead-form.json (fields, consent, resourceRequest)',
        'scripts/lib/data-practices.mjs (DATA_PRACTICES_HEADING, DATA_PRACTICES_COLUMNS, ENQUIRY_CONTEXT, COLLECTION_DEFAULTS, collectionItems)',
        'scripts/lib/lead-form.mjs (leadFormBlock, resourceFormBlock: the forms\' fields)',
        'scripts/lib/site-collection.mjs (SITE_FACTS: Site Factory\'s own sentences, carried word for word)',
      ],
      rows: 'each item\'s what / recorded / why is dataPractices()\'s row word for word (scripts/test/site-collection.test.mjs)',
      when: '"always", or {switch: value}: the item is on when every switch has that value; the switches are Site Factory\'s project.yaml site_services over the defaults, resource_form on when the site has its resources page',
      labels: 'the words a privacy page sentence repeating the row would hold (Site Factory S07-12)',
    },
    heading: DATA_PRACTICES_HEADING,
    columns: [...DATA_PRACTICES_COLUMNS],
    enquiry_context: [...ENQUIRY_CONTEXT],
    form_fields: {
      enquiry: [...new Set([...enquiry.fields, ...service.fields].map((field) => field.name))],
      resource: resource.fields.map((field) => field.name),
      file_upload: [...enquiry.fields, ...resource.fields].some((field) => field.kind === 'file'),
    },
    defaults: { ...COLLECTION_DEFAULTS },
    items: collectionItems({ form: enquiry, resourceForm: resource }),
    site_facts: SITE_FACTS,
  };
}

// The file's text as written (two-space JSON, LF, a closing newline: lib/json-io.mjs writeJson).
export const siteCollectionText = (form = LEAD_FORM) => `${JSON.stringify(siteCollection(form), null, 2)}\n`;
// Its fingerprint as Site Factory takes it (pipeline/handoff.py _collection_sha: the bytes with CRLF read as LF).
export const collectionSha256 = (text) => createHash('sha256').update(String(text).replace(/\r\n/g, '\n')).digest('hex');
