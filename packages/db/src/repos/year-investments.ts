import { and, eq, gt, isNull, lte } from 'drizzle-orm';
import {
  addDays,
  addMonths,
  ratioBp,
  feeBreakdownLast12Months,
  incomeByKindLast12Months,
  lastDayOfMonth,
  taxBreakdownLast12Months,
  type CalendarRange,
  type RealizedMovement,
  type WindowPerformance,
} from '@budget/domain';
import { account, security, trade } from '../schema';
import { ExchangeRateUnavailableError, PriceUnavailableError } from '@budget/domain';
import { MissingFxRateError } from './errors';
import {
  portfolioSummary,
  ratesAsOf,
  realizedGainAsOf,
  realizedMovementsByPosition,
  tradesInEur,
  tradesUpTo,
} from './portfolio-summary';
import type { Executor } from './types';

/**
 * Investments and trading block of the Jahresreport. Nothing is calculated here that the portfolio
 * report does not already define: value, contributions, gain, TTWROR and money-weighted return are
 * the `performance` of `portfolioSummary` for the same calendar range, income/fees/taxes come from
 * the Vermögen cost helpers (the trades of the included months only), and the realised gain is the
 * difference of two stands of the one realised-gain function.
 */

export interface YearInvestments {
  /** The portfolio report's window figures for the included months; `null` without history. */
  performance: Pick<
    WindowPerformance,
    | 'from'
    | 'to'
    | 'startValueCents'
    | 'endValueCents'
    | 'contributionsCents'
    | 'gainCents'
    | 'ttwror'
    | 'moneyWeighted'
    | 'xirr'
  > | null;
  /** The configured benchmark's return of the same window; `null` when none is configured. */
  benchmark: { name: string; ttwror: number } | null;
  /** Dividends and interest of the included months (trades), gross, taxes and fees withheld. */
  income: { grossCents: number; taxCents: number; feeCents: number; netCents: number };
  trading: {
    buys: number;
    sells: number;
    /** Buys that are confirmed savings-plan executions. */
    savingsPlanBuys: number;
    /** Realised gain of the months (stand at the end minus stand before); `null` if not known. */
    realizedGainCents: number | null;
    realizedGainComplete: boolean;
    results: YearRealizedResults | null;
    previousResults: YearRealizedResults | null;
    /** Order, income and booking fees of the months. */
    feesCents: number;
    /** Taxes as booked by the broker. */
    taxesCents: number;
  };
}

interface YearRealizedResults {
  gainsCents: number;
  lossesCents: number;
  salesComplete: boolean;
  closedCount: number;
  profitableCount: number;
  closuresComplete: boolean;
  hitRateBp: number | null;
}

function realizedResults(
  histories: RealizedMovement[][],
  from: string,
  to: string,
): YearRealizedResults {
  let gainsCents = 0;
  let lossesCents = 0;
  let salesComplete = true;
  let closedCount = 0;
  let profitableCount = 0;
  let closuresComplete = true;
  for (const history of histories) {
    let positionGain = 0;
    let positionComplete = true;
    for (const entry of history) {
      if (entry.date > to) break;
      if (entry.kind === 'reset') {
        positionGain = 0;
        positionComplete = true;
        continue;
      }
      const inYear = entry.date >= from;
      positionGain += entry.gainCents;
      positionComplete &&= entry.complete;
      if (inYear) {
        salesComplete &&= entry.complete;
        if (entry.gainCents > 0) gainsCents += entry.gainCents;
        else lossesCents += entry.gainCents;
      }
      if (entry.closes) {
        if (inYear) {
          closedCount++;
          closuresComplete &&= positionComplete;
          if (positionComplete && positionGain > 0) profitableCount++;
        }
        positionGain = 0;
        positionComplete = true;
      }
    }
  }
  return {
    gainsCents,
    lossesCents,
    salesComplete,
    closedCount,
    profitableCount,
    closuresComplete,
    hitRateBp: closuresComplete && closedCount > 0 ? ratioBp(profitableCount, closedCount) : null,
  };
}

