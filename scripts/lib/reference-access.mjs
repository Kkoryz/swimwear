// The answers of a reference site that refuses this machine rather than lacking the page (site12's hhmhotels.com,
// 2026-11-17: 403 to every client, a browser's included, days after it was measured). A step that measures the live
// reference (patterns, density) keeps the measure an earlier run took of the same address on one of these, reported
// as stale, instead of stopping a run that changed nothing of the reference; one never measured still stops it.
export const BLOCKED_STATUSES = Object.freeze([401, 403, 429, 503]);
