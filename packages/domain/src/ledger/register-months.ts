import { addMonths } from '../date';

export interface RegisterMonth {
  month: string;
  count: number;
  cents: number | null;
  cumulativeCents: number | null;
}

const safe = (value: bigint): number | null =>
  value > BigInt(Number.MAX_SAFE_INTEGER) || value < -BigInt(Number.MAX_SAFE_INTEGER)
    ? null
    : Number(value);

/** Complete-filter signed EUR movements, newest first. Null never becomes zero. */
export function registerMonths(
  rows: ReadonlyArray<{ date: string; cents: number | null; count?: number }>,
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
  let cumulative = 0n;
  let missing = false;
  return [...groups]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([month, group]) => {
      cumulative += group.cents;
      missing ||= group.missing;
      return {
        month,
        count: group.count,
        cents: group.missing ? null : safe(group.cents),
        cumulativeCents: missing ? null : safe(cumulative),
      };
    });
}

/** Calendar months, including zero months, ending at the newest matching booking. */
export function registerPeriod(months: readonly RegisterMonth[], range: '3' | '6' | '12' | 'all') {
  const newest = months[0]?.month;
  const oldest = months.at(-1)?.month;
  if (!newest || !oldest) return { months: [], count: 0, cents: 0, averageCents: 0 };
  const from = range === 'all' ? oldest : addMonths(newest, 1 - Number(range));
  const byMonth = new Map(months.map((row) => [row.month, row]));
  const selected: RegisterMonth[] = [];
  for (let month = from; month <= newest; month = addMonths(month, 1))
    selected.push(byMonth.get(month) ?? { month, count: 0, cents: 0, cumulativeCents: 0 });
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
