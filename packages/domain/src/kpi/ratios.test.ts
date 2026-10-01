import { describe, expect, it } from 'vitest';
import type { AllocMonth } from '../ledger/alloc';
import {
  classShares,
  debtServiceRatio,
  emergencyCoverage,
  fixedCostRatio,
  lifestyleInflation,
  ratioBp,
  savingsRate,
  type MonthFlow,
} from './ratios';

describe('ratioBp', () => {
  it('rounds half away from zero and is null without a positive denominator', () => {
    expect(ratioBp(1, 3)).toBe(3333);
    expect(ratioBp(2, 3)).toBe(6667);
    expect(ratioBp(-1, 3)).toBe(-3333);
    expect(ratioBp(1, 8000)).toBe(1); // 0,5 bp rounds up
    expect(ratioBp(5, 0)).toBeNull();
    expect(ratioBp(5, -100)).toBeNull();
    expect(ratioBp(0, 100)).toBe(0);
  });
});

describe('fixedCostRatio (R10)', () => {
  it('fixed plus periodic twelfths over net income', () => {
    // 1.000 fixed + 1.200 a year periodic (100 a month) on 3.000 net income = 36,67 %
    expect(
      fixedCostRatio({
        fixedMonthlyCents: 100_000,
        periodicAnnualCents: 120_000,
        netIncomeCents: 300_000,
      }),
    ).toBe(3667);
  });

  it('keeps twelfths exact where monthly rounding would drift', () => {
    // 1 cent a year is 1/12 cent a month; rounding it away per month would give exactly 5.000
    expect(
      fixedCostRatio({ fixedMonthlyCents: 500, periodicAnnualCents: 1, netIncomeCents: 1000 }),
    ).toBe(5001);
  });

  it('is null without income', () => {
    expect(
      fixedCostRatio({ fixedMonthlyCents: 1, periodicAnnualCents: 0, netIncomeCents: 0 }),
    ).toBeNull();
  });
});

describe('debtServiceRatio (R08) and savingsRate', () => {
  it('computes in bp and handles missing income', () => {
    expect(debtServiceRatio({ loanPaymentsCents: 41_200, netIncomeCents: 381_200 })).toBe(1081);
    expect(debtServiceRatio({ loanPaymentsCents: 0, netIncomeCents: 381_200 })).toBe(0);
    expect(debtServiceRatio({ loanPaymentsCents: 100, netIncomeCents: 0 })).toBeNull();
  });

  it('savings rate can be negative', () => {
    expect(savingsRate({ incomeCents: 400_000, consumptionCents: 300_000 })).toBe(2500);
    expect(savingsRate({ incomeCents: 400_000, consumptionCents: 440_000 })).toBe(-1000);
    expect(savingsRate({ incomeCents: 0, consumptionCents: 440_000 })).toBeNull();
  });
});

describe('emergencyCoverage (R02)', () => {
  const months = (from: string, cents: number[]) =>
    cents.map((c, i) => {
      const [y, m] = from.split('-').map(Number) as [number, number];
      const idx = y * 12 + (m - 1) + i;
      return {
        month: `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`,
        cents: c,
      };
    });

  it('reserve over the average Bedarf of the last 12 full months, in tenths of a month', () => {
    // Oct 2025 to Sep 2026 at 1.500 a month; the current month (Oct 2026) is not part of it
    const spending = [
      ...months('2025-10', new Array<number>(12).fill(150_000)),
      { month: '2026-10', cents: 999_999 },
    ];
    const r = emergencyCoverage({
      reserveCents: 360_000,
      needSpending: spending,
      currentMonth: '2026-10',
    });
    expect(r).toEqual({ tenthsOfMonth: 24, averageNeedCents: 150_000, months: 12 });
  });

  it('missing months count as zero spending; a short history uses its own length', () => {
    const r = emergencyCoverage({
      reserveCents: 100_000,
      needSpending: [{ month: '2026-08', cents: 50_000 }],
      currentMonth: '2026-10',
      firstMonth: '2026-08',
    });
    // window Aug, Sep: average 250 a month
    expect(r.months).toBe(2);
    expect(r.averageNeedCents).toBe(25_000);
    expect(r.tenthsOfMonth).toBe(40);
  });

  it('is null without spending or history, and a negative reserve counts as zero', () => {
    expect(
      emergencyCoverage({ reserveCents: 5000, needSpending: [], currentMonth: '2026-10' })
        .tenthsOfMonth,
    ).toBeNull();
    const first = emergencyCoverage({
      reserveCents: 5000,
      needSpending: [],
      currentMonth: '2026-10',
      firstMonth: '2026-10',
    });
    expect(first).toEqual({ tenthsOfMonth: null, averageNeedCents: 0, months: 0 });
    const overdrawn = emergencyCoverage({
      reserveCents: -4000,
      needSpending: months('2025-10', new Array<number>(12).fill(100)),
      currentMonth: '2026-10',
    });
    expect(overdrawn.tenthsOfMonth).toBe(0);
  });
});

