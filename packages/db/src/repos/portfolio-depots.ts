import { portfolioBenchmarks, type PortfolioBenchmarkSeries } from './portfolio-benchmarks';
import { cashValuer } from './cash-valuation';
import {
  ExchangeRateUnavailableError,
  eachDay,
  benchmarkQuotesInEur,
  performanceReportSeries,
  depotIndexLine,
  periodWindow,
  shareBps,
  sumSeries,
  windowPerformance,
  type ReportQuote,
  type IndexPoint,
  type Period,
  type PerformanceInput,
  type Valuation,
  type WindowPerformance,
} from '@budget/domain';
import { and, asc, eq, isNull, lte } from 'drizzle-orm';
import { account, institution, price, security, valuation } from '../schema';
import {
  cashSeries,
  portfolioFlowsRead,
  valuationSeries,
  valuationSeriesRead,
  type PortfolioReturnUnavailableReason,
} from './portfolio';
import { firstDay, positionLines, ratesAsOf } from './portfolio-summary';
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
  /** A missing transfer-date boundary value affects this return, not its holdings. */
  returnUnavailable: SecurityTransferFlowUnavailableReason | null;
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
  benchmarks: PortfolioBenchmarkSeries[];
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
  const accounts = db
    .select()
    .from(account)
    .where(
      and(
        isNull(account.deletedAt),
        eq(account.role, 'investment'),
        lte(account.openingDate, today),
      ),
    )
    .all();
  const historyStart = firstDay(db, today);
  const start =
    [historyStart, ...accounts.map((a) => a.openingDate)]
      .filter((d): d is string => d !== null)
      .sort()[0] ?? null;
  const lines = positionLines(db, today);
  const empty: DepotComparison = {
    asOf: today,
    period,
    window: null,
    benchmark: null,
    benchmarkIndex: null,
    benchmarks: [],
    depots: [],
    total: null,
  };
  if (start === null) return empty;

  const wholeRead = valuationSeriesRead(db, { from: start, to: today });
  const days = wholeRead.available ? wholeRead.series.days : eachDay(start, today);
  if (days.length === 0) return empty;
  const investmentAccounts = db
    .select({ id: account.id })
    .from(account)
    .where(and(isNull(account.deletedAt), eq(account.role, 'investment')))
    .all()
    .map((a) => a.id);

  const accountRows = new Map(
    db
      .select({
        id: account.id,
        name: account.name,
        institutionId: account.institutionId,
        type: account.type,
        closedAt: account.closedAt,
      })
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

  type InputRead = { available: true; input: PerformanceInput } | {
    available: false; reason: PortfolioReturnUnavailableReason;
  };
  const inputOf = (values: number[], accounts: ReadonlyArray<string>): InputRead => {
    const valuations: Valuation[] = days.map((date, i) => ({
      date,
      valueCents: values[i] as number,
    }));
    const flowsOf = (taxBasis: 'after-tax' | 'before-tax' | 'pp-irr') => {
      const securities = portfolioFlowsRead(db, {
        from: start,
        to: today,
        view: 'securities',
        taxBasis,
        pairedSecurityAccounts: accounts,
        includedCashAccounts: accounts.filter(
          (id) => !['brokerage', 'crypto'].includes(accountRows.get(id)?.type ?? ''),
        ),
        accounts: accounts.filter((id) =>
          ['brokerage', 'crypto'].includes(accountRows.get(id)?.type ?? ''),
        ),
      });
      if (!securities.available) return securities;
      const depot = portfolioFlowsRead(db, {
        from: start,
        to: today,
        view: 'depot',
        pairedSecurityAccounts: accounts,
        includedSecuritiesAccounts: accounts.filter((id) =>
          ['brokerage', 'crypto'].includes(accountRows.get(id)?.type ?? ''),
        ),
        accounts: accounts.filter(
          (id) => !['brokerage', 'crypto'].includes(accountRows.get(id)?.type ?? ''),
        ),
        referenceAccounts: accounts.filter(
          (id) => !['brokerage', 'crypto'].includes(accountRows.get(id)?.type ?? ''),
        ),
      });
      return depot.available
        ? { available: true as const, flows: [...securities.flows, ...depot.flows] }
        : depot;
    };
    const flows = flowsOf('after-tax');
    if (!flows.available) return flows;
    const returnFlows = flowsOf('before-tax');
    if (!returnFlows.available) return returnFlows;
    const irrFlows = flowsOf('pp-irr');
    if (!irrFlows.available) return irrFlows;
    return {
      available: true,
      input: {
        series: valuations,
        flows: flows.flows,
        returnFlows: returnFlows.flows,
        irrFlows: irrFlows.flows,
      },
    };
  };

  // Benchmark: the largest position's price series, like `portfolioSummary`.
  const benchmarkSecurityId = lines[0]?.securityId;
  const benchmarkSecurity = benchmarkSecurityId
    ? db.select().from(security).where(eq(security.id, benchmarkSecurityId)).get()
    : undefined;
  let levels: ReportQuote[] = [];
  if (benchmarkSecurity) {
    const rows = db
      .select()
      .from(price)
      .where(and(eq(price.securityId, benchmarkSecurity.id), lte(price.date, today)))
      .orderBy(asc(price.date))
      .all();
    levels = benchmarkQuotesInEur(rows, ratesAsOf(db, today), benchmarkSecurity.kind);
  }
  const withBenchmark = (input: PerformanceInput): PerformanceInput =>
    levels.length > 0 ? { ...input, benchmark: levels } : input;

  const valuesOf = (
    a: (typeof accounts)[number],
    series: ReturnType<typeof valuationSeries>,
  ): number[] => {
    const mine = series.positions.filter((p) => p.accountId === a.id);
    const held = sumSeries(...mine.map((p) => p.valueCents));
    const cash =
      a.type === 'brokerage' || a.type === 'crypto'
        ? series.days.map(() => 0)
        : cashSeries(db, series.days, [a.id]).get(a.id)!;
    const manual = db
      .select()
      .from(valuation)
      .where(
        and(eq(valuation.accountId, a.id), isNull(valuation.deletedAt), lte(valuation.date, today)),
      )
      .orderBy(asc(valuation.date))
      .all();
    const value = cashValuer(db);
    let cursor = 0;
    let latest: (typeof manual)[number] | undefined;
    return series.days.map((day, i) => {
        while (cursor < manual.length && manual[cursor]!.date <= day) latest = manual[cursor++];
        if (a.type === 'brokerage' || a.type === 'crypto') return held[i] ?? 0;
        const manualCents =
          latest && day >= a.openingDate && !(held[i] ?? 0)
            ? value(latest.valueCents, a.currency, day)
            : null;
        if (manualCents && manualCents.eurCents === null)
          throw new ExchangeRateUnavailableError(a.currency, day);
        return manualCents?.eurCents ?? (held[i] ?? 0) + cash[i]!;
      });
  };
  const values = new Map<string, number[]>();
  const endValues = new Map<string, number>();
  const valuationUnavailable = new Map<string, 'missing_valuation_fx'>();
  for (const a of accounts) {
    try {
      const series = wholeRead.available ? wholeRead.series
        : valuationSeries(db, { from: start, to: today, accounts: [a.id] });
      const accountValues = valuesOf(a, series);
      values.set(a.id, accountValues);
      endValues.set(a.id, accountValues.at(-1)!);
    } catch (error) {
      if (!(error instanceof ExchangeRateUnavailableError)) throw error;
      valuationUnavailable.set(a.id, 'missing_valuation_fx');
      // A known current value is independent of the unknown historical return.
      const current = valuationSeries(db, { from: today, to: today, accounts: [a.id] });
      endValues.set(a.id, valuesOf(a, current)[0]!);
    }
  }
  const allValues = valuationUnavailable.size ? null : sumSeries(...values.values());
  const totalRead: InputRead = allValues === null
    ? { available: false, reason: 'missing_valuation_fx' }
    : inputOf(allValues, investmentAccounts);
  const window = periodWindow(period, today, days[0]);
  const totalPerformance = totalRead.available
    ? windowPerformance(withBenchmark(totalRead.input), window) : null;
  const effective = totalPerformance
    ? { from: totalPerformance.from, to: totalPerformance.to }
    : { from: window.from, to: window.to };

  const performanceOf = (read: InputRead): WindowPerformance | null => {
    if (!read.available) return null;
    const first = read.input.series.find((v) => v.valueCents > 0);
    if (!first || first.date > effective.to) return null;
    return windowPerformance(withBenchmark(read.input), effective);
  };

  const totalLine = totalRead.available ? depotIndexLine(totalRead.input, effective) : [];
  const benchmarkByDate = new Map(
    (totalRead.available
      ? performanceReportSeries(totalRead.input, effective, levels).dailyBenchmark
      : []
    ).map((point) => [point.date, point.benchmark]),
  );
  const benchmarkIndex =
    levels.length > 0
      ? totalLine.map(({ date }) => ({ date, level: benchmarkByDate.get(date) ?? null }))
      : null;

  // Closed zero-value accounts remain visible only when this period contains value or flows.
  const inputByAccount = new Map(accounts.map((row): readonly [string, InputRead] => [
    row.id,
    valuationUnavailable.has(row.id)
      ? { available: false, reason: 'missing_valuation_fx' }
      : inputOf(values.get(row.id)!, [row.id]),
  ]));
  const accountIds = accounts
    .filter((a) => {
      const read = inputByAccount.get(a.id)!;
      if (!read.available) return true;
      return (
        !a.closedAt ||
        days.some(
          (day, i) => day >= effective.from && day <= effective.to &&
            values.get(a.id)![i] !== 0,
        ) ||
        read.input.flows.some(
          (f) => f.date > effective.from && f.date <= effective.to && f.cents !== 0,
        )
      );
    })
    .map((a) => a.id);
  const endValue = (id: string) => endValues.get(id)!;
  const totalValue = [...endValues.values()].reduce((sum, value) => sum + value, 0);
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
      const input = inputByAccount.get(id)!;
      return {
        accountId: id,
        name: accountRows.get(id)?.name ?? id,
        platforms: platformsOf([id]),
        valueCents: endValue(id),
        shareBp: shares[i] as number,
        performance: performanceOf(input),
        returnUnavailable: input.available ? null : input.reason,
        index: input.available ? depotIndexLine(input.input, effective) : [],
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
    returnUnavailable: totalRead.available ? null : totalRead.reason,
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
    benchmarks: totalRead.available ? portfolioBenchmarks(db, totalRead.input, effective) : [],
    depots,
    total,
  };
}
