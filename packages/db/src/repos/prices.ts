import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, gte, lte } from 'drizzle-orm';
import { fxRate, price, priceAudit } from '../schema';
import type { Executor } from './types';

/**
 * Market data. Prices and ECB rates are external time series that a refresh job rewrites, so
 * upserts are NOT written to `audit_log` (they are not user decisions and there is nothing to
 * undo). The source of every price is stored with it; changed prices go to `price_audit`.
 */

export type PriceRow = typeof price.$inferSelect;
export type FxRateRow = typeof fxRate.$inferSelect;
export type PriceInput = typeof price.$inferInsert;
export type FxRateInput = typeof fxRate.$inferInsert;

const assertInt = (name: string, value: number): void => {
  if (!Number.isSafeInteger(value))
    throw new Error(`${name} ${value} is not an integer (micro-units)`);
};

/**
 * Insert or replace the price of a security on a day (micro-units in the security currency).
 * A `manual` price is protected: a price from another source (a refresh) does not replace it and
 * `false` is returned. Every change of an existing price is written to `price_audit`.
 */
export function upsertPrice(db: Executor, input: PriceInput): boolean {
  assertInt('Price', input.priceMicro);
  return db.transaction((tx) => {
    const existing = tx
      .select()
      .from(price)
      .where(and(eq(price.securityId, input.securityId), eq(price.date, input.date)))
      .get();
    if (existing?.source === 'manual' && input.source !== 'manual') return false;
    tx.insert(price)
      .values(input)
      .onConflictDoUpdate({
        target: [price.securityId, price.date],
        set: { priceMicro: input.priceMicro, currency: input.currency, source: input.source },
      })
      .run();
    if (
      existing &&
      (existing.priceMicro !== input.priceMicro || existing.source !== input.source)
    ) {
      tx.insert(priceAudit)
        .values({
          id: randomUUID(),
          securityId: input.securityId,
          date: input.date,
          oldPriceMicro: existing.priceMicro,
          newPriceMicro: input.priceMicro,
          oldSource: existing.source,
          newSource: input.source,
        })
        .run();
    }
    return true;
  });
}

/** Prices of a security ascending by date, optionally from/to (inclusive). */
export function priceSeries(
  db: Executor,
  securityId: string,
  from?: string,
  to?: string,
): PriceRow[] {
  return db
    .select()
    .from(price)
    .where(
      and(
        eq(price.securityId, securityId),
        from === undefined ? undefined : gte(price.date, from),
        to === undefined ? undefined : lte(price.date, to),
      ),
    )
    .orderBy(asc(price.date))
    .all();
}

/** Newest price with `date <= date` (valuation with the last known quote), if any. */
export function latestPriceOnOrBefore(
  db: Executor,
  securityId: string,
  date: string,
): PriceRow | undefined {
  return db
    .select()
    .from(price)
    .where(and(eq(price.securityId, securityId), lte(price.date, date)))
    .orderBy(desc(price.date))
    .limit(1)
    .get();
}

/** Insert or replace the EUR rate (per one unit of `currency`, micro-units) of a day. */
export function upsertFxRate(db: Executor, input: FxRateInput): void {
  assertInt('Rate', input.rateMicro);
  const { rateMicro, source } = input;
  db.insert(fxRate)
    .values(input)
    .onConflictDoUpdate({
      target: [fxRate.date, fxRate.currency],
      set: source === undefined ? { rateMicro } : { rateMicro, source },
    })
    .run();
}

/** Newest rate of `currency` with `date <= date`, if any. */
export function fxRateOnOrBefore(
  db: Executor,
  currency: string,
  date: string,
): FxRateRow | undefined {
  return db
    .select()
    .from(fxRate)
    .where(and(eq(fxRate.currency, currency), lte(fxRate.date, date)))
    .orderBy(desc(fxRate.date))
    .limit(1)
    .get();
}
