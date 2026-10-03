import {
  benchmarkIndexLine,
  depotIndexLine,
  periodWindow,
  shareBps,
  sumSeries,
  windowPerformance,
  type BenchmarkLevel,
  type IndexPoint,
  type Period,
  type PerformanceInput,
  type Valuation,
  type WindowPerformance,
} from '@budget/domain';
import { and, asc, eq, isNull, lte } from 'drizzle-orm';
import { account, institution, price, security } from '../schema';
import { portfolioFlows, valuationSeries } from './portfolio';
import { firstDay, positionLines } from './portfolio-summary';
import type { Executor } from './types';

export interface DepotProduct {
  securityId: string;
  name: string;
  valueCents: number;
}

export interface DepotColumn {
  /** The investment account; `null` for the total over all depots. */
  accountId: string | null;
  name: string;
  /** Broker, crypto or P2P platform names of the account(s), alphabetical. */
  platforms: string[];
  valueCents: number;
  /** Share of the total value in basis points; the depot shares add up to 10 000. */
  shareBp: number;
  /** The window figures of this depot; `null` when the depot has no valued day in the window. */
  performance: WindowPerformance | null;
  /** Chained time-weighted level, 100 at the window start, at every month boundary. */
  index: IndexPoint[];
  products: DepotProduct[];
}

export interface DepotComparison {
  asOf: string;
  period: Period;
  /** `null` while the portfolio has no history. */
  window: { from: string; to: string } | null;
  /** Comparison security: the largest position, as in `portfolioSummary`. */
  benchmark: { securityId: string; name: string } | null;
  /** The comparison security's level at the same boundaries; `null` without prices. */
  benchmarkIndex: IndexPoint[] | null;
  depots: DepotColumn[];
  total: DepotColumn | null;
}

/**
 * Depots side by side (report 4.1): one column per investment account holding securities in the
 * period, and the total. Each column reuses `valuationSeries`, `portfolioFlows` (securities-only
 * view) and `windowPerformance`, so the total equals `portfolioSummary(...).performance` of the
 * same period; nothing about returns is computed a second time.
 */
