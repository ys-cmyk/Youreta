// How often a participant who is sharing their location posts a ping.
export const PING_INTERVAL_MS = 15_000;

// A ping older than this is considered stale and de-emphasised in the UI.
export const STALE_PING_MS = 90_000;

// Within this distance of the destination, a participant counts as "Arrived".
export const ARRIVAL_RADIUS_M = 75;
