// The thresholds the template's rules hold to, with the sites each was measured on (config/thresholds.json; its test
// checks every value against the code). A threshold measured on fewer than two sites is for review on a new site
// (Fable's 11-14 plan, item 8: a value measured on one site carried to another unseen).

import registry from '../../config/thresholds.json' with { type: 'json' };

export const THRESHOLDS = Object.freeze(registry.thresholds);

// The measured thresholds with fewer than two sites on record (a safety stop, measured: false, is not one).
export const thresholdsToReview = () => THRESHOLDS.filter((entry) => entry.measured !== false && (entry.sites ?? []).length < 2);
