import { desc, eq, max, sql } from 'drizzle-orm';
import { consumerPriceIndex } from '../schema';
import type { Executor } from './types';

/**
 * Consumer price index of the comparison in report 2.4. The rows are public statistics (index
 * numbers, micro-units), written by the market refresh; nothing here is user data.
 */

export interface CpiRow {
  month: string;
  indexMicro: number;
}

/** Replace the stored months of a series with `rows`; returns the number written. Idempotent. */
export function storeCpi(
  db: Executor,
  series: string,
  rows: ReadonlyArray<CpiRow>,
  fetchedAt: string,
  source = 'statistik_austria',
): number {
  const CHUNK = 150;
  for (let i = 0; i < rows.length; i += CHUNK)
    db.insert(consumerPriceIndex)
      .values(rows.slice(i, i + CHUNK).map((r) => ({ series, ...r, source, fetchedAt })))
      .onConflictDoUpdate({
        target: [consumerPriceIndex.series, consumerPriceIndex.month],
        set: {
          indexMicro: sqlExcluded('index_micro'),
          source: sqlExcluded('source'),
          fetchedAt: sqlExcluded('fetched_at'),
        },
      })
      .run();
  return rows.length;
}

const sqlExcluded = (column: string) => sql.raw(`excluded.${column}`);

/** When the series was last read from its source (ISO timestamp), `null` when never. */
export function cpiFetchedAt(db: Executor, series: string): string | null {
  return (
    db
      .select({ at: max(consumerPriceIndex.fetchedAt) })
      .from(consumerPriceIndex)
      .where(eq(consumerPriceIndex.series, series))
      .get()?.at ?? null
  );
}

/** The series that reaches the newest month (the current index base), `null` without rows. */
export function currentCpiSeries(db: Executor): string | null {
  return (
    db
      .select({ series: consumerPriceIndex.series })
      .from(consumerPriceIndex)
      .orderBy(desc(consumerPriceIndex.month), desc(consumerPriceIndex.series))
      .limit(1)
      .get()?.series ?? null
  );
}

/** Index number per month (a plain number: the index is a ratio, not money). */
export function cpiMonths(
  db: Executor,
  series: string,
): { months: Record<string, number>; fetchedAt: string | null; source: string | null } {
  const rows = db
    .select()
    .from(consumerPriceIndex)
    .where(eq(consumerPriceIndex.series, series))
    .all();
  return {
    months: Object.fromEntries(rows.map((r) => [r.month, r.indexMicro / 1_000_000])),
    fetchedAt: rows.map((r) => r.fetchedAt).sort()[rows.length - 1] ?? null,
    source: rows[0]?.source ?? null,
  };
}
