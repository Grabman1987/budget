import { addMonths, lastDayOfMonth, monthOf, monthsBetween } from '@budget/domain';
import { account } from '../schema';
import { allocationUniverse } from './allocation-inputs';
import { freedomView } from './freedom';
import { freedomInvestmentBasis } from './freedom-inputs';
import type { Executor } from './types';

export interface FreedomHistoryPoint {
  date: string;
  investedCents: number | null;
}

export interface FreedomInvestedHistory {
  /** Availability only; never changes the canonical resolver's explicit pre-opening zero. */
  availableFrom: string | null;
  monthEnds: FreedomHistoryPoint[];
  /** Exact current resolver result, separately labelled; may coincide with a month end. */
  current: FreedomHistoryPoint;
}

/** Current selected universe, evaluated at actual month ends. No interpolation or gap filling. */
export function freedomHistory(db: Executor, asOf: string): FreedomInvestedHistory {
  const selected = allocationUniverse(db).accounts;
  const coverage = selected.length ? selected : db.select().from(account).all();
  const availableFrom = coverage.reduce<string | null>(
    (first, row) => (first === null || row.openingDate < first ? row.openingDate : first),
    null,
  );
  const lastMonth =
    lastDayOfMonth(monthOf(asOf)) <= asOf ? monthOf(asOf) : addMonths(monthOf(asOf), -1);
  const monthEnds =
    lastMonth < '2023-10'
      ? []
      : monthsBetween('2023-10', lastMonth).map((month) => {
          const date = lastDayOfMonth(month);
          return {
            date,
            investedCents:
              availableFrom === null || date < availableFrom
                ? null
                : freedomInvestmentBasis(db, date).investedCents,
          };
        });
  return {
    availableFrom,
    monthEnds,
    current: { date: asOf, investedCents: freedomInvestmentBasis(db, asOf).investedCents },
  };
}

/** One SQLite read snapshot for current figures, current scope and the entire dated series. */
export function freedomViewWithHistory(db: Executor, asOf: string) {
  return db.transaction((tx) => ({
    ...freedomView(tx, asOf),
    investedHistory: freedomHistory(tx, asOf),
  }));
}
