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
  like,
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
import { nowIso, updateTracked, withGroup, type AuditContext } from './audit';
import type { FxRateRow } from './prices';
import { runInTransaction, type Executor } from './types';

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
 * Newest day with a price that came from a network source (Ariva, Yahoo, CoinGecko). Manual and imported
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
  // Instruments the owner converts with the ECB rate need the rates of the source currency too.
  add(
    db
      .selectDistinct({ currency: security.quoteFxCurrency })
      .from(security)
      .where(and(isNull(security.deletedAt), isNotNull(security.quoteFxCurrency)))
      .all() as Array<{ currency: string }>,
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

/** Detail prefix of a warning opened by a failed fetch; only these may close by themselves. */
export const FETCH_FAILURE_DETAIL = 'Fehlerklasse: ';
/** Resolution prefix of a warning the market run closed after a successful fetch. */
export const AUTO_RESOLVED_PREFIX = 'Automatisch geschlossen: ';
/** Audit actor of the market run's inbox writes. */
export const MARKET_ACTOR = 'market-refresh';
/** The entry history under Konten › Prüfen reaches this far back and holds at most this many. */
export const AUTO_RESOLVED_HISTORY_DAYS = 30;
export const AUTO_RESOLVED_HISTORY_LIMIT = 20;

/**
 * Close the open fetch-failure warnings of a subject after a successful fetch (#1101). `reason`
 * names the fetch that succeeded and is stored in the entry behind `AUTO_RESOLVED_PREFIX`.
 * Only items whose detail is an error class are touched: a `stale_value` item about a real
 * difference (holdings, missing movements, conflicting closes) is never closed here. Each close
 * is audited and undoable; all closes of one call share an undo group.
 * A supplied context joins an explicit setting change and stores its exact reason instead.
 */
export function resolveStaleValueItems(
  db: Executor,
  refType: 'security' | 'fx',
  refId: string,
  reason: string,
  context?: AuditContext,
): number {
  return runInTransaction(db, (tx) => {
    const open = tx
      .select({ id: inboxItem.id })
      .from(inboxItem)
      .where(
        and(
          eq(inboxItem.kind, 'stale_value'),
          eq(inboxItem.refType, refType),
          eq(inboxItem.refId, refId),
          like(inboxItem.detail, `${FETCH_FAILURE_DETAIL}%`),
          isNull(inboxItem.resolvedAt),
        ),
      )
      .all();
    if (open.length === 0) return 0;
    const ctx = withGroup(context ?? { actor: MARKET_ACTOR });
    const patch = {
      resolvedAt: nowIso(),
      resolution: context ? reason : `${AUTO_RESOLVED_PREFIX}${reason}`,
    };
    for (const { id } of open) updateTracked(tx, inboxItem, [id], patch, ctx);
    return open.length;
  });
}

export interface AutoResolvedWarning {
  id: string;
  title: string;
  detail: string | null;
  refType: string | null;
  refId: string | null;
  createdAt: string;
  resolvedAt: string;
  resolution: string;
}

/** Warnings the market run closed by itself since `since` (ISO day or timestamp), newest first. */
export function autoResolvedWarnings(db: Executor, since: string): AutoResolvedWarning[] {
  return db
    .select({
      id: inboxItem.id,
      title: inboxItem.title,
      detail: inboxItem.detail,
      refType: inboxItem.refType,
      refId: inboxItem.refId,
      createdAt: inboxItem.createdAt,
      resolvedAt: inboxItem.resolvedAt,
      resolution: inboxItem.resolution,
    })
    .from(inboxItem)
    .where(
      and(
        eq(inboxItem.kind, 'stale_value'),
        gte(inboxItem.resolvedAt, since),
        like(inboxItem.resolution, `${AUTO_RESOLVED_PREFIX}%`),
      ),
    )
    .orderBy(desc(inboxItem.resolvedAt), asc(inboxItem.id))
    .limit(AUTO_RESOLVED_HISTORY_LIMIT)
    .all() as AutoResolvedWarning[];
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
