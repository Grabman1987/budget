import { describe, expect, it } from 'vitest';
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
  const split = (income: number, consumption: number, invested: number | null) =>
    yearSavingsSplit({
      incomeCents: income,
      consumptionCents: consumption,
      investedCents: invested,
    });
  it('literal split: saved 600000 of 3000000 = 2000 bp, invested 100000 = 333 bp, rest 1667 bp', () => {
    expect(split(3_000_000, 2_400_000, 100_000)).toEqual({
      savedCents: 600_000,
      totalBp: 2000,
      investedCents: 100_000,
      cashCents: 500_000,
      investedBp: 333,
      cashBp: 1667,
    });
  });
  it('negative invested (net withdrawal) gives a rest above the Sparquote', () => {
    expect(split(3_000_000, 2_400_000, -50_000)).toEqual({
      savedCents: 600_000,
      totalBp: 2000,
      investedCents: -50_000,
      cashCents: 650_000,
      investedBp: -167,
      cashBp: 2167,
    });
  });
  it('invested above saved gives a negative rest (cash was used)', () => {
    expect(split(1_000_000, 900_000, 250_000)).toEqual({
      savedCents: 100_000,
      totalBp: 1000,
      investedCents: 250_000,
      cashCents: -150_000,
      investedBp: 2500,
      cashBp: -1500,
    });
  });
  it.each([
    [3_333_333, 2_000_000, 777_777],
    [1_234_567, 987_654, 1_000_000],
  ])('parts always add up exactly (%i / %i / %i)', (income, consumption, invested) => {
    const s = split(income, consumption, invested)!;
    expect(s.investedBp! + s.cashBp!).toBe(s.totalBp);
    expect(s.investedCents! + s.cashCents!).toBe(s.savedCents);
  });
  it('keeps the total without investment figures; null without income', () => {
    expect(split(10_000, 5_000, null)).toEqual({
      savedCents: 5_000,
      totalBp: 5000,
      investedCents: null,
      cashCents: null,
      investedBp: null,
      cashBp: null,
    });
    expect(split(0, 5, 1)).toBeNull();
  });
});
