import { describe, expect, it } from 'vitest';
import { costsOverview } from './costs';

const months = (count: number, from = '2023-10') => {
  const out: string[] = [];
  let [y, m] = from.split('-').map(Number) as [number, number];
  for (let i = 0; i < count; i++) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
};
const flat = (list: string[], cents: number) => Object.fromEntries(list.map((m) => [m, cents]));

describe('costsOverview', () => {
  const available = months(35); // 2023-10 .. 2026-08
  const result = costsOverview({
    available,
    parts: [
      { key: 'interest', name: 'Kreditzinsen', monthly: flat(available, 7_000) },
      { key: 'fee', name: 'Kontoführung', monthly: flat(available, 690) },
      { key: 'none', name: 'Leer', monthly: {} },
    ],
    earnings: flat(available, 1_500),
    incomeCents: 6_000_000,
  });

  it('sums the last twelve months and the twelve before, per part', () => {
    expect(result.months).toHaveLength(12);
    expect(result.months[11]).toBe('2026-08');
    expect(result.previousMonths?.[0]).toBe('2024-09');
    expect(result.rows[0]).toMatchObject({ cents: 84_000, previousCents: 84_000, changeBp: 0 });
    expect(result.rows[1]).toMatchObject({ cents: 8_280 });
    expect(result.totalCents).toBe(92_280);
    expect(result.previousTotalCents).toBe(92_280);
    expect(result.changeCents).toBe(0);
  });
  it('shares add up to exactly 10 000 basis points', () => {
    expect(result.rows.reduce((a, r) => a + r.shareBp, 0)).toBe(10_000);
    expect(result.rows[2]?.shareBp).toBe(0);
  });
  it('chains earnings minus costs and keeps earnings apart from costs', () => {
    expect(result.earningsCents).toBe(18_000);
    expect(result.netCents).toBe(18_000 - 92_280);
    expect(result.previousNetCents).toBe(result.netCents);
    expect(result.incomeShareBp).toBe(Math.round((92_280 / 6_000_000) * 10_000));
  });
  it('has calendar-year columns with cut years marked as partial', () => {
    expect(result.years.map((y) => [y.year, y.months, y.partial])).toEqual([
      [2023, 3, true],
      [2024, 12, false],
      [2025, 12, false],
      [2026, 8, true],
    ]);
    const y2024 = result.years[1]!;
    expect(y2024.partCents).toEqual([84_000, 8_280, 0]);
    expect(y2024.totalCents).toBe(92_280);
    expect(y2024.earningsCents).toBe(18_000);
  });
  it('has no comparison without a full previous window and no share without income', () => {
    const short = costsOverview({
      available: months(15),
      parts: [{ key: 'a', name: 'A', monthly: flat(months(15), 100) }],
      earnings: {},
      incomeCents: 0,
    });
    expect(short.previousMonths).toBeNull();
    expect(short.changeCents).toBeNull();
    expect(short.rows[0]?.changeBp).toBeNull();
    expect(short.incomeShareBp).toBeNull();
    expect(short.months).toHaveLength(12);
  });
  it('works on an empty ledger and rejects unsafe sums', () => {
    const empty = costsOverview({ available: [], parts: [], earnings: {}, incomeCents: 0 });
    expect(empty.totalCents).toBe(0);
    expect(empty.years).toEqual([]);
    expect(() =>
      costsOverview({
        available: ['2026-01', '2026-02'],
        parts: [
          { key: 'a', name: 'A', monthly: { '2026-01': Number.MAX_SAFE_INTEGER, '2026-02': 5 } },
        ],
        earnings: {},
        incomeCents: 0,
      }),
    ).toThrow(RangeError);
  });
});
