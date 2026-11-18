// The prelaunch checks' switches (owner 2026-11-18: every check can be turned off at any time; the owner's materials
// list only stands in, it never holds a release). site.json prelaunch: { links, cannibal, near, owner_list, tech,
// conflicts }, each false (off), true or "report" (reported, never holds), or "block" (its issues hold the release:
// the release step waits, the preflight holds, the release workflow stops). A check site.json does not name takes its default: all on as reports, the
// site-wide conflict check off until Site Factory's site fact library is there.

export const CHECK_IDS = Object.freeze(['links', 'cannibal', 'near', 'owner_list', 'tech', 'conflicts']);
export const DEFAULT_MODES = Object.freeze({ links: 'report', cannibal: 'report', near: 'report', owner_list: 'report', tech: 'report', conflicts: 'off' });
// The checks that never hold: the owner's list only reports what is still a stand-in.
export const NEVER_BLOCKS = Object.freeze(['owner_list']);

const modeOf = (value, fallback, where = 'site.json prelaunch') => {
  if (value === undefined || value === null) return fallback;
  if (value === false || value === 'off') return 'off';
  if (value === true || value === 'report') return 'report';
  if (value === 'block') return 'block';
  throw new Error(`${where}: "${value}" is not a mode (false, true, "report" or "block")`);
};

// { modes: { id: 'off' | 'report' | 'block' }, notes: [what was changed and why] }.
export function prelaunchModes(site = {}) {
  const given = site?.prelaunch ?? {};
  if (typeof given !== 'object' || Array.isArray(given)) throw new Error('site.json prelaunch must be an object of checks');
  const unknown = Object.keys(given).filter((key) => !CHECK_IDS.includes(key));
  if (unknown.length) throw new Error(`site.json prelaunch: unknown check(s) ${unknown.join(', ')} (known: ${CHECK_IDS.join(', ')})`);
  const modes = {};
  const notes = [];
  for (const id of CHECK_IDS) {
    modes[id] = modeOf(given[id], DEFAULT_MODES[id], `site.json prelaunch.${id}`);
    if (modes[id] === 'block' && NEVER_BLOCKS.includes(id)) { modes[id] = 'report'; notes.push(`${id}: "block" is read as "report" (owner 2026-11-18: the owner's materials list never holds a release)`); }
  }
  return { modes, notes };
}

// The publish gate's cannibalisation switch (site.json blogPublish.cannibal): "block" by default (owner 2026-11-18:
// an article whose main search is taken is not published), "report" or false.
export function blogCannibalMode(site = {}) {
  return modeOf(site?.blogPublish?.cannibal, 'block', 'site.json blogPublish.cannibal');
}
