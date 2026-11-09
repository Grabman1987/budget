import { expect, it } from 'vitest';
import { registerMonths, registerPeriod } from './register-months';

const TODAY = '2026-10-15';

it('sums exact signed cents per month, newest first, and takes balances from the caller', () => {
  const rows = [
    { date: '2026-10-01', cents: -101 },
    { date: '2026-08-02', cents: -302 },
    { date: '2026-10-02', cents: 50 },
  ];
  expect(registerMonths(rows)).toEqual([
    { month: '2026-10', count: 2, cents: -51, cumulativeCents: null },
    { month: '2026-08', count: 1, cents: -302, cumulativeCents: null },
  ]);
  expect(registerMonths(rows, (m) => (m === '2026-10' ? 7 : 8))[0]?.cumulativeCents).toBe(7);
});

it('anchors windows at the current month and fills calendar gaps', () => {
  const months = registerMonths([
    { date: '2026-08-02', cents: -302 },
    { date: '2026-07-01', cents: -101 },
  ]);
  const three = registerPeriod(months, '3', TODAY);
  expect(three.months.map((m) => m.month)).toEqual(['2026-08', '2026-09', '2026-10']);
  expect(three).toMatchObject({ count: 1, cents: -302, averageCents: -101 });
  expect(registerPeriod(months, '6', TODAY).averageCents).toBe(-67);
  expect(registerPeriod(months, 'all', TODAY).months).toHaveLength(4);
  // Future months (hidden upcoming) never enter a window.
  const future = registerMonths([{ date: '2026-12-01', cents: -9 }, ...[]]);
  expect(registerPeriod(future, '3', TODAY).months).toEqual([]);
});

it('propagates missing values and refuses unsafe totals without rounding money', () => {
  const missing = registerMonths([
    { date: '2026-10-01', cents: null },
    { date: '2026-09-01', cents: 10 },
  ]);
  expect(missing[0]?.cents).toBeNull();
  expect(registerPeriod(missing, '6', TODAY).averageCents).toBeNull();
  const unsafe = registerMonths([
    { date: '2026-10-01', cents: Number.MAX_SAFE_INTEGER },
    { date: '2026-10-02', cents: 1 },
  ]);
  expect(unsafe[0]?.cents).toBeNull();
  expect(registerPeriod([], 'all', TODAY)).toMatchObject({ count: 0, cents: 0, averageCents: 0 });
  expect(
    registerPeriod(registerMonths([{ date: '2026-10-01', cents: -3 }]), '6', TODAY).averageCents,
  ).toBe(-1);
});
