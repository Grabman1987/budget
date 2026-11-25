/**
 * Heavy read models (Heute, Plan, accounts, liquidity, balance series) are recomputed by the server
 * in seconds. They stay fresh for a few minutes; every write marks them stale again through the
 * targeted invalidation in `invalidation.ts`, so a change never waits for the stale time.
 */
export const HEAVY_READ_STALE_MS = 180_000;
