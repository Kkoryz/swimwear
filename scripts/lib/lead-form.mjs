// The enquiry form (config/lead-form.json, the form contract): the same on every page and every site, never written by
// Site Factory. Disabled and without an action until the contract says "connected". The renderer's closing band and
// hero use it as well as the importer, so it stays apart from the blueprint builder.
import LEAD_FORM from '../../config/lead-form.json' with { type: 'json' };

// The privacy page the consent links to: the site's own page of type privacy (its route comes from the site tree, e.g.
// /privacy-policy/), else the contract's default.
/** @type {(pages?: { pageType: string, route: string }[], form?: { consent?: { privacyRoute?: string } }) => string | null} */
export const privacyRouteOf = (pages = [], form = LEAD_FORM) => pages.find((page) => page.pageType === 'privacy')?.route ?? form.consent?.privacyRoute ?? null;

export function leadFormBlock(id, form = LEAD_FORM) {
  return {
    id, type: 'form', heading: form.heading,
    fields: form.fields.map(({ name, label, kind, required, autocomplete }) => ({ name, label, kind, required, ...(autocomplete ? { autocomplete } : {}) })),
    consent: form.consent, honeypot: form.honeypot, endpoint: form.endpoint, status: form.status, submitLabel: form.submitLabel,
  };
}
