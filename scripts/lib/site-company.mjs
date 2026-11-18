// The company behind the site (src/data/site-company.json): its legal name and form, postal address, founding date,
// service area and public profiles, the one source the Organization and Service markup (lib/seo-head.mjs), the footer's
// legal line and the privacy page read. The four-site audit 2026-11-17 found the Organization thin (no legalName,
// address, sameAs or areaServed) and no Service with areaServed: nothing upstream gave these values.
//
// Each value comes from Site Factory's package (its site-level company block, contract H-1) or the identity's
// project.yaml (company, market) when they give it; else from the approved facts (a founding year) or the contact
// details (the address); else it is an invented stand-in, plausible for the trade and the site's location and made per
// site from the site's name (like scaffold-site-proof.mjs standInClients), never a real company and never a
// registration or certificate number (owner 2026-11-17). Stand-ins are listed in standIns: they are stated in the
// structured data (claude-seo seo-schema: emit, mark for replacement), listed in the release sign-off (proof-signoff.mjs)
// and hold the launch preflight (company_stand_in) until the owner replaces them.

import { createHash } from 'node:crypto';

export const COMPANY_SCHEMA = 'seo-site-company-v1';
// The values a company record holds, in the order the sign-off lists them.
export const COMPANY_FIELDS = Object.freeze(['legalName', 'legalForm', 'address', 'foundingDate', 'serviceArea', 'sameAs']);

// Countries the sites are in or sell to: the names an address or a fact uses for them, their legal forms (the suffix a
// legal name ends with, and what it is) and the places a stand-in office is put (a city and its region).
export const COUNTRIES = Object.freeze({
  CN: { name: 'China', aliases: ['china', 'prc', "people's republic of china", 'p.r. china'], demonyms: ['chinese'], legalForms: [{ suffix: 'Co., Ltd.', form: 'Limited liability company' }], cityFirst: true, places: [['Guangzhou', 'Guangdong'], ['Shenzhen', 'Guangdong'], ['Dongguan', 'Guangdong'], ['Ningbo', 'Zhejiang'], ['Hangzhou', 'Zhejiang'], ['Xiamen', 'Fujian'], ['Suzhou', 'Jiangsu']] },
  US: { name: 'United States', aliases: ['us', 'usa', 'u.s.', 'u.s.a.', 'united states', 'united states of america', 'america'], demonyms: ['american'], legalForms: [{ suffix: 'LLC', form: 'Limited liability company' }, { suffix: 'Inc.', form: 'Corporation' }], places: [['Austin', 'Texas'], ['Denver', 'Colorado'], ['Phoenix', 'Arizona'], ['Charlotte', 'North Carolina'], ['Columbus', 'Ohio'], ['Raleigh', 'North Carolina'], ['Tampa', 'Florida']] },
  CA: { name: 'Canada', aliases: ['canada'], demonyms: ['canadian'], legalForms: [{ suffix: 'Inc.', form: 'Corporation' }, { suffix: 'Ltd.', form: 'Corporation' }], places: [['Toronto', 'Ontario'], ['Vancouver', 'British Columbia'], ['Calgary', 'Alberta'], ['Ottawa', 'Ontario'], ['Halifax', 'Nova Scotia']] },
  GB: { name: 'United Kingdom', aliases: ['uk', 'u.k.', 'united kingdom', 'great britain', 'england', 'scotland', 'wales'], demonyms: ['british'], legalForms: [{ suffix: 'Ltd', form: 'Private limited company' }], places: [['Manchester', 'England'], ['Leeds', 'England'], ['Bristol', 'England'], ['Glasgow', 'Scotland']] },
  AU: { name: 'Australia', aliases: ['australia'], demonyms: ['australian'], legalForms: [{ suffix: 'Pty Ltd', form: 'Proprietary limited company' }], places: [['Melbourne', 'Victoria'], ['Brisbane', 'Queensland'], ['Perth', 'Western Australia']] },
});

