import { addMonths } from '../date';

export interface RegisterMonth {
  month: string;
  /** Booking rows in that month (never split parts). */
  count: number;
  /** Signed net movement of the shown rows: inflow positive, outflow negative. */
  cents: number | null;
  /** Account balance at month end; `null` whenever the scope is not a plain single account. */
  cumulativeCents: number | null;
}

/**
 * What the month figures mean: `balance` = one unfiltered EUR account (net change incl. transfers
 * and balance at month end), `filtered` = a narrowed list (no balance), `rows` = several
 * accounts (sum of the shown rows, no balance).
 */
export type RegisterMonthsKind = 'balance' | 'filtered' | 'rows';

const safe = (value: bigint): number | null =>
  value > BigInt(Number.MAX_SAFE_INTEGER) || value < -BigInt(Number.MAX_SAFE_INTEGER)
    ? null
    : Number(value);

/**
 * Month rows, newest first, from per-row signed EUR movements. `endBalance` supplies the account
 * balance at the end of a month (omit it for filtered / multi-account lists). Null never becomes 0.
 */
export function registerMonths(
  rows: ReadonlyArray<{ date: string; cents: number | null; count?: number }>,
  endBalance?: (month: string) => number | null,
): RegisterMonth[] {
  const groups = new Map<string, { count: number; cents: bigint; missing: boolean }>();
  for (const row of rows) {
    const month = row.date.slice(0, 7);
    const group = groups.get(month) ?? { count: 0, cents: 0n, missing: false };
    group.count += row.count ?? 1;
    if (row.cents === null || !Number.isSafeInteger(row.cents)) group.missing = true;
    else group.cents += BigInt(row.cents);
    groups.set(month, group);
  }
  return [...groups]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([month, group]) => ({
      month,
      count: group.count,
      cents: group.missing ? null : safe(group.cents),
      cumulativeCents: endBalance ? endBalance(month) : null,
    }));
}

/**
 * Calendar months, including zero months, ending at the CURRENT month (`today`), never at the newest
 * booking. 'all' starts at the oldest month with data. Months after today are ignored.
 */
export function registerPeriod(
  months: readonly RegisterMonth[],
  range: '3' | '6' | '12' | 'all',
  today: string,
) {
  const current = today.slice(0, 7);
  const known = months.filter((row) => row.month <= current);
  const oldest = known.at(-1)?.month;
  if (!oldest) return { months: [], count: 0, cents: 0, averageCents: 0 };
  const from = range === 'all' ? oldest : addMonths(current, 1 - Number(range));
  const byMonth = new Map(known.map((row) => [row.month, row]));
  const selected: RegisterMonth[] = [];
  for (let month = from; month <= current; month = addMonths(month, 1))
    selected.push(byMonth.get(month) ?? { month, count: 0, cents: 0, cumulativeCents: null });
  const missing = selected.some((row) => row.cents === null);
  const sum = selected.reduce((total, row) => total + BigInt(row.cents ?? 0), 0n);
  const divisor = BigInt(selected.length);
  // Round half away from zero in integer arithmetic, once at the display boundary.
  const rounded = ((sum < 0n ? -sum : sum) + divisor / 2n) / divisor;
  return {
    months: selected,
    count: selected.reduce((total, row) => total + row.count, 0),
    cents: missing ? null : safe(sum),
    averageCents: missing ? null : safe(sum < 0n ? -rounded : rounded),
  };
}
