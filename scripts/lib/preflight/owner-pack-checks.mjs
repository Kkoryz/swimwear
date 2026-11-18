// Preflight checks on the owner's pack (four-site audit 2026-11-17, Fable's plan G-1): what only the owner can give,
// asked on day one and held at launch, never at build. The groups of the pack a launch cannot do without: the legal
// entity (who stands behind the site and controls its data) and the privacy facts (how long enquiries are kept, whom
// to ask) once a form collects personal data. Site Factory's open questions to the owner: a capability the owner has
// not said the company does (scope_unconfirmed) and a question that needs the owner's own number (needs_owner_number:
// a price, a minimum term, a lead time), each one sign-off item until answered (proof-signoff.mjs ownerTodoItems).
// Stand-in values the owner has not replaced hold elsewhere (company_stand_in, owner_signoff_pending); these hold what
// is missing altogether. promise_without_asset and cta_target_without_form are build checks of the SEO audit
// (lib/seo-site-checks.mjs, lib/seo-audit.mjs): they hold through seo_audit_failed and are listed by their owner.
import { formRoutes } from './findings.mjs';

// Site Factory's reasons for an owner to-do item that holds the launch under its own code (owner/todo.json `reason`).
export const LAUNCH_REASONS = Object.freeze(['scope_unconfirmed', 'needs_owner_number']);
export const hasLaunchReason = (item) => LAUNCH_REASONS.includes(item?.reason);

// Whether the site collects personal data: a form on a built page (enquiry or resource request), or the live chat.
const collectsPersonalData = (ctx) => formRoutes(ctx).length > 0 || Boolean(ctx.runtime?.chat?.chatwoot);

// The groups of the owner's pack the site lacks: [{ group, missing }].
export function ownerPackGaps(ctx) {
  const gaps = [];
  if (!ctx.company?.legalName) gaps.push({ group: 'legal_entity', missing: 'the legal name of the company behind the site (src/data/site-company.json legalName)' });
  if (collectsPersonalData(ctx)) {
    const privacy = ctx.proof?.privacy ?? {};
    const contact = privacy.contact ?? (ctx.contact?.placeholder ? null : ctx.contact?.email ?? null);
    const missing = [!privacy.retention && 'how long enquiries are kept', !contact && 'whom to ask about personal data'].filter(Boolean);
    if (missing.length) gaps.push({ group: 'privacy_facts', missing: `${missing.join(' and ')} (src/data/site-proof.json privacy), required while a form collects personal data` });
  }
  return gaps;
}

const reasonCheck = (code, what) => ({ code, level: 'hold', run: (ctx) => (ctx.signoff?.items ?? []).filter((item) => item.reason === code && item.status !== 'confirmed').map((item) => ({
  detail: `${item.id}: ${item.description} (${what}; answer it, then pnpm signoff --confirm ${item.id})`,
  items: item.pageId ? ctx.pages.filter((page) => page.id === item.pageId).map((page) => `${page.route}${item.sectionId ? ` ${item.sectionId}` : ''}`) : [],
})) });

export const OWNER_PACK_CHECKS = [
  { code: 'owner_pack_missing', level: 'hold', run: (ctx) => ownerPackGaps(ctx).map(({ group, missing }) => ({ detail: `${group}: ${missing}`, items: [group] })) },
  reasonCheck('scope_unconfirmed', 'a capability the pages offer that the owner has not confirmed the company does, does not do or does through a partner'),
  // No public profile in sameAs (Fable's plan P-4): never a hold, the profiles are built after launch (the handoff's
  // 实体建设 rows), but the Organization says less about who the company is until they are.
  { code: 'entity_profiles_missing', level: 'notice', run: (ctx) => ctx.company && !((ctx.company.standIns ?? []).includes('sameAs') ? [] : ctx.company.sameAs ?? []).length && { detail: 'the Organization markup names no public profile (src/data/site-company.json sameAs): build LinkedIn, Bing Places and directory listings after launch (handoff 实体建设), then pnpm handoff -- --same-as <url>' } },
  reasonCheck('needs_owner_number', 'a question the pages answer that needs the owner\'s own number: a price or starting price, a minimum term, an exit clause, a lead time, a minimum order or how to pay'),
];