export function depotComparison(
  db: Executor,
  options: { today: string; period?: Period },
): DepotComparison {
  const today = periodWindow(options.period ?? '1J', options.today).to;
  const period = options.period ?? '1J';
  const start = firstDay(db, today);
  const lines = positionLines(db, today);
  const empty: DepotComparison = {
    asOf: today,
    period,
    window: null,
    benchmark: null,
    benchmarkIndex: null,
    depots: [],
    total: null,
  };
  if (start === null) return empty;

  const series = valuationSeries(db, { from: start, to: today });
  if (series.days.length === 0) return empty;
  const investmentAccounts = db
    .select({ id: account.id })
    .from(account)
    .where(and(isNull(account.deletedAt), eq(account.role, 'investment')))
    .all()
    .map((a) => a.id);

  const accountRows = new Map(
    db
      .select({ id: account.id, name: account.name, institutionId: account.institutionId })
      .from(account)
      .all()
      .map((a) => [a.id, a]),
  );
  const institutionNames = new Map(
    db
      .select({ id: institution.id, name: institution.name })
      .from(institution)
      .all()
      .map((i) => [i.id, i.name]),
  );

  const inputOf = (values: number[], accounts: ReadonlyArray<string>): PerformanceInput => {
    const valuations: Valuation[] = series.days.map((date, i) => ({
      date,
      valueCents: values[i] as number,
    }));
    return {
      series: valuations,
      flows: portfolioFlows(db, { from: start, to: today, view: 'securities', accounts }),
    };
  };

  // Benchmark: the largest position's price series, like `portfolioSummary`.
  const benchmarkSecurityId = lines[0]?.securityId;
  const benchmarkSecurity = benchmarkSecurityId
    ? db.select().from(security).where(eq(security.id, benchmarkSecurityId)).get()
    : undefined;
  let levels: BenchmarkLevel[] = [];
  if (benchmarkSecurity)
    levels = db
      .select({ date: price.date, level: price.priceMicro })
      .from(price)
      .where(and(eq(price.securityId, benchmarkSecurity.id), lte(price.date, today)))
      .orderBy(asc(price.date))
      .all();
  const withBenchmark = (input: PerformanceInput): PerformanceInput =>
    levels.length > 0 ? { ...input, benchmark: levels } : input;

  // The total is built exactly like the portfolio summary (all positions, investment account flows).
  const totalInput = inputOf(series.totalCents, investmentAccounts);
  const totalPerformance = windowPerformance(
    withBenchmark(totalInput),
    periodWindow(period, today, totalInput.series[0]?.date),
  );
  const effective = { from: totalPerformance.from, to: totalPerformance.to };

  const performanceOf = (input: PerformanceInput): WindowPerformance | null => {
    const first = input.series.find((v) => v.valueCents > 0);
    if (!first || first.date > effective.to) return null;
    return windowPerformance(withBenchmark(input), effective);
  };

  const totalLine = depotIndexLine(totalInput, effective);
  const boundaryDays = totalLine.map((p) => p.date);
  const benchmarkIndex = levels.length > 0 ? benchmarkIndexLine(levels, boundaryDays) : null;

  // One column per account that held a position in the series.
  const accountIds = [...new Set(series.positions.map((p) => p.accountId))];
  const values = new Map<string, number[]>();
  for (const id of accountIds) {
    const mine = series.positions.filter((p) => p.accountId === id).map((p) => p.valueCents);
    values.set(id, sumSeries(...mine));
  }
  const lastIndex = series.days.length - 1;
  const endValue = (id: string) => (values.get(id) as number[])[lastIndex] as number;
  const totalValue = series.totalCents[lastIndex] as number;
  const shares = shareBps(
    accountIds.map(endValue),
    accountIds.reduce((sum, id) => sum + endValue(id), 0),
  );

  const productsOf = (id: string | null): DepotProduct[] =>
    lines
      .flatMap((line) =>
        line.accounts
          .filter((a) => id === null || a.accountId === id)
          .map((a) => ({ securityId: line.securityId, name: line.name, valueCents: a.valueCents })),
      )
      .reduce<DepotProduct[]>((merged, row) => {
        const existing = merged.find((m) => m.securityId === row.securityId);
        if (existing) existing.valueCents += row.valueCents;
        else merged.push({ ...row });
        return merged;
      }, [])
      .sort((a, b) => b.valueCents - a.valueCents || a.securityId.localeCompare(b.securityId));

  const platformsOf = (ids: ReadonlyArray<string>): string[] =>
    [
      ...new Set(
        ids.flatMap((id) => {
          const institutionId = accountRows.get(id)?.institutionId;
          return institutionId ? [institutionNames.get(institutionId) ?? institutionId] : [];
        }),
      ),
    ].sort((a, b) => a.localeCompare(b));

  const depots: DepotColumn[] = accountIds
    .map((id, i): DepotColumn => {
      const input = inputOf(values.get(id) as number[], [id]);
      return {
        accountId: id,
        name: accountRows.get(id)?.name ?? id,
        platforms: platformsOf([id]),
        valueCents: endValue(id),
        shareBp: shares[i] as number,
        performance: performanceOf(input),
        index: depotIndexLine(input, effective),
        products: productsOf(id),
      };
    })
    .sort(
      (a, b) => b.valueCents - a.valueCents || (a.accountId ?? '').localeCompare(b.accountId ?? ''),
    );

  const total: DepotColumn = {
    accountId: null,
    name: 'Alle Depots',
    platforms: platformsOf(accountIds),
    valueCents: totalValue,
    shareBp: totalValue > 0 ? 10_000 : 0,
    performance: totalPerformance,
    index: totalLine,
    products: productsOf(null),
  };
  return {
    asOf: today,
    period,
    window: effective,
    benchmark: benchmarkSecurity
      ? { securityId: benchmarkSecurity.id, name: benchmarkSecurity.name }
      : null,
    benchmarkIndex,
    depots,
    total,
  };
}