describe('classShares (R01)', () => {
  const month = (need: number, want: number, future: number): AllocMonth => ({
    incomeCents: 400_000,
    annualIncomeCents: 0,
    items: [
      { class: 'need', cents: need },
      { class: 'want', cents: want },
      { class: 'future', cents: future },
    ],
  });

  it('gives the month and the rolling 12 months, reusing allocation', () => {
    const byMonth: Record<string, AllocMonth> = {
      '2025-11': month(300_000, 60_000, 40_000),
      '2026-09': month(200_000, 120_000, 80_000),
      '2026-10': month(100_000, 100_000, 100_000),
    };
    const r = classShares(byMonth, '2026-10');
    expect(r.month.shares).toEqual({ need: 25, want: 25, future: 25, rest: 25 });
    // three months with data: need 600k, want 280k, future 220k of 1,2 Mio.
    expect(r.rolling12.incomeCents).toBe(1_200_000);
    expect(r.rolling12.shares).toEqual({ need: 50, want: 24, future: 18, rest: 8 });
  });

  it('a month outside the 12-month window is left out; no data gives the 100 % rest', () => {
    const r = classShares({ '2025-10': month(1, 1, 1) }, '2026-10');
    expect(r.rolling12.incomeCents).toBe(0);
    expect(r.rolling12.shares).toEqual({ need: 0, want: 0, future: 0, rest: 100 });
    expect(r.month.incomeCents).toBe(0);
  });
});

describe('lifestyleInflation (R11)', () => {
  const series = (
    prevSpend: number,
    curSpend: number,
    prevInc: number,
    curInc: number,
  ): MonthFlow[] => {
    const out: MonthFlow[] = [];
    for (let i = 0; i < 24; i++) {
      const idx = 2024 * 12 + 9 + i; // Oct 2024 to Sep 2026
      out.push({
        month: `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`,
        spendingCents: i < 12 ? prevSpend : curSpend,
        incomeCents: i < 12 ? prevInc : curInc,
      });
    }
    return out;
  };

  it('compares the last 12 months with the 12 before', () => {
    const r = lifestyleInflation(series(200_000, 206_200, 400_000, 407_600), '2026-09');
    expect(r).toEqual({ spendingGrowthBp: 310, incomeGrowthBp: 190, exceeds: true });
    const ok = lifestyleInflation(series(200_000, 200_000, 400_000, 420_000), '2026-09');
    expect(ok.exceeds).toBe(false);
    expect(ok.spendingGrowthBp).toBe(0);
  });

  it('is unknown without a base period', () => {
    const r = lifestyleInflation(series(200_000, 210_000, 400_000, 410_000).slice(12), '2026-09');
    expect(r).toEqual({ spendingGrowthBp: null, incomeGrowthBp: null, exceeds: null });
    const noIncomeBefore = lifestyleInflation(series(200_000, 210_000, 0, 410_000), '2026-09');
    expect(noIncomeBefore.incomeGrowthBp).toBeNull();
    expect(noIncomeBefore.exceeds).toBeNull();
  });

  it('negative growth', () => {
    const r = lifestyleInflation(series(200_000, 190_000, 400_000, 400_000), '2026-09');
    expect(r.spendingGrowthBp).toBe(-500);
    expect(r.exceeds).toBe(false);
  });
});
