// The launch flow after stage 08 (owner 2026-11-18), in a fixed order of site-run steps:
//   build -> audits (layout, navigation) -> prelaunch (links, cannibal, near, owner_list, tech) -> conflicts (site-wide,
//   Site Factory's check) -> claude-seo-audit (once a site) -> seo-recheck (item by item) -> design review and
//   certification (the verified build) -> release (preflight with check:prelaunch --launch).
// Each part can be switched off in site.json, as the prelaunch checks are: launchFlow { audits, prelaunch, seo_audit,
// seo_recheck, design, release } each false or true; seo_recheck also "report" (its standing items are notices) or
// "block" (the default: they hold the preflight). The conflict step is the prelaunch check's own switch,
// prelaunch.conflicts (lib/prelaunch/config.mjs). llmAudit: false turns the claude-seo audit and its recheck off, as before.
// A part switched off is skipped and says so; what it would have checked still holds the preflight where the preflight
// asks for it (no verified build without the audits and the design review).

export const FLOW_PARTS = Object.freeze({
  audits: ['audits'],
  prelaunch: ['prelaunch'],
  seo_audit: ['claude-seo-audit'],
  seo_recheck: ['seo-recheck'],
  design: ['design-shots', 'design-review', 'buyer-review', 'design-gate', 'design-polish'],
  release: ['release'],
});
// The parts whose issues can be reported or held; the others are only on or off.
const MODES = Object.freeze({ seo_recheck: ['report', 'block'] });
export const FLOW_DEFAULTS = Object.freeze({ audits: 'on', prelaunch: 'on', seo_audit: 'on', seo_recheck: 'block', design: 'on', release: 'on' });

// { part: 'off' | 'on' | 'report' | 'block' } from site.json launchFlow (and llmAudit).
export function launchFlowModes(site = {}) {
  const given = site?.launchFlow ?? {};
  if (typeof given !== 'object' || Array.isArray(given)) throw new Error('site.json launchFlow must be an object of parts');
  const unknown = Object.keys(given).filter((key) => !(key in FLOW_PARTS));
  if (unknown.length) throw new Error(`site.json launchFlow: unknown part(s) ${unknown.join(', ')} (known: ${Object.keys(FLOW_PARTS).join(', ')}; the conflict check is prelaunch.conflicts)`);
  const modes = {};
  for (const part of Object.keys(FLOW_PARTS)) {
    const value = given[part];
    const allowed = MODES[part] ?? [];
    if (value === undefined || value === null) modes[part] = FLOW_DEFAULTS[part];
    else if (value === false || value === 'off') modes[part] = 'off';
    else if (value === true) modes[part] = FLOW_DEFAULTS[part];
    else if (allowed.includes(value)) modes[part] = value;
    else throw new Error(`site.json launchFlow.${part}: "${value}" is not a mode (false, true${allowed.map((mode) => `, "${mode}"`).join('')})`);
  }
  if (site?.llmAudit === false) { modes.seo_audit = 'off'; modes.seo_recheck = 'off'; }
  return modes;
}

// The part a site-run step belongs to, or null.
export const partOf = (stepId) => Object.entries(FLOW_PARTS).find(([, ids]) => ids.includes(stepId))?.[0] ?? null;

// Why a step is skipped by the site's switches, or null.
export function flowSkip(site, stepId) {
  const part = partOf(stepId);
  if (!part) return null;
  return launchFlowModes(site)[part] === 'off' ? `site.json launchFlow.${part} is off${part.startsWith('seo_') && site?.llmAudit === false ? ' (llmAudit: false)' : ''}` : null;
}
