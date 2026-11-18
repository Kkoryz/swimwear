// The company's legal name wherever the site states who it is (four-site audit 2026-11-17: no legal name in the
// footer; claude-seo seo-content counts who stands behind a site among its trust signals). The one lookup: the company
// data's legalName (the owner's, once the site has that module), else the site's name from its identity, else none.
// The footer's copyright line reads it.

/** @param {{ identity?: { siteName?: string } | null, company?: { legalName?: string } | null }} [sources] @returns {string | null} */
export function legalName({ identity = null, company = null } = {}) {
  return company?.legalName?.trim() || identity?.siteName?.trim() || null;
}
