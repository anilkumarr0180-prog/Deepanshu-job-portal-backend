export const LOCATION_PRIVACY_LEVELS = {
  NONE: "NONE",
  APPROXIMATE: "APPROXIMATE",
  PRECISE: "PRECISE",
} as const;

export type LocationPrivacyLevel =
  (typeof LOCATION_PRIVACY_LEVELS)[keyof typeof LOCATION_PRIVACY_LEVELS];

export const LOCATION_STATUS = {
  LIVE: "LIVE",
  RECENT: "RECENT",
  STALE: "STALE",
  OFFLINE: "OFFLINE",
} as const;

export type LocationStatus =
  (typeof LOCATION_STATUS)[keyof typeof LOCATION_STATUS];

/** Throttling & Stale Threshold Configurations */
export const LOCATION_CONFIG = {
  LIVE_THRESHOLD_MS: 15 * 1000,       // <= 15s = LIVE
  RECENT_THRESHOLD_MS: 2 * 60 * 1000, // <= 2 mins = RECENT
  STALE_THRESHOLD_MS: 15 * 60 * 1000, // <= 15 mins = STALE
  THROTTLE_INTERVAL_MS: 4000,         // Minimum 4 seconds between socket location updates
  MIN_DISTANCE_MOVED_METERS: 5,       // Minimum 5 meters movement to trigger broadcast
};
