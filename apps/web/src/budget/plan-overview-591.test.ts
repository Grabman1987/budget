import { budgetSummary, createTestDatabase } from '@budget/db';
import { describe, expect, it } from 'vitest';
import type { TargetRow } from './api';
import { monthOverviewAmounts, nextMonthPreparation } from './plan-overview-model';

const target: TargetRow = {
  id: 't',
  categoryId: 'c',
  kind: 'monthly',
  amountCents: 10000,
  everyMonths: 1,
  targetDate: null,
  dueDay: null,
  validFrom: '2026-09',
};
const envelope = (
  assignedCents: number,
  goalCents = 10000,
  needCents = Math.max(0, goalCents - assignedCents),
) => ({
  target,
  assignedCents,
  goalCents,
  needCents,
});

it('shows the canonical fixed-ledger envelope carry + assignment + activity = available in literal cents', () => {
  const opened = createTestDatabase();
  try {
    opened.sqlite.exec(`
      INSERT INTO account(id,name,type,on_budget,opening_date) VALUES('a','Synthetic cash','checking',1,'2026-09-01');
      INSERT INTO category_group(id,name) VALUES('g','Synthetic group');
      INSERT INTO category(id,name,group_id,class,kind,opening_available_cents)
        VALUES('c1','Synthetic fixed','g','need','fixed',1000),('c2','Synthetic variable','g','want','variable',600);
      INSERT INTO envelope_month(category_id,month,assigned_cents) VALUES('c1','2026-09',3000),('c2','2026-09',1600);
      INSERT INTO booking(id,account_id,date,amount_cents) VALUES('b','a','2026-09-10',-2100);
      INSERT INTO booking_split(id,booking_id,category_id,amount_cents) VALUES('s1','b','c1',-1200),('s2','b','c2',-900);
    `);
    const view = budgetSummary(opened.db, '2026-09');
    expect(monthOverviewAmounts(view.summary.envelopes)).toEqual({
      carryCents: 1600,
      assignedCents: 4600,
      activityCents: -2100,
      availableCents: 4100,
    });
    // Independent fixture arithmetic; the prior unassigned carry is a different metric.
    expect(1600 + 4600 - 2100).toBe(4100);
    expect(view.summary.carryInCents).not.toBe(1600);
  } finally {
    opened.close();
  }
});

describe('next-month canonical target coverage', () => {
  it.each([
    [[envelope(5000)], 10000, 5000, 5000, 0, 50],
    [[envelope(10000)], 10000, 10000, 0, 0, 100],
    [[envelope(12500)], 10000, 10000, 0, 2500, 100],
    [[envelope(15000), envelope(5000)], 20000, 15000, 5000, 5000, 75],
    [[envelope(99999, 100000)], 100000, 99999, 1, 0, 99],
    [[envelope(-3000)], 10000, 0, 13000, 0, 0],
  ] as const)(
    'retains every target need without offsetting it with another excess',
    (rows, goalCents, coveredCents, missingCents, excessCents, percent) => {
      expect(nextMonthPreparation(rows)).toEqual({
        targetCount: rows.length,
        goalCents,
        coveredCents,
        missingCents,
        excessCents,
        percent,
      });
    },
  );

  it('has no percentage with no targets or zero new target funding, retaining negative-assignment needs', () => {
    expect(nextMonthPreparation([{ ...envelope(10000), target: null }])).toEqual({
      targetCount: 0,
      goalCents: 0,
      coveredCents: 0,
      missingCents: 0,
      excessCents: 0,
      percent: null,
    });
    expect(nextMonthPreparation([envelope(0, 0)])).toEqual({
      targetCount: 1,
      goalCents: 0,
      coveredCents: 0,
      missingCents: 0,
      excessCents: 0,
      percent: null,
    });
    expect(nextMonthPreparation([envelope(-1, 0)])).toMatchObject({
      targetCount: 1,
      goalCents: 0,
      coveredCents: 0,
      missingCents: 1,
      percent: null,
    });
  });

  it('rejects unsafe cent figures and sums without changing canonical target amounts', () => {
    for (const invalid of [0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => nextMonthPreparation([envelope(invalid)])).toThrow(RangeError);
      expect(() =>
        monthOverviewAmounts([
          { carryCents: invalid, assignedCents: 0, activityCents: 0, availableCents: 0 },
        ]),
      ).toThrow(RangeError);
    }
    expect(() =>
      nextMonthPreparation([envelope(0, Number.MAX_SAFE_INTEGER), envelope(0, 1)]),
    ).toThrow(RangeError);
  });
});
