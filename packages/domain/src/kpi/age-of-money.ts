import { daysBetween } from '../date';

/**
 * Geldalter (R03), YNAB definition: every outflow spends the oldest money first (FIFO); the age
 * of an outflow is the amount-weighted average age of the inflows it consumed; the Geldalter is
 * the average age of the last 10 outflows, in whole days.
 */

export interface MoneyEvent {
  /** `YYYY-MM-DD` */
  day: string;
  /**
   * Signed cents on the budget accounts: positive = inflow (income, receipts), negative = outflow
   * (spending). Transfers between budget accounts are not events. Opening balances are inflows on
   * the opening day.
   */
  cents: number;
}

export interface AgeOfMoney {
  /** Average age in days of the last `window` aged outflows; `null` without any. */
  days: number | null;
  /** Outflows that entered the average. */
  outflowsCounted: number;
}

/** Number of outflows the average runs over. */
export const AGE_OF_MONEY_WINDOW = 10;

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const inflowFirst = (cents: number): number => (cents > 0 ? 0 : 1);

/**
 * @param events all events of the budget accounts (any order)
 * @param asOf only events up to this day count (default: all)
 */
export function ageOfMoney(
  events: ReadonlyArray<MoneyEvent>,
  asOf?: string,
  window: number = AGE_OF_MONEY_WINDOW,
): AgeOfMoney {
  return ageOfMoneyAt(events, [asOf], window)[0]!;
}

/**
 * `ageOfMoney` for several days in one pass: the events are sorted once and every day reads the
 * state after the events up to it (the days may come in any order; `undefined` = all events).
 * Same result as calling `ageOfMoney` per day, without sorting and replaying the ledger each time.
 */
export function ageOfMoneyAt(
  events: ReadonlyArray<MoneyEvent>,
  asOfs: ReadonlyArray<string | undefined>,
  window: number = AGE_OF_MONEY_WINDOW,
): AgeOfMoney[] {
  // Same day: inflows first, so money that arrives and leaves on one day has age 0.
  const sorted = events
    .map((e, i) => ({ ...e, i }))
    .filter((e) => e.cents !== 0)
    .sort((a, b) => cmp(a.day, b.day) || inflowFirst(a.cents) - inflowFirst(b.cents) || a.i - b.i);

  const result = new Array<AgeOfMoney>(asOfs.length);
  // `~` sorts after every digit: "no limit" comes last.
  const pending = asOfs
    .map((asOf, index) => ({ asOf: asOf ?? '~', index }))
    .sort((a, b) => cmp(a.asOf, b.asOf));
  let next = 0;

  const lots: { day: string; left: number }[] = [];
  let head = 0;
  /** Age of each outflow that consumed money: [age sum in cent-days, consumed cents]. */
  const ages: { centDays: number; consumed: number }[] = [];
  const snapshot = (): AgeOfMoney => {
    const last = ages.slice(-window);
    if (last.length === 0) return { days: null, outflowsCounted: 0 };
    const mean = last.reduce((a, x) => a + x.centDays / x.consumed, 0) / last.length;
    return { days: Math.round(mean), outflowsCounted: last.length };
  };
  for (const e of sorted) {
    // A day before this event's day has seen all of its events.
    while (next < pending.length && pending[next]!.asOf < e.day)
      result[pending[next++]!.index] = snapshot();
    if (e.cents > 0) {
      lots.push({ day: e.day, left: e.cents });
      continue;
    }
    let need = -e.cents;
    let centDays = 0;
    let consumed = 0;
    for (let lot = lots[head]; need > 0 && lot; lot = lots[head]) {
      const take = Math.min(lot.left, need);
      centDays += take * daysBetween(lot.day, e.day);
      consumed += take;
      lot.left -= take;
      need -= take;
      if (lot.left === 0) head++;
    }
    // The part without money behind it (overspending) has no age; an outflow with no money is skipped.
    if (consumed > 0) ages.push({ centDays, consumed });
  }
  while (next < pending.length) result[pending[next++]!.index] = snapshot();
  return result;
}