// The country code a name stands for ("Canada", "USA", "us"), or null.
export function countryCode(name) {
  const text = String(name ?? '').trim().toLowerCase();
  if (!text) return null;
  if (COUNTRIES[text.toUpperCase()]) return text.toUpperCase();
  return Object.entries(COUNTRIES).find(([, country]) => country.aliases.includes(text))?.[0] ?? null;
}

// Contact text that only reads as a stand-in ("Office address to be confirmed"): no place in it.
const UNKNOWN = /\bto be confirmed\b|\btbc\b|\bplaceholder\b/i;

// A postal address as schema.org has it from "City, Region, Country" (or "City, Country", or a street before them);
// null when it names no place.
export function parseAddress(text) {
  if (!text || UNKNOWN.test(text)) return null;
  const parts = String(text).split(',').map((part) => part.trim()).filter(Boolean);
  const code = countryCode(parts.at(-1));
  const places = code ? parts.slice(0, -1) : parts;
  if (!places.length) return code ? { addressCountry: code } : null;
  const postal = places.at(-1).match(/^(.*?)\s+([A-Z0-9]{3,4}\s?[A-Z0-9]{3}|\d{5,6}(?:-\d{4})?)$/);
  const [region, postalCode] = postal ? [postal[1], postal[2]] : [places.at(-1), null];
  const [street, locality] = places.length >= 3 ? [places.slice(0, -2).join(', '), places.at(-2)] : [null, places.length === 2 ? places[0] : region];
  return {
    ...(street ? { streetAddress: street } : {}),
    addressLocality: locality,
    ...(places.length >= 2 && region !== locality ? { addressRegion: region } : {}),
    ...(postalCode ? { postalCode } : {}),
    ...(code ? { addressCountry: code } : {}),
  };
}

// A phone number in E.164 (+ and the country code, digits only), or null when it is not one: a number without its
// country code, or a North American one without its ten digits (the template's "+1 555 0100" stand-in).
export function e164(phone) {
  const digits = String(phone ?? '').replace(/(?!^\+)[^\d]/g, '');
  if (!/^\+[1-9]\d{6,14}$/.test(digits)) return null;
  if (digits.startsWith('+1') && digits.length !== 12) return null;
  return digits;
}

// The whole world as a service area (owner 2026-11-17, "全球 所有行业默认都是全球市场": every site of every trade serves
// worldwide unless Site Factory or the identity says otherwise): a schema.org Place named Worldwide, which areaServed
// accepts (schema.org areaServed: AdministrativeArea, GeoShape, Place or Text).
export const WORLDWIDE = Object.freeze({ type: 'Place', name: 'Worldwide' });
const WORLDWIDE_NAMES = /^(worldwide|world ?wide|global|globally|the world|international|all countries)$/i;

// A service area entry: worldwide, a country (by name or code) or a city; given as text or as { type, name }.
export function serviceAreaEntry(value) {
  if (WORLDWIDE_NAMES.test(String((value && typeof value === 'object' ? value.name : value) ?? '').trim())) return { ...WORLDWIDE };
  if (value && typeof value === 'object') {
    const code = value.code ?? countryCode(value.name);
    return value.type === 'City' || !code ? { type: value.type ?? 'City', name: value.name } : { type: 'Country', name: COUNTRIES[code]?.name ?? value.name, code };
  }
  const code = countryCode(value);
  return code ? { type: 'Country', name: COUNTRIES[code].name, code } : { type: 'City', name: String(value).trim() };
}

// The schema.org place of a service area entry (areaServed).
export const placeNode = (entry) => ({ '@type': entry.type, name: entry.name });

