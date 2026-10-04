import {
  assetsDebtsOf,
  monthEnds,
  netWorthChange,
  periodWindow,
  type AssetsDebtsDay,
  type NetWorthChange,
  type Period,
} from '@budget/domain';
import { account } from '../schema';
import { earliestAccountDate, netWorthAsOf } from './portfolio';
import type { Executor } from './types';

/**
 * Report "Vermögen & Schulden": total assets and total debts at every month end of a period, the
 * net worth on top, and for each month the accounts behind it. Every month is read with
 * `netWorthAsOf`, the valuation behind Vermögen › Nettovermögen (no second calculation), so
 * assets plus debts equal the net worth of that day and the last month is today's net worth.
 */

export interface AssetsDebtsMonth extends AssetsDebtsDay {
  /** `YYYY-MM`. */
  month: string;
  /** The day read: the month's last day, or today while the month is running. */
  date: string;
  partial: boolean;
  /** At least one position of this day is valued by an estimate or not at all. */
  incomplete: boolean;
}

export interface AssetsDebtsHistory {
  period: Period;
  /** Day of the start value (its close), clamped to the first account. */
  from: string;
  to: string;
  months: AssetsDebtsMonth[];
  /** Start value on `from` against the net worth on `to`. */
  change: NetWorthChange;
}

export function assetsDebtsHistory(
  db: Executor,
  today: string,
  period: Period,
): AssetsDebtsHistory {
  const earliest = earliestAccountDate(db);
  // No account yet: nothing to show (the page says so) instead of one month of zeros.
  if (earliest === null)
    return { period, from: today, to: today, months: [], change: netWorthChange(0, 0) };
  const window = periodWindow(period, today, earliest);
  const to = window.to;
  const from = window.from < earliest ? (earliest < to ? earliest : to) : window.from;
  const meta = new Map(
    db
      .select({ id: account.id, name: account.name, type: account.type })
      .from(account)
      .all()
      .map((a) => [a.id, { id: a.id, name: a.name, type: a.type as string }]),
  );
  const months = monthEnds(from, to).map(({ month, date, partial }): AssetsDebtsMonth => {
    const valuation = netWorthAsOf(db, date);
    const day = assetsDebtsOf(valuation.byAccount, (id) => meta.get(id));
    if (day.netCents !== valuation.totalCents)
      throw new Error('Assets and debts disagree with the net worth');
    return { month, date, partial, incomplete: valuation.incomplete.length > 0, ...day };
  });
  const start = netWorthAsOf(db, from).totalCents;
  const end = months.length ? months[months.length - 1]!.netCents : start;
  return { period, from, to, months, change: netWorthChange(start, end) };
}
