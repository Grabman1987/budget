import { describe, expect, it } from 'vitest';
import { checkedHealthEmergencyCoverage } from './financial-health';

describe('assessment reserve eligibility keeps shared R02 arithmetic', () => {
  const source = {
    currentMonth: '2026-04',
    firstMonth: '2026-01',
    reserveCents: 270000,
    needSpending: [
      { month: '2026-01', cents: 90000 },
      { month: '2026-02', cents: 90000 },
      { month: '2026-03', cents: 90000 },
    ],
  };
  it('keeps literal 270000/90000 = 3.0 months, true zero and an unusable denominator distinct', () => {
    expect(checkedHealthEmergencyCoverage(source)).toEqual({
      months: 3,
      averageNeedCents: 90000,
      tenthsOfMonth: 30,
    });
    expect(checkedHealthEmergencyCoverage({ ...source, reserveCents: 0 })?.tenthsOfMonth).toBe(0);
    expect(
      checkedHealthEmergencyCoverage({ ...source, needSpending: [] })?.tenthsOfMonth,
    ).toBeNull();
  });
  it('rejects the unsafe 12000000000000000 window sum even though every 4000000000000000 month is safe', () => {
    expect(
      checkedHealthEmergencyCoverage({
        ...source,
        reserveCents: 1000,
        needSpending: source.needSpending.map((m) => ({ ...m, cents: 4000000000000000 })),
      }),
    ).toBeNull();
  });
  it('does not admit unsafe reserve multiplication or fractional source cents', () => {
    expect(
      checkedHealthEmergencyCoverage({ ...source, reserveCents: 4000000000000000 }),
    ).toBeNull();
    expect(
      checkedHealthEmergencyCoverage({
        ...source,
        needSpending: [{ month: '2026-01', cents: 1.5 }],
      }),
    ).toBeNull();
  });
});
