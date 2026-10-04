import {
  performanceReportSeries,
  monthlyFigures,
  type PerformanceInput,
  type Window,
} from '@budget/domain';
import { and, asc, eq, lte } from 'drizzle-orm';
import { appSetting, price, security } from '../schema';
import { createEntity, getEntity, updateEntity } from './entities';
import { withGroup, type AuditContext } from './audit';
import { runInTransaction, type Executor } from './types';

/** Public EUR exchange-traded proxies, never owner holdings or credentials. */
export const BENCHMARKS = [
  {
    id: 'benchmark-ftse',
    name: 'FTSE All-World',
    isin: 'IE00BK5BQT80',
    symbol: 'VWCE.DE',
    slug: 'vanguard-ftse-all-world-ucits-etf-usd-acc',
  },
  {
    id: 'benchmark-sp500',
    name: 'S&P 500',
    isin: 'IE00B5BMR087',
    symbol: 'SXR8.DE',
    slug: 'ishares-core-s-p-500-ucits-etf-usd-acc',
  },
  {
    id: 'benchmark-nasdaq',
    name: 'Nasdaq-100',
    isin: 'IE00B53SZB19',
    symbol: 'SXRV.DE',
    slug: 'ishares-nasdaq-100-ucits-etf-usd-acc',
  },
  {
    id: 'benchmark-atx',
    name: 'ATX',
    isin: 'DE000A0D8Q23',
    symbol: 'EXXX.DE',
    slug: 'ishares-atx-ucits-etf-de',
  },
] as const;
const KEY = 'portfolio.benchmark_ids';

/** Idempotent system instruments. Prices still use the normal audited nightly path. */
export function ensureBenchmarkInstruments(db: Executor) {
  return runInTransaction(db, (tx) => {
    for (const b of BENCHMARKS)
      tx.insert(security)
        .values({
          id: b.id,
          name: b.name,
          isin: b.isin,
          symbol: b.symbol,
          kind: 'etf',
          currency: 'EUR',
          allocationIncluded: false,
          quoteUrl: `https://www.ariva.de/etf/${b.slug}/kurse/historische-kurse`,
          quoteExchange: '45',
        })
        .onConflictDoNothing()
        .run();
  });
}

export function benchmarkSelection(db: Executor) {
  const value = getEntity(db, appSetting, KEY)?.value;
  const ids: string[] = value ? JSON.parse(value) : [];
  return { instruments: BENCHMARKS.map((b) => ({ id: b.id, name: b.name, isin: b.isin })), ids };
}

export function setBenchmarkSelection(db: Executor, ids: string[], ctx: AuditContext) {
  if (new Set(ids).size !== ids.length || ids.some((id) => !BENCHMARKS.some((b) => b.id === id)))
    throw new RangeError('Invalid benchmark selection');
  return runInTransaction(db, (tx) => {
    ensureBenchmarkInstruments(tx);
    const value = JSON.stringify(BENCHMARKS.filter((b) => ids.includes(b.id)).map((b) => b.id));
    const current = getEntity(tx, appSetting, KEY),
      grouped = withGroup(ctx);
    if (!current) createEntity(tx, appSetting, { id: KEY, value }, grouped);
    else if (current.value !== value) updateEntity(tx, appSetting, KEY, { value }, grouped);
    return benchmarkSelection(tx);
  });
}

export function portfolioBenchmarks(db: Executor, input: PerformanceInput, window: Window) {
  const { ids } = benchmarkSelection(db);
  return BENCHMARKS.filter((b) => ids.includes(b.id)).map((b) => {
    const quotes = db
      .select()
      .from(price)
      .where(and(eq(price.securityId, b.id), lte(price.date, window.to)))
      .orderBy(asc(price.date))
      .all()
      .map((p) => ({
        date: p.date,
        level: p.currency === 'EUR' ? p.priceMicro : null,
        reason: p.currency === 'EUR' ? null : ('missing_fx' as const),
        weekendCarry: true,
      }));
    const history = performanceReportSeries(input, window, quotes);
    const beta =
      history.months.length > 1 &&
      history.months.every((m) => m.rate !== null && m.benchmarkRate !== null)
        ? monthlyFigures(
            history.months.map((m) => m.rate!),
            history.months.map((m) => m.benchmarkRate!),
          ).beta
        : null;
    return { id: b.id, name: b.name, isin: b.isin, ...history, beta };
  });
}
export type PortfolioBenchmarkSeries = ReturnType<typeof portfolioBenchmarks>[number];
