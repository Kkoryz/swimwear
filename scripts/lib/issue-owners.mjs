// Who clears an audit failure (Fable's 08-onward review: the run knew only "the site's stylesheet" and "a rule of the
// template", so copy problems sent people to change the template). site-css: the site-CSS repair agent fixes it;
// site-factory: the copy or the plan is where it is fixed, 08 does not rewrite copy (it goes to scripts/sf-report.mjs);
// template: a template rule has a gap; plan: the layout plan's (lib/layout-plan.mjs, the plan gate lib/plan-assertions.mjs):
// the planner's parameters or an owner's waiver, planned again in seconds, never the repair agent's; owner: the site's
// owner, with their real details or files.

export const AUDIT_OWNERS = Object.freeze({
  // heading_scale_inverted: a section heading the site's stylesheet set larger than its page's title (the hotel site's
  // design repair set the article headings to 2.5rem over 28px post titles); it is mended there, not a template gap.
  // text_edge_offset: a heading a few pixels off its text's edge is the site's paddings (site13 2026-11-17: the site's
  // FAQ rules, written before the open list, set the answer's sides to 0 and left the question's). Text set centred over
  // many lines, a heading centred over flush text, a page's own phone gutter and a page title over its lines in a copy
  // column the site's rules keep narrow are the site's stylesheet too (site14 2026-11-17: Staylumen's rules, after its
  // Duda competitor, centred every overview and held the hero's copy to 677px). A photo cut to under half of itself by
  // a frame the site's rules stretch (site13 2026-11-17: its form photo held to the height of a longer form, 41%).
  'site-css': ['heavy_crop', 'centred_running_text', 'mixed_text_alignment', 'gutter_mismatch', 'h1_lines', 'text_edge_offset','low_contrast', 'heavy_overlay', 'off_palette_color', 'horizontal_overflow', 'sideways_scroll', 'text_overlap', 'long_measure', 'boundary_gap', 'missing_boundary_gap_token', 'tap_target', 'heading_off_axis', 'misaligned_row', 'split_edges', 'action_detached', 'template_rule_overridden', 'heading_scale_inverted'],
  // Copy the template has no place for, a link to a page the plan does not build; and what the SEO audit and the early
  // data checks find in the copy (four-site audit 2026-11-17): descriptions from one skeleton, a trust figure that does
  // not read, a promised file with no way to get it, a page few others link to, a page much thinner than its kind, a
  // product name that no longer exists, a way to talk the copy offers with no number or link for it (C6).
  'site-factory': ['unplaced_copy', 'unresolved_internal_link', 'description_templated', 'trust_value_malformed', 'promise_without_asset', 'inbound_links_low', 'thin_vs_siblings', 'stand_in_lexicon', 'privacy_contradiction', 'channel_without_handle'],
  // The owner's own facts: the phone or address the pages show is not the one the structured data states.
  owner: ['nap_mismatch'],
  // A page outside its density band: what the plan put on it (photo walls, variants), or a page the plan found does not
  // fit (Site Factory's report says so).
  plan: ['density_text_heavy', 'density_too_few_images', 'density_too_many_images', 'density_long_text_run'],
});

export const OWNER_NAMES = Object.freeze({ 'site-css': "the site's stylesheet (the repair agent)", 'site-factory': "Site Factory's copy or plan (08 does not rewrite copy; docs/research/sf-report.md)", template: 'a rule of the template', owner: "the site's owner (their real details or files; docs/research/launch-checklist.md)", plan: "the layout plan (its parameters or an owner's waiver; docs/research/layout-plan.md)" });

export const ownerOf = (issue) => Object.entries(AUDIT_OWNERS).find(([, issues]) => issues.includes(issue))?.[0] ?? 'template';

// Problems grouped by owner: { owner: [issue] } in a line each ("3 failure(s) of <owner> (issue, issue)").
export function byOwner(issues) {
  const groups = new Map();
  for (const issue of issues) groups.set(ownerOf(issue), [...(groups.get(ownerOf(issue)) ?? []), issue]);
  return [...groups].map(([owner, list]) => `${list.length} failure(s) for ${OWNER_NAMES[owner]} (${[...new Set(list)].join(', ')})`);
}

// The launch checklist's three groups (lib/launch-checklist.mjs WHO): the owner, Site Factory, or this template's pipeline.
export const checklistGroupOf = (issue) => ({ owner: 'owner', 'site-factory': 'site-factory' })[ownerOf(issue)] ?? 'template';
