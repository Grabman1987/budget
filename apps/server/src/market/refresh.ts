import {
  firstTradeDate,
  foreignCurrencies,
  lastFxDay,
  lastQuotedDay,
  openStaleValueItem,
  resolveStaleValueItems,
  trackedSecurities,
  upsertFxRate,
  upsertPrice,
  type Db,
  type SecurityRow,
} from '@budget/db';
import { addDays } from '@budget/domain';
import {
  errorKind,
  isWeekday,
  MarketError,
  type MarketErrorKind,
  type MarketSources,
  type QuoteSource,
  type SecurityRef,
} from '@budget/market';

/** The first day of the app's ledger; a backfill starts a week before it or the first trade. */
export const BACKFILL_FLOOR = '2023-10-01';
/** ECB history starts here (first published day of the euro reference rates). */
export const FX_HISTORY_START = '1999-01-04';
/**
 * An empty answer from every source is "no news" (a weekend, a holiday) for a short gap, and a
 * failure only once this many weekdays passed without a single quote.
 */
export const STALE_AFTER_WEEKDAYS = 5;

export interface RefreshOptions {
  /** Today in Vienna (`todayInVienna()`); tests pass a fixed day. */
  today: string;
  /** Only ever gets error classes and counts, never URLs or response bodies. */
  log?: (message: string) => void;
}

export interface PriceRefreshResult {
  /** Securities looked at (tracked). */
  tracked: number;
  /** Already current, nothing to fetch. */
  upToDate: number;
  /** Securities and rows written per source. */
  bySource: Record<'yfinance' | 'ariva', { securities: number; rows: number }>;
  /** Rows a refresh did not write because a manual price owns the day. */
  protectedManual: number;
  /** Securities for which every source failed (an inbox item is open for each). */
  failed: Array<{ securityId: string; errors: MarketErrorKind[] }>;
}

export interface FxRefreshResult {
  currencies: number;
  upToDate: number;
  bySource: { ecb: { currencies: number; rows: number } };
  failed: Array<{ currency: string; errors: MarketErrorKind[] }>;
}

/** Whether `from`..`today` holds at least `STALE_AFTER_WEEKDAYS` weekdays. */
const isGapStale = (from: string, today: string): boolean => {
  let n = 0;
  for (let d = from; d <= today && n < STALE_AFTER_WEEKDAYS; d = addDays(d, 1))
    if (isWeekday(d)) n++;
  return n >= STALE_AFTER_WEEKDAYS;
};

function refOf(row: SecurityRow): SecurityRef {
  return {
    id: row.id,
    symbol: row.symbol,
    fallbackQuoteId: row.fallbackQuoteId,
    quoteExchange: row.quoteExchange,
    currency: row.currency,
    adjusted: row.quoteAdjusted,
  };
}

/**
 * Bring the prices of every tracked security up to `today`.
 *
 * - Window: the day after the newest stored network price up to today. A security without one is
 *   backfilled from min(first trade, 2023-10-01) minus 7 days.
 * - Sources: primary first; the fallback when the primary fails or answers with nothing.
 * - Writes go through `upsertPrice`: the source is stored, a manual price is never overwritten,
 *   changes are audited. Running it twice writes nothing new.
 * - When every source fails, one open `stale_value` inbox item per security and error class
 *   (no second one while it is open); the item closes when prices flow again.
 */
