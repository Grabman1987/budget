import { expect, it } from 'vitest';
import { registerMonths, registerPeriod } from './register-months';

it('sums exact signed cents newest downwards and fills calendar gaps for the average', () => {
  const months = registerMonths([
    { date: '2026-10-01', cents: -101 },
    { date: '2026-08-02', cents: -302 },
    { date: '2026-10-02', cents: 50 },
  ]);
  expect(months).toEqual([
    { month: '2026-10', count: 2, cents: -51, cumulativeCents: -51 },
    { month: '2026-08', count: 1, cents: -302, cumulativeCents: -353 },
  ]);
  expect(registerPeriod(months, '3')).toMatchObject({ count: 3, cents: -353, averageCents: -118 });
  expect(registerPeriod(months, '3').months[1]).toMatchObject({ month: '2026-09', cents: 0 });
  expect(registerPeriod(months, '6').averageCents).toBe(-59);
  expect(registerPeriod(months, '12').averageCents).toBe(-29);
  expect(registerPeriod(months, 'all').averageCents).toBe(-118);
});

it('propagates missing values and refuses unsafe totals without rounding money', () => {
  const missing = registerMonths([
    { date: '2026-10-01', cents: null },
    { date: '2026-09-01', cents: 10 },
  ]);
  expect(missing[1]?.cumulativeCents).toBeNull();
  expect(registerPeriod(missing, '6').averageCents).toBeNull();
  const unsafe = registerMonths([
    { date: '2026-10-01', cents: Number.MAX_SAFE_INTEGER },
    { date: '2026-10-02', cents: 1 },
  ]);
  expect(unsafe[0]?.cents).toBeNull();
  expect(registerPeriod([], 'all')).toMatchObject({ count: 0, cents: 0, averageCents: 0 });
  expect(
    registerPeriod(registerMonths([{ date: '2026-10-01', cents: -3 }]), '6').averageCents,
  ).toBe(-1);
});
