// A block a blueprint slot places carries the slot in its id, so the page can be laid out in the blueprint's order:
// "owner-<slot>" for the owner's proof (lib/site-proof.mjs), "plan-<slot>" for cards built from the site plan.
const PREFIX = Object.freeze({ owner: 'owner-', plan: 'plan-' });

export const slotBlockId = (fill, slotId) => `${PREFIX[fill]}${slotId}`;

// The slot a block id names, or null.
export function slotOfBlockId(id) {
  const prefix = Object.values(PREFIX).find((item) => id.startsWith(item));
  return prefix ? id.slice(prefix.length) : null;
}
