// The navigation audit's failures (docs/research/navigation-shell-audit.json) one line each, route|viewport|issue, as
// the layout audit's are counted: a repair counts them as open problems too (an overflow only this audit found left the
// repair "0 open" with nothing to do).
export const navigationProblems = (failures = []) => failures.flatMap((failure) => [
  failure.status !== 200 && `${failure.route}||status_${failure.status}`,
  failure.h1Count !== 1 && `${failure.route}|desktop|h1_count`,
  failure.mobileH1Count !== undefined && failure.mobileH1Count !== 1 && `${failure.route}|mobile|h1_count`,
  failure.horizontalOverflow && `${failure.route}|desktop|horizontal_overflow`,
  failure.mobileHorizontalOverflow && `${failure.route}|mobile|horizontal_overflow`,
  failure.sourceOriginLinks?.length && `${failure.route}||source_origin_links`,
  failure.unresolvedLinks?.length && `${failure.route}||unresolved_links`,
].filter(Boolean));
