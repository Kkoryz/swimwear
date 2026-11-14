// Who clears an audit failure (Fable's 08-onward review: the run knew only "the site's stylesheet" and "a rule of the
// template", so copy problems sent people to change the template). site-css: the site-CSS repair agent fixes it;
// site-factory: the copy or the plan is where it is fixed, 08 does not rewrite copy (it goes to scripts/sf-report.mjs);
// template: a template rule has a gap; plan: the layout plan's (lib/layout-plan.mjs, the plan gate lib/plan-assertions.mjs):
// the planner's parameters or an owner's waiver, planned again in seconds, never the repair agent's.

export const AUDIT_OWNERS = Object.freeze({
  // heading_scale_inverted: a section heading the site's stylesheet set larger than its page's title (the hotel site's
  // design repair set the article headings to 2.5rem over 28px post titles); it is mended there, not a template gap.
  'site-css': ['low_contrast', 'heavy_overlay', 'off_palette_color', 'horizontal_overflow', 'sideways_scroll', 'text_overlap', 'long_measure', 'boundary_gap', 'missing_boundary_gap_token', 'tap_target', 'heading_off_axis', 'misaligned_row', 'split_edges', 'action_detached', 'template_rule_overridden', 'heading_scale_inverted'],
  // Copy the template has no place for, a link to a page the plan does not build.
  'site-factory': ['unplaced_copy', 'unresolved_internal_link'],
  // A page outside its density band: what the plan put on it (photo walls, variants), or a page the plan found does not
  // fit (Site Factory's report says so).
  plan: ['density_text_heavy', 'density_too_few_images', 'density_too_many_images', 'density_long_text_run'],
});

export const OWNER_NAMES = Object.freeze({ 'site-css': "the site's stylesheet (the repair agent)", 'site-factory': "Site Factory's copy or plan (08 does not rewrite copy; docs/research/sf-report.md)", template: 'a rule of the template', plan: "the layout plan (its parameters or an owner's waiver; docs/research/layout-plan.md)" });

export const ownerOf = (issue) => Object.entries(AUDIT_OWNERS).find(([, issues]) => issues.includes(issue))?.[0] ?? 'template';

// Problems grouped by owner: { owner: [issue] } in a line each ("3 failure(s) of <owner> (issue, issue)").
export function byOwner(issues) {
  const groups = new Map();
  for (const issue of issues) groups.set(ownerOf(issue), [...(groups.get(ownerOf(issue)) ?? []), issue]);
  return [...groups].map(([owner, list]) => `${list.length} failure(s) for ${OWNER_NAMES[owner]} (${[...new Set(list)].join(', ')})`);
}
