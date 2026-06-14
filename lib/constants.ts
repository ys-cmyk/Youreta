// How often a participant who is sharing their location posts a ping.
export const PING_INTERVAL_MS = 15_000;

// A ping older than this is considered stale and de-emphasised in the UI.
export const STALE_PING_MS = 90_000;

// Default geofence radius (meters) pre-filled in the create-event form.
export const DEFAULT_RADIUS_M = 150;

// Bounds for the geofence radius, mirrored by the DB check constraint.
export const MIN_RADIUS_M = 10;
export const MAX_RADIUS_M = 5000;
