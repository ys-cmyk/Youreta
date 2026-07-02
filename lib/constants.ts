// How often a participant who is sharing their location posts a ping.
export const PING_INTERVAL_MS = 15_000;

// A ping older than this is considered stale and de-emphasised in the UI.
export const STALE_PING_MS = 90_000;

// Within this distance of the destination, a participant counts as "Arrived".
export const ARRIVAL_RADIUS_M = 75;

// Automatic live ETA (from a sharer's current location to the destination).
// Recompute at most this often, and skip recomputes unless the user has moved
// at least this far since the last one — keeps calls to /api/eta throttled.
export const ETA_AUTO_RECOMPUTE_MS = 60_000;
export const ETA_AUTO_MIN_MOVE_M = 120;