export async function refreshPrices(
  db: Db,
  sources: MarketSources,
  { today, log = () => undefined }: RefreshOptions,
): Promise<PriceRefreshResult> {
  const result: PriceRefreshResult = {
    tracked: 0,
    upToDate: 0,
    bySource: { yfinance: { securities: 0, rows: 0 }, ariva: { securities: 0, rows: 0 } },
    protectedManual: 0,
    failed: [],
  };
  for (const row of trackedSecurities(db)) {
    result.tracked++;
    const last = lastQuotedDay(db, row.id);
    const floor = firstTradeDate(db, row.id);
    const from = last
      ? addDays(last, 1)
      : addDays(floor !== undefined && floor < BACKFILL_FLOOR ? floor : BACKFILL_FLOOR, -7);
    if (from > today) {
      result.upToDate++;
      continue;
    }
    const ref = refOf(row);
    const attempts: QuoteSource[] = [sources.quotes];
    if (sources.fallbackQuotes) attempts.push(sources.fallbackQuotes);
    const errors: MarketErrorKind[] = [];
    let written = false;
    let gotNothing = false;
    for (const source of attempts) {
      try {
        const quotes = await source.history(ref, from, today);
        if (quotes.length === 0) {
          gotNothing = true;
          continue;
        }
        let rows = 0;
        db.transaction((tx) => {
          for (const q of quotes) {
            const stored = upsertPrice(tx, {
              securityId: row.id,
              date: q.date,
              priceMicro: q.priceMicro,
              currency: row.currency,
              source: source.id,
            });
            if (stored) rows++;
            else result.protectedManual++;
          }
        });
        result.bySource[source.id].securities++;
        result.bySource[source.id].rows += rows;
        written = true;
        break;
      } catch (error) {
        const kind = errorKind(error);
        errors.push(kind);
        log(`prices: ${source.id} failed for a security (${kind})`);
      }
    }
    if (written) {
      resolveStaleValueItems(db, 'security', row.id, 'Kurse werden wieder abgerufen.');
    } else if (
      errors.length > 0 ||
      (gotNothing && (last === undefined || isGapStale(from, today)))
    ) {
      const classes = errors.length > 0 ? [...new Set(errors)] : (['empty'] as MarketErrorKind[]);
      for (const kind of classes)
        openStaleValueItem(db, {
          title: `Kurse nicht abrufbar: ${row.name}`,
          detail: `Fehlerklasse: ${kind}`,
          refType: 'security',
          refId: row.id,
        });
      result.failed.push({ securityId: row.id, errors: classes });
    }
  }
  return result;
}

/**
 * Bring the ECB rates of every foreign currency in use (accounts, securities, expected payment
 * versions) up to `today`: the full history on the first run, then the days since the newest
 * stored rate. Idempotent; a failure opens one `stale_value` item per currency and error class.
 */
export async function refreshFx(
  db: Db,
  sources: MarketSources,
  { today, log = () => undefined }: RefreshOptions,
): Promise<FxRefreshResult> {
  const result: FxRefreshResult = {
    currencies: 0,
    upToDate: 0,
    bySource: { ecb: { currencies: 0, rows: 0 } },
    failed: [],
  };
  for (const currency of foreignCurrencies(db)) {
    result.currencies++;
    const last = lastFxDay(db, currency);
    const from = last ? addDays(last, 1) : FX_HISTORY_START;
    if (from > today) {
      result.upToDate++;
      continue;
    }
    try {
      const rates = await sources.fx.history(currency, from, today);
      if (rates.length === 0) {
        if (last === undefined || isGapStale(from, today)) throw new MarketError('empty');
        continue;
      }
      db.transaction((tx) => {
        for (const r of rates)
          upsertFxRate(tx, { date: r.date, currency, rateMicro: r.rateMicro, source: 'ecb' });
      });
      result.bySource.ecb.currencies++;
      result.bySource.ecb.rows += rates.length;
      resolveStaleValueItems(db, 'fx', currency, 'Wechselkurse werden wieder abgerufen.');
    } catch (error) {
      const kind = errorKind(error);
      log(`fx: ecb failed for a currency (${kind})`);
      openStaleValueItem(db, {
        title: `Wechselkurs nicht abrufbar: ${currency}`,
        detail: `Fehlerklasse: ${kind}`,
        refType: 'fx',
        refId: currency,
      });
      result.failed.push({ currency, errors: [kind] });
    }
  }
  return result;
}