export function yearInvestments(
  db: Executor,
  months: string[],
  firstReportMonth?: string | null,
): YearInvestments | null {
  const first = months[0];
  const last = months[months.length - 1];
  if (first === undefined || last === undefined) return null;
  const to = lastDayOfMonth(last);
  const dayBefore = addDays(`${first}-01`, -1);
  const range: CalendarRange = `${first}..${last}`;
  const summary = portfolioSummary(db, {
    today: to,
    period: range,
    view: 'securities',
    includePerformanceHistory: true,
  });
  const p = summary.performance;

  // Only the trades of the months: the "12 months up to" helpers then cover exactly the year.
  const trades = tradesInEur(tradesUpTo(db, to), ratesAsOf(db, to)).filter(
    (t) => t.date > dayBefore,
  );
  const byKind = incomeByKindLast12Months(trades, to);
  const grossCents = byKind.dividend.grossCents + byKind.interest.grossCents;
  const taxCents = byKind.dividend.taxCents + byKind.interest.taxCents;
  const feeCents = byKind.dividend.feeCents + byKind.interest.feeCents;

  const kinds = db
    .select({ kind: trade.kind, savingsPlanId: trade.savingsPlanId })
    .from(trade)
    .innerJoin(security, eq(security.id, trade.securityId))
    .innerJoin(account, eq(account.id, trade.accountId))
    .where(
      and(
        isNull(trade.deletedAt),
        isNull(security.deletedAt),
        isNull(account.deletedAt),
        gt(trade.date, dayBefore),
        lte(trade.date, to),
      ),
    )
    .all();
  const buys = kinds.filter((t) => t.kind === 'buy');

  let realizedGainCents: number | null = null;
  let realizedGainComplete = false;
  let results: YearRealizedResults | null = null;
  let previousResults: YearRealizedResults | null = null;
  try {
    const end = realizedGainAsOf(db, to);
    const start = realizedGainAsOf(db, dayBefore);
    realizedGainCents = end.realizedGainCents - start.realizedGainCents;
    realizedGainComplete = end.realizedGainComplete && start.realizedGainComplete;
    const histories = realizedMovementsByPosition(db, to);
    results = realizedResults(histories, `${first}-01`, to);
    const previousFrom = addMonths(first, -12);
    const previousTo = lastDayOfMonth(addMonths(last, -12));
    if (
      firstReportMonth === undefined ||
      (firstReportMonth !== null && firstReportMonth <= previousFrom)
    )
      previousResults = realizedResults(histories, `${previousFrom}-01`, previousTo);
  } catch (error) {
    // A missing exchange rate or price: leave the figure out rather than estimate it.
    if (!(
      error instanceof MissingFxRateError ||
      error instanceof ExchangeRateUnavailableError ||
      error instanceof PriceUnavailableError
    ))
      throw error;
  }

  return {
    performance: p && {
      from: p.from,
      to: p.to,
      startValueCents: p.startValueCents,
      endValueCents: p.endValueCents,
      contributionsCents: p.contributionsCents,
      gainCents: p.gainCents,
      ttwror: p.ttwror,
      moneyWeighted: p.moneyWeighted,
      xirr: p.xirr,
    },
    benchmark:
      summary.benchmark && p?.benchmarkTtwror != null
        ? { name: summary.benchmark.name, ttwror: p.benchmarkTtwror }
        : null,
    income: { grossCents, taxCents, feeCents, netCents: grossCents - taxCents - feeCents },
    trading: {
      buys: buys.length,
      sells: kinds.filter((t) => t.kind === 'sell').length,
      savingsPlanBuys: buys.filter((t) => t.savingsPlanId !== null).length,
      realizedGainCents,
      realizedGainComplete,
      results,
      previousResults,
      feesCents: feeBreakdownLast12Months(trades, to).totalCents,
      taxesCents: taxBreakdownLast12Months(trades, to).totalCents,
    },
  };
}
