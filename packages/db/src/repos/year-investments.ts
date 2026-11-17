import { and, gt, isNull, lte } from 'drizzle-orm';
import {
  addDays,
  feeBreakdownLast12Months,
  incomeByKindLast12Months,
  lastDayOfMonth,
  taxBreakdownLast12Months,
  type CalendarRange,
  type WindowPerformance,
} from '@budget/domain';
import { trade } from '../schema';
import {
  portfolioSummary,
  ratesAsOf,
  realizedGainAsOf,
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
  > | null;
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
    /** Order, income and booking fees of the months. */
    feesCents: number;
    /** Taxes as booked by the broker. */
    taxesCents: number;
  };
}

export function yearInvestments(db: Executor, months: string[]): YearInvestments | null {
  const first = months[0];
  const last = months[months.length - 1];
  if (first === undefined || last === undefined) return null;
  const to = lastDayOfMonth(last);
  const dayBefore = addDays(`${first}-01`, -1);
  const range: CalendarRange = `${first}..${last}`;
  const summary = portfolioSummary(db, { today: to, period: range, view: 'securities' });
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
    .where(and(isNull(trade.deletedAt), gt(trade.date, dayBefore), lte(trade.date, to)))
    .all();
  const buys = kinds.filter((t) => t.kind === 'buy');

  let realizedGainCents: number | null = null;
  let realizedGainComplete = false;
  try {
    const end = realizedGainAsOf(db, to);
    const start = realizedGainAsOf(db, dayBefore);
    realizedGainCents = end.realizedGainCents - start.realizedGainCents;
    realizedGainComplete = end.realizedGainComplete && start.realizedGainComplete;
  } catch {
    // A missing exchange rate: leave the figure out rather than estimate it.
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
    },
    income: { grossCents, taxCents, feeCents, netCents: grossCents - taxCents - feeCents },
    trading: {
      buys: buys.length,
      sells: kinds.filter((t) => t.kind === 'sell').length,
      savingsPlanBuys: buys.filter((t) => t.savingsPlanId !== null).length,
      realizedGainCents,
      realizedGainComplete,
      feesCents: feeBreakdownLast12Months(trades, to).totalCents,
      taxesCents: taxBreakdownLast12Months(trades, to).totalCents,
    },
  };
}