// An address as the pages show it for now (owner 2026-11-17: "法定名称和街道先不要放上去"): its city, region and
// country, without the street or the postal code; an address without either, or naming no place, as it is.
export function publicAddressText(text) {
  const parsed = parseAddress(text);
  if (!parsed || (!parsed.streetAddress && !parsed.postalCode)) return text;
  const country = String(text).split(',').map((part) => part.trim()).filter(Boolean).at(-1);
  return [parsed.addressLocality, parsed.addressRegion, parsed.addressCountry ? country : null].filter(Boolean).join(', ');
}

// The schema.org PostalAddress of the company's address.
export const postalAddress = (address) => (address ? { '@type': 'PostalAddress', ...address } : null);

// A value Site Factory or the identity gives: plain, or { value, placeholder } (Site Factory's own stand-in).
const givenValue = (value) => (value && typeof value === 'object' && !Array.isArray(value) && 'value' in value ? { value: value.value, standIn: value.placeholder === true } : { value, standIn: false });
const present = (value) => value !== undefined && value !== null && !(typeof value === 'string' && !value.trim()) && !(Array.isArray(value) && !value.length);

// A number from the site's name (seed) and what it is for: the same site always gets the same stand-in.
const seeded = (seed, salt) => createHash('sha256').update(`${seed}\u0000${salt}`).digest().readUInt32BE(0);
const pick = (list, seed, salt) => list[seeded(seed, salt) % list.length];
const words = (text) => String(text ?? '').trim().split(/\s+/).filter(Boolean);
const titleCase = (text) => words(text).map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');

// A founding year a fact states ("running since 2011", "founded in 2016").
const FOUNDED = /\b(?:since|founded in|established in|incorporated in|started in|set up in)\s+((?:19|20)\d{2})\b/i;
export function foundingFact(facts) {
  const found = [...(facts ?? new Map())].map(([id, fact]) => ({ id, fact, year: fact.text?.match(FOUNDED)?.[1] })).filter((item) => item.year);
  return found.find((item) => item.fact.approved) ?? found[0] ?? null;
}

// The country a fact places the company in ("RateHarbor is a Canadian company.", fact ids location-<country>).
function factCountry(facts) {
  for (const [id, fact] of facts ?? new Map()) {
    if (!/location/i.test(id)) continue;
    const text = `${id.replace(/^.*location-?/, '')} ${fact.text ?? ''}`.toLowerCase();
    const hit = Object.entries(COUNTRIES).find(([, country]) => [...country.aliases.filter((alias) => alias.length > 3), ...country.demonyms].some((name) => new RegExp(`\\b${name.replace(/[.]/g, '\\.')}\\b`).test(text)));
    if (hit) return hit[0];
  }
  return null;
}

