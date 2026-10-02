import { describe, expect, it } from 'vitest';
import { planYearMonths, planYearRows, sumPlanYearRows, type PlanYearMonth } from './budget-year';

const source = (): PlanYearMonth[] => planYearMonths(2026).map((month) => ({ month, envelopes: [] }));

describe('read-only plan year', () => {
  it('keeps signed flows and December balances without counting rollover repeatedly', () => {
    const months = source();
    months[0]!.envelopes = [{ categoryId: 'a', assignedCents: 10_001, activityCents: -3_002, availableCents: 8_999 }];
    months[1]!.envelopes = [{ categoryId: 'a', assignedCents: -1_000, activityCents: 203, availableCents: 8_202 }];
    months[11]!.envelopes = [{ categoryId: 'a', assignedCents: 500, activityCents: -100, availableCents: 8_602 }];
    const [row] = planYearRows(2026, months.reverse());
    expect(row!.year).toEqual({ assignedCents: 9_501, activityCents: -2_899, availableCents: 8_602 });
    expect(row!.months[0]).toEqual({ assignedCents: 10_001, activityCents: -3_002, availableCents: 8_999 });
    expect(row!.months[2]).toEqual({ assignedCents: 0, activityCents: 0, availableCents: 0 });
  });

  it('retains later categories and conserves group/grand totals to the cent', () => {
    const months = source();
    months[5]!.envelopes = [{ categoryId: 'later', assignedCents: 1_001, activityCents: -499, availableCents: 502 }];
    months[11]!.envelopes = [
      { categoryId: 'later', assignedCents: 100, activityCents: -1, availableCents: 601 },
      { categoryId: 'other', assignedCents: 250, activityCents: -401, availableCents: -151 },
    ];
    const rows = planYearRows(2026, months);
    expect(rows.map((row) => row.id)).toEqual(['later', 'other']);
    const total = sumPlanYearRows(rows);
    expect(total.year).toEqual({ assignedCents: 1_351, activityCents: -901, availableCents: 450 });
    expect(total.months[11]).toEqual({ assignedCents: 350, activityCents: -402, availableCents: 450 });
    expect(sumPlanYearRows([]).year).toEqual({ assignedCents: 0, activityCents: 0, availableCents: 0 });
  });

  it('refuses missing, repeated, wrong-year months and duplicate envelopes', () => {
    expect(() => planYearRows(2026, source().slice(1))).toThrow('twelve distinct');
    const repeated = source();
    repeated[11] = repeated[0]!;
    expect(() => planYearRows(2026, repeated)).toThrow('twelve distinct');
    expect(() => planYearRows(2025, source())).toThrow('twelve distinct');
    const duplicate = source();
    duplicate[0]!.envelopes = [
      { categoryId: 'a', assignedCents: 1, activityCents: 0, availableCents: 1 },
      { categoryId: 'a', assignedCents: 2, activityCents: 0, availableCents: 2 },
    ];
    expect(() => planYearRows(2026, duplicate)).toThrow('Duplicate envelope');
  });
});
