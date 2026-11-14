// Preflight checks that the build released is the one audited and reviewed (lib/verified-build.mjs): the owner was
// shown builds nobody had reviewed (2026-11-12), and the gate never read the audits or the review.
import { found } from './findings.mjs';

// Each reason a build is not verified is a hold of its own code.
const because = (code) => ({ code, level: 'hold', run: (ctx) => (ctx.verification?.problems ?? []).filter((problem) => problem.code === code).map(({ detail }) => ({ detail })) });

export const VERIFICATION_CHECKS = [
  because('verified_build_missing'),
  because('verified_build_mismatch'),
  because('layout_audit_not_passed'),
  because('design_review_not_current'),
  // The design review looks at representative pages; the rest passed the machine audits only.
  { code: 'pages_audited_only', level: 'notice', run: (ctx) => found('pages that passed the audits but were not looked at by the design review', ctx.verification?.record?.auditedOnly ?? []) },
];