// The company record. given: Site Factory's company block (authoring package company, contract H-1: legal_name,
// legal_form, address, founding_date, service_area, same_as; a value may be { value, placeholder }); project: the
// identity's project.yaml (its company block in the same shape, its market); market: the country the site's keywords
// target, when the identity has none (Site Factory's project.yaml market); facts: the approved facts (lib/facts.mjs);
// contact: src/data/site-contact.json; siteName and domain: the site's name and web domain; category: the trade's
// words ("swimwear"); previous: the record this replaces (a value the owner put in, not in its standIns, is kept).
export function companyFrom({ given = null, project = null, market = null, facts = null, contact = null, siteName, domain = null, category = null, previous = null }) {
  if (!siteName) throw new Error('companyFrom needs the site name');
  // Site Factory's project.yaml states the service area and the SEO market at its top level (service_area, seo_market;
  // SF integ/r11-1113, 2026-11-17), beside a company block of the same fields.
  const projectCompany = { ...(present(project?.service_area) ? { service_area: project.service_area } : {}), ...(project?.company ?? {}) };
  const upstream = { ...projectCompany, ...Object.fromEntries(Object.entries(given ?? {}).filter(([, value]) => present(givenValue(value).value))) };
  const standIns = new Set();
  const sources = {};
  // The owner's values: a field taken out of standIns (it was a stand-in, or the owner wrote it in). A value made from
  // upstream, the contact details, a fact or the default is made again from them; so is a service area made from the
  // keywords' market (source market) before the worldwide default (owner 2026-11-17).
  const owners = new Set(previous ? COMPANY_FIELDS.filter((field) => present(previous[field]) && !(previous.standIns ?? []).includes(field) && ['owner', 'stand-in', undefined].includes(previous.sources?.[field])) : []);
  // A value from upstream (Site Factory, the identity) wins; then the owner's own edit of this file; then what follows.
  const choose = (field, key, fallback) => {
    const { value, standIn } = givenValue(upstream[key]);
    if (present(value)) { sources[field] = given && present(givenValue(given[key]).value) ? 'site-factory' : 'identity'; if (standIn) standIns.add(field); return value; }
    if (owners.has(field)) { sources[field] = 'owner'; return previous[field]; }
    const made = fallback();
    sources[field] = made.source;
    if (made.standIn) standIns.add(field);
    return made.value;
  };
  const contactStandIn = (field) => contact?.placeholder === true || (contact?.standIns ?? []).includes(field);

  const address = choose('address', 'address', () => {
    const parsed = parseAddress(contact?.address);
    if (parsed?.addressLocality) return { value: parsed, source: 'contact', standIn: contactStandIn('address') };
    const code = parsed?.addressCountry ?? factCountry(facts) ?? countryCode(market) ?? 'US';
    const [locality, region] = pick(COUNTRIES[code].places, siteName, 'office');
    return { value: { addressLocality: locality, addressRegion: region, addressCountry: code }, source: 'stand-in', standIn: true };
  });
  const normalisedAddress = typeof address === 'string' ? parseAddress(address) : address;
  const country = COUNTRIES[normalisedAddress?.addressCountry] ? normalisedAddress.addressCountry : factCountry(facts) ?? countryCode(market) ?? 'US';

  const legalForm = choose('legalForm', 'legal_form', () => ({ value: pick(COUNTRIES[country].legalForms, siteName, 'legal-form').form, source: 'stand-in', standIn: true }));
  const legalName = choose('legalName', 'legal_name', () => {
    const forms = COUNTRIES[country].legalForms;
    const suffix = (forms.find((item) => item.form === legalForm) ?? pick(forms, siteName, 'legal-form')).suffix;
    // A Chinese company's English name leads with its city and its trade ("Guangzhou Strandmill Swimwear Co., Ltd.").
    const trade = words(category).length && words(category).length <= 2 ? titleCase(category) : '';
    const name = COUNTRIES[country].cityFirst ? [normalisedAddress?.addressLocality, siteName, trade].filter(Boolean).join(' ') : siteName;
    return { value: `${name} ${suffix}`, source: 'stand-in', standIn: true };
  });
  const foundingDate = choose('foundingDate', 'founding_date', () => {
    const fact = foundingFact(facts);
    if (fact) return { value: fact.year, source: `fact ${fact.id}`, standIn: !fact.fact.approved };
    return { value: String(new Date().getFullYear() - 4 - (seeded(siteName, 'founded') % 11)), source: 'stand-in', standIn: true };
  });
  // Worldwide unless Site Factory's package or the identity names the area (owner 2026-11-17): the market the site's
  // keywords target is the SEO market (seoMarket), never the area the company serves.
  const serviceArea = choose('serviceArea', 'service_area', () => ({ value: [WORLDWIDE.name], source: 'default', standIn: false }));
  const seoMarket = countryCode(project?.seo_market) ?? countryCode(project?.market?.country) ?? countryCode(market);
  const sameAs = choose('sameAs', 'same_as', () => {
    if (contact?.same_as?.length) return { value: contact.same_as, source: 'contact', standIn: contactStandIn('same_as') };
    // No profile is guessed (owner 2026-11-17): a handle made from the brand may be someone else's real page, and the
    // site's markup would vouch for it. Without the owner's profiles, sameAs is left out.
    return { value: [], source: 'none', standIn: false };
  });

  return {
    schemaVersion: COMPANY_SCHEMA,
    note: 'The company behind the site (scripts/scaffold-site-company.mjs, lib/site-company.mjs). Fields in standIns are invented or unconfirmed stand-ins: they are stated in the structured data and hold the launch until replaced. Replace a value and take its field out of standIns; a field not in standIns is kept on the next run.',
    legalName,
    legalForm,
    address: normalisedAddress,
    foundingDate: String(foundingDate),
    serviceArea: [serviceArea].flat().map(serviceAreaEntry),
    // The country the site's keywords target (Site Factory's project.yaml market): the SEO market, not the service area.
    seoMarket: seoMarket ?? null,
    sameAs: [sameAs].flat(),
    standIns: COMPANY_FIELDS.filter((field) => standIns.has(field)),
    sources,
    seed: siteName,
  };
}

