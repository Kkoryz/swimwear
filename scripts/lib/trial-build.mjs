// The trial build (calibrate-plan.mjs, before any photo is made): every photo position the layout plan holds shows a
// grey frame where no photo fills it yet, so the built page has the plan's pictures and its density and block heights
// can be measured against the plan's estimate. Without it an empty position was dropped (a split row set as text, a
// closing band without its photo) and the quick density was off (Fable's plan 2026-11-14, Q8). Never in a release:
// there a position without a photo stays as it is today.

export const isTrialBuild = (env = process.env) => env.SITE_TRIAL === '1' && env.SITE_RELEASE !== '1';

// How close the plan's estimate is to the trial build's measure (calibrate-plan.mjs), and the built page's picture area
// to the plan's (the layout audit, density_off_plan): its height within 5%, its picture area within 3 points.
export const TRIAL_TOLERANCE = Object.freeze({ heightPct: 5, visualPts: 3 });

// The grey frame, the size of a typical photo (a frame's own ratio crops it as it would a photo); the style board
// shows its sample modules with it too.
export const GREY_FRAME = Object.freeze({
  src: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1600 1000"><rect width="1600" height="1000" fill="#c9c9c9"/><text x="800" y="515" font-family="sans-serif" font-size="44" text-anchor="middle" fill="#7a7a7a">photo</text></svg>')}`,
  alt: '',
  width: 1600,
  height: 1000,
});

// A page's photos (media-allocation.mjs: per block, null where the position shows none, { slot } where no photo fills
// it yet) with a grey frame in each unfilled position.
export const trialFramed = (lists) => lists.map((list) => list.map((media) => (media?.slot ? GREY_FRAME : media)));

// The hero's photo in a trial build: its own, else a grey frame where the hero shows a photo (shown: the plan's call).
export const trialHero = (photo, shown) => photo ?? (shown ? GREY_FRAME : null);
