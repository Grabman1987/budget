import { randomUUID } from 'node:crypto';
import { desc, eq, inArray } from 'drizzle-orm';
import { marketAttempt } from '../schema';
import type { Executor } from './types';

/** Attempts kept per security; older ones are removed when a new one is written. */
export const MARKET_ATTEMPTS_KEPT = 30;

export type MarketAttemptRow = typeof marketAttempt.$inferSelect;
export type MarketAttemptInput = Omit<typeof marketAttempt.$inferInsert, 'id'>;

/**
 * Append one price-source attempt (history for the cause view; not user data, so no audit entry)
 * and keep only the newest `MARKET_ATTEMPTS_KEPT` of the security. `detail` must be a fixed short
 * text, never a URL or response part.
 */
export function recordMarketAttempt(db: Executor, input: MarketAttemptInput): void {
  db.insert(marketAttempt)
    .values({ ...input, id: randomUUID(), detail: input.detail?.slice(0, 120) ?? null })
    .run();
  const stale = db
    .select({ id: marketAttempt.id })
    .from(marketAttempt)
    .where(eq(marketAttempt.securityId, input.securityId))
    .orderBy(desc(marketAttempt.attemptedAt), desc(marketAttempt.id))
    .limit(1000)
    .offset(MARKET_ATTEMPTS_KEPT)
    .all()
    .map((r) => r.id);
  if (stale.length > 0) db.delete(marketAttempt).where(inArray(marketAttempt.id, stale)).run();
}

/** Newest attempts of a security first. */
export function marketAttempts(db: Executor, securityId: string, limit = 10): MarketAttemptRow[] {
  return db
    .select()
    .from(marketAttempt)
    .where(eq(marketAttempt.securityId, securityId))
    .orderBy(desc(marketAttempt.attemptedAt), desc(marketAttempt.id))
    .limit(limit)
    .all();
}
