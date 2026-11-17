import { describe, expect, it } from 'vitest';
import { overviewSavingsRate } from './figures';
import { yearSavingsSplit, yearWealthColumns, yearWealthChange } from './year-report';

const nw = {
  startCents: 1_000_000,
  endCents: 1_120_000,
  ownCents: 90_000,
  marketCents: 30_000,
  months: [],
};

describe('yearWealthColumns', () => {
  it('splits the growth into without and with market, and with-market equals the chain change', () => {
    const c = yearWealthColumns(nw)!;
    expect(c.withoutMarket).toEqual({ deltaCents: 90_000, changeBp: 900 });
    expect(c.withMarket).toEqual({ deltaCents: 120_000, changeBp: 1200 });
    expect(c.withMarket).toEqual(yearWealthChange(nw));
    expect(c.withMarket.deltaCents - c.withoutMarket.deltaCents).toBe(nw.marketCents);
  });
  it('is null without a net worth and without a basis', () => {
    expect(yearWealthColumns(null)).toBeNull();
    expect(yearWealthColumns({ ...nw, startCents: 0 })!.withMarket.changeBp).toBeNull();
  });
});

describe('yearSavingsSplit', () => {
  it.each([
    [3_333_333, 2_000_000, 777_777],
    [3_000_000, 2_400_000, 100_000],
    [3_000_000, 2_400_000, -50_000],
    [3_000_000, 3_300_000, 0],
    [1_234_567, 987_654, 1_000_000],
  ])('parts add up to the Sparquote exactly (%i / %i / %i)', (income, consumption, invested) => {
    const s = yearSavingsSplit({
      incomeCents: income,
      consumptionCents: consumption,
      investedCents: invested,
    })!;
    expect(s.totalBp).toBe(
      overviewSavingsRate({ incomeCents: income, consumptionCents: consumption }),
    );
    expect(s.investedBp + s.cashBp).toBe(s.totalBp);
    expect(s.investedCents + s.cashCents).toBe(s.savedCents);
    expect(s.savedCents).toBe(income - consumption);
  });
  it('is null without income or without investment figures', () => {
    expect(yearSavingsSplit({ incomeCents: 0, consumptionCents: 5, investedCents: 1 })).toBeNull();
    expect(
      yearSavingsSplit({ incomeCents: 10, consumptionCents: 5, investedCents: null }),
    ).toBeNull();
  });
});
