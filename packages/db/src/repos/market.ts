import { randomUUID } from 'node:crypto';
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  max,
  min,
  or,
} from 'drizzle-orm';
import {
  account,
  expectedPaymentVersion,
  fxRate,
  inboxItem,
  marketRun,
  price,
  security,
  trade,
} from '../schema';
import type { FxRateRow } from './prices';
import type { Executor } from './types';

/**
 * Reads and inbox writes of the market-data jobs (prices and ECB rates). The refresh logic itself
 * lives in the server (`apps/server/src/market`); this file only holds the queries it needs.
 */

export type SecurityRow = typeof security.$inferSelect;

/** Price sources that are fetched from the network (the rest is manual or imported). */
export const NETWORK_PRICE_SOURCES = ['yfinance', 'ariva', 'cryptocalc', 'coingecko'] as const;

/** Securities the daily refresh looks after: switched on and with any quote identifier. */
export function trackedSecurities(db: Executor): SecurityRow[] {
  return db
    .select()
    .from(security)
    .where(
      and(
        isNull(security.deletedAt),
        eq(security.pricesEnabled, true),
        or(
          isNotNull(security.symbol),
          isNotNull(security.quoteUrl),
          isNotNull(security.coingeckoId),
          isNotNull(security.fallbackQuoteId),
        ),
      ),
    )
    .orderBy(asc(security.name), asc(security.id))
    .all();
}

/** Date of the first trade of a security, if it has any. */
export function firstTradeDate(db: Executor, securityId: string): string | undefined {
  return (
    db
      .select({ date: min(trade.date) })
      .from(trade)
      .where(eq(trade.securityId, securityId))
      .get()?.date ?? undefined
  );
}

/**
 * Newest day with a price that came from a network source (Ariva, Yahoo, crypto feeds). Manual and imported
 * prices do not count: a manual price far in the future must not stop the refresh from filling
 * the days before it.
 */
export function lastQuotedDay(db: Executor, securityId: string): string | undefined {
  return (
    db
      .select({ date: max(price.date) })
      .from(price)
      .where(and(eq(price.securityId, securityId), inArray(price.source, NETWORK_PRICE_SOURCES)))
      .get()?.date ?? undefined
  );
}

/** Newest day with a stored rate of `currency`, if any. */
export function lastFxDay(db: Executor, currency: string): string | undefined {
  return (
    db
      .select({ date: max(fxRate.date) })
      .from(fxRate)
      .where(eq(fxRate.currency, currency))
      .get()?.date ?? undefined
  );
}

/** Rates of a currency ascending by date, optionally from/to (inclusive). */
export function fxSeries(db: Executor, currency: string, from?: string, to?: string): FxRateRow[] {
  return db
    .select()
    .from(fxRate)
    .where(
      and(
        eq(fxRate.currency, currency),
        from === undefined ? undefined : gte(fxRate.date, from),
        to === undefined ? undefined : lte(fxRate.date, to),
      ),
    )
    .orderBy(asc(fxRate.date))
    .all();
}

/**
 * Foreign currencies in use, sorted: those of the accounts, of the securities and of the expected
 * payment versions. EUR is the base and never listed.
 */
export function foreignCurrencies(db: Executor): string[] {
  const found = new Set<string>();
  const add = (rows: Array<{ currency: string }>) => {
    for (const { currency } of rows) if (/^[A-Z]{3}$/.test(currency)) found.add(currency);
  };
  add(
    db
      .selectDistinct({ currency: account.currency })
      .from(account)
      .where(isNull(account.deletedAt))
      .all(),
  );
  add(
    db
      .selectDistinct({ currency: security.currency })
      .from(security)
      .where(isNull(security.deletedAt))
      .all(),
  );
  add(
    db
      .selectDistinct({ currency: expectedPaymentVersion.currency })
      .from(expectedPaymentVersion)
      .where(isNull(expectedPaymentVersion.deletedAt))
      .all(),
  );
  found.delete('EUR');
  return [...found].sort();
}

export interface MarketInboxItem {
  title: string;
  /** Stable text per error class: the same failure does not open a second item. */
  detail: string;
  refType: 'security' | 'fx';
  refId: string;
}

/**
 * Open a `stale_value` inbox item unless an open one for the same subject and error class exists.
 * Returns whether a new item was written.
 */
export function openStaleValueItem(db: Executor, item: MarketInboxItem): boolean {
  const existing = db
    .select({ id: inboxItem.id })
    .from(inboxItem)
    .where(
      and(
        eq(inboxItem.kind, 'stale_value'),
        eq(inboxItem.refType, item.refType),
        eq(inboxItem.refId, item.refId),
        eq(inboxItem.detail, item.detail),
        isNull(inboxItem.resolvedAt),
      ),
    )
    .get();
  if (existing) return false;
  db.insert(inboxItem)
    .values({ id: randomUUID(), kind: 'stale_value', ...item, urgent: false })
    .run();
  return true;
}

/** Close the open `stale_value` items of a subject (the data is flowing again). */
export function resolveStaleValueItems(
  db: Executor,
  refType: 'security' | 'fx',
  refId: string,
  resolution: string,
): number {
  return db
    .update(inboxItem)
    .set({ resolvedAt: new Date().toISOString(), resolution })
    .where(
      and(
        eq(inboxItem.kind, 'stale_value'),
        eq(inboxItem.refType, refType),
        eq(inboxItem.refId, refId),
        isNull(inboxItem.resolvedAt),
      ),
    )
    .run().changes;
}

export type MarketRunRow = typeof marketRun.$inferSelect;
export type MarketRunInput = Omit<MarketRunRow, 'id'>;

/** Write one line of the run log (counts and error classes only). */
export function recordMarketRun(db: Executor, run: MarketRunInput): MarketRunRow {
  const row = { id: randomUUID(), ...run };
  db.insert(marketRun).values(row).run();
  return row;
}

/** The newest run of any status, if any. */
export function lastMarketRun(db: Executor): MarketRunRow | undefined {
  return db.select().from(marketRun).orderBy(desc(marketRun.finishedAt)).limit(1).get();
}

/** The newest run that refreshed something (`ok` or `partial`): the "Stand" of the prices. */
export function lastSuccessfulMarketRun(db: Executor): MarketRunRow | undefined {
  return db
    .select()
    .from(marketRun)
    .where(inArray(marketRun.status, ['ok', 'partial']))
    .orderBy(desc(marketRun.finishedAt))
    .limit(1)
    .get();
}

/** Runs that finished at or after `since` (ISO UTC), newest first. */
export function marketRunsSince(db: Executor, since: string): MarketRunRow[] {
  return db
    .select()
    .from(marketRun)
    .where(gte(marketRun.finishedAt, since))
    .orderBy(desc(marketRun.finishedAt))
    .all();
}