// Where each company field shows in the structured data (lib/seo-head.mjs), for the preflight and the sign-off.
// The legal name is withheld from the markup for now (lib/seo-head.mjs WITHHELD_COMPANY_KEYS, owner 2026-11-17).
const SCHEMA_PATHS = { legalName: [], address: ['Organization.address'], foundingDate: ['Organization.foundingDate'], serviceArea: ['Organization.areaServed', 'Service.areaServed'], sameAs: ['Organization.sameAs'], legalForm: [] };
const shown = (field, company) => {
  const value = company[field];
  if (field === 'address') return [value?.streetAddress, value?.addressLocality, value?.addressRegion, value?.addressCountry].filter(Boolean).join(', ');
  if (field === 'serviceArea') return (value ?? []).map((entry) => entry.name).join('; ');
  return [value].flat().join('; ');
};

// Every stand-in value the site states, with where it shows in the structured data: the company's (standIns) and the
// contact details' (site-contact.json placeholder: its email and E.164 phone reach the Organization). [{ field, value,
// schema: ['Organization.legalName', ...], search: [strings the built JSON-LD carries] }].
export function companyStandIns(company, contact = null) {
  const items = (company?.standIns ?? []).map((field) => ({
    field,
    value: shown(field, company),
    schema: SCHEMA_PATHS[field] ?? [],
    search: field === 'address' ? [company.address?.addressLocality].filter(Boolean) : field === 'serviceArea' ? (company.serviceArea ?? []).map((entry) => entry.name) : field === 'legalForm' ? [] : [company[field]].flat().map(String),
  }));
  if (contact?.placeholder || contact?.standIns?.length) {
    const marked = (key) => contact.placeholder || contact.standIns?.includes(key);
    if (contact.email && marked('email')) items.push({ field: 'contact.email', value: contact.email, schema: ['Organization.email', 'ContactPoint.email'], search: [contact.email] });
    const phone = e164(contact.phone);
    if (phone && marked('phone')) items.push({ field: 'contact.phone', value: phone, schema: ['Organization.telephone', 'ContactPoint.telephone'], search: [phone] });
    // The stand-in WhatsApp number (owner 2026-11-17) shows on the pages only, in no structured data.
    if (contact.whatsapp && marked('whatsapp')) items.push({ field: 'contact.whatsapp', value: contact.whatsapp, schema: [], search: [] });
  }
  return items;
}

// The release sign-off items for the company's stand-ins (proof-signoff.mjs): one per field, pending until the owner
// replaces the value (the item goes once its field leaves standIns).
export function companySignoffItems(company) {
  return companyStandIns(company).map((item) => ({
    id: `company-${item.field.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`,
    description: `Replace the stand-in company ${item.field.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`)} "${item.value}"${item.schema.length ? ` (stated in the ${item.schema.join(', ')} structured data)` : ''} with the real one in src/data/site-company.json and take it out of standIns${item.field === 'sameAs' ? '; the profile URL is a guess at the brand\'s handle and may belong to someone else, so replace or remove it' : ''}`,
    status: 'pending',
  }));
}
