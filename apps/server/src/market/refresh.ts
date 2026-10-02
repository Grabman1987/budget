import {
  cpiFetchedAt,
  firstTradeDate,
  foreignCurrencies,
  lastFxDay,
  lastQuotedDay,
  openStaleValueItem,
  resolveStaleValueItems,
  schema,
  storeCpi,
  trackedSecurities,
  upsertFxRate,
  upsertPrice,
  type Db,
  type SecurityRow,
} from '@budget/db';
import { and, eq } from 'drizzle-orm';
import { addDays } from '@budget/domain';
import { randomUUID } from 'node:crypto';
import {
  errorKind,
  isWeekday,
  MarketError,
  type MarketErrorKind,
  type MarketSources,
  type QuoteSource,
  type QuoteSourceId,
  type SecurityRef,
} from '@budget/market';

/**
 * A security's first refresh fetches this many days back from the source; older history comes
 * from the Portfolio Performance import.
 */
export const BACKFILL_DAYS = 30;
/** ECB history starts here (first published day of the euro reference rates). */
export const FX_HISTORY_START = '1999-01-04';
/** One ECB request covers at most this many days (three years). */
export const FX_CHUNK_DAYS = 3 * 365;
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
  bySource: Record<QuoteSourceId, { securities: number; rows: number }>;
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
    quoteUrl: row.quoteUrl,
    coingeckoId: row.coingeckoId,
    kind: row.kind,
    currency: row.currency,
    adjusted: row.quoteAdjusted,
  };
}

/** Sources in the order they are tried: primary, the more specific ones, the last resort. */
const quoteChain = (sources: MarketSources): QuoteSource[] => [
  sources.quotes,
  ...(sources.moreQuotes ?? []),
  ...(sources.fallbackQuotes ? [sources.fallbackQuotes] : []),
];

/**
 * Bring the prices of every tracked security up to `today`.
 *
 * - Window: the day after the newest stored network price up to today. A security without one is
 *   backfilled `BACKFILL_DAYS` (30) days back.
 * - Sources: in chain order (Ariva, crypto feeds, Yahoo); a source that lacks the security's
 *   identifier is skipped, the next one is tried when one fails or answers with nothing.
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
    bySource: {
      yfinance: { securities: 0, rows: 0 },
      ariva: { securities: 0, rows: 0 },
      cryptocalc: { securities: 0, rows: 0 },
      coingecko: { securities: 0, rows: 0 },
    },
    protectedManual: 0,
    failed: [],
  };
  for (const row of trackedSecurities(db)) {
    result.tracked++;
    const last = lastQuotedDay(db, row.id);
    const from = last ? addDays(last, 1) : addDays(today, -BACKFILL_DAYS);
    if (from > today) {
      result.upToDate++;
      continue;
    }
    const ref = refOf(row);
    const attempts = quoteChain(sources).filter((source) => source.supports?.(ref) ?? true);
    // No source knows how to look this security up: surfaced like any other failure.
    const errors: MarketErrorKind[] = attempts.length === 0 ? ['not_configured'] : [];
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
            const existing = tx
              .select({ securityId: schema.price.securityId })
              .from(schema.price)
              .where(and(eq(schema.price.securityId, row.id), eq(schema.price.date, q.date)))
              .get();
            const stored = upsertPrice(tx, {
              securityId: row.id,
              date: q.date,
              priceMicro: q.priceMicro,
              currency: row.currency,
              source: source.id,
            });
            if (stored) {
              rows++;
              if (!existing) {
                tx.insert(schema.priceAudit)
                  .values({
                    id: randomUUID(),
                    securityId: row.id,
                    date: q.date,
                    oldPriceMicro: null,
                    newPriceMicro: q.priceMicro,
                    oldSource: null,
                    newSource: source.id,
                  })
                  .run();
              }
            } else result.protectedManual++;
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
      // The ECB portal is slow for long ranges (a year of history takes seconds): fetch in chunks
      // and store each one, so a failure half way keeps what arrived and the next run resumes.
      let rows = 0;
      for (let start = from; start <= today; start = addDays(start, FX_CHUNK_DAYS)) {
        const end = addDays(start, FX_CHUNK_DAYS - 1);
        const rates = await sources.fx.history(currency, start, end < today ? end : today);
        db.transaction((tx) => {
          for (const r of rates)
            upsertFxRate(tx, { date: r.date, currency, rateMicro: r.rateMicro, source: 'ecb' });
        });
        rows += rates.length;
      }
      if (rows === 0) {
        if (last === undefined || isGapStale(from, today)) throw new MarketError('empty');
        continue;
      }
      result.bySource.ecb.currencies++;
      result.bySource.ecb.rows += rows;
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

/** The consumer price series is read again only when the stored one is older than this. */
export const CPI_MAX_AGE_DAYS = 30;

export interface CpiRefreshResult {
  /** The stored series is younger than a month (or the run has no consumer price source). */
  skipped: boolean;
  rows: number;
  failed: MarketErrorKind | null;
}

/**
 * Read the monthly consumer price index (Statistik Austria open data) when the stored series is
 * older than a month or missing, once per run. Idempotent; a failure only logs its error class,
 * the report then keeps showing the last stored series and says how old it is.
 */
export async function refreshCpi(
  db: Db,
  sources: MarketSources,
  { today, log = () => undefined, now = new Date() }: RefreshOptions & { now?: Date },
): Promise<CpiRefreshResult> {
  const source = sources.cpi;
  if (!source) return { skipped: true, rows: 0, failed: null };
  const last = cpiFetchedAt(db, source.series);
  if (last !== null && last.slice(0, 10) > addDays(today, -CPI_MAX_AGE_DAYS))
    return { skipped: true, rows: 0, failed: null };
  try {
    const rows = await source.monthly();
    const written = db.transaction((tx) => storeCpi(tx, source.series, rows, now.toISOString()));
    return { skipped: false, rows: written, failed: null };
  } catch (error) {
    const kind = errorKind(error);
    log(`cpi: ${source.series} failed (${kind})`);
    return { skipped: false, rows: 0, failed: kind };
  }
}
