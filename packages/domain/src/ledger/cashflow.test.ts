import { describe, expect, it } from 'vitest';
import {
  cashflowChartMonths,
  cashflowMonth,
  cashflowTotals,
  cashflowWindow,
  lastFullMonth,
} from './cashflow';

const month = (m: string, income: number, need: number, want: number, future = 0, capital = 0) =>
  cashflowMonth({
    month: m,
    incomeCents: income,
    needCents: need,
    wantCents: want,
    futureCents: future,
    capitalCents: capital,
  });

describe('cashflowMonth', () => {
  it('net = income − (Bedarf + Wunsch); Zukunft and Kapitalerträge change nothing', () => {
    const m = month('2026-08', 400_000, 250_000, 80_000, 60_000, 12_345);
    expect(m.consumptionCents).toBe(330_000);
    expect(m.netCents).toBe(70_000);
    expect(month('2026-08', 400_000, 250_000, 80_000, 0, 0).netCents).toBe(m.netCents);
  });

  it('can be negative', () => {
    expect(month('2026-08', 100_000, 90_000, 30_000).netCents).toBe(-20_000);
  });
});

describe('cashflowTotals', () => {
  it('adds up the window, counts positive months and keeps Kapitalerträge apart', () => {
    const months = [
      month('2026-06', 400_000, 250_000, 80_000, 60_000, 1_000),
      month('2026-07', 300_000, 250_000, 80_000, 0, 2_000),
      month('2026-08', 400_000, 250_000, 70_000, 30_000, 3_000),
    ];
    const t = cashflowTotals(months);
    expect(t).toMatchObject({
      months: 3,
      incomeCents: 1_100_000,
      needCents: 750_000,
      wantCents: 230_000,
      consumptionCents: 980_000,
      netCents: 120_000,
      futureCents: 90_000,
      capitalCents: 6_000,
      positiveMonths: 2,
    });
    expect(t.incomeCents - t.consumptionCents).toBe(t.netCents);
  });

  it('is empty for no months', () => {
    expect(cashflowTotals([])).toMatchObject({ months: 0, netCents: 0, positiveMonths: 0 });
  });
});

describe('windows', () => {
  it('the running month is never complete, the last day of a month closes it', () => {
    expect(lastFullMonth('2026-09-17')).toBe('2026-08');
    expect(lastFullMonth('2026-09-30')).toBe('2026-09');
    expect(lastFullMonth('2027-01-02')).toBe('2026-12');
  });

  it('Zeitraum to full months, clamped to the first month', () => {
    const t = '2026-09-17';
    expect(cashflowWindow('1M', t, '2023-10')).toEqual(['2026-08']);
    expect(cashflowWindow('3M', t, '2023-10')).toEqual(['2026-06', '2026-07', '2026-08']);
    expect(cashflowWindow('YTD', t, '2023-10')).toHaveLength(8);
    expect(cashflowWindow('YTD', t, '2023-10')[0]).toBe('2026-01');
    expect(cashflowWindow('1J', t, '2023-10')).toHaveLength(12);
    expect(cashflowWindow('1J', t, '2023-10')[0]).toBe('2025-09');
    expect(cashflowWindow('3J', t, '2020-01')).toHaveLength(36);
    expect(cashflowWindow('3J', t, '2023-10')).toHaveLength(35);
    expect(cashflowWindow('Alles', t, '2023-10')[0]).toBe('2023-10');
    expect(cashflowWindow('Alles', t, '2023-10').at(-1)).toBe('2026-08');
    expect(cashflowWindow('3J', t, '2026-05')).toEqual([
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
    ]);
  });

  it('YTD in January falls back to the last full month; nothing before the first month', () => {
    expect(cashflowWindow('YTD', '2027-01-10', '2023-10')).toEqual(['2026-12']);
    expect(cashflowWindow('1M', '2026-09-17', '2026-09')).toEqual([]);
  });

  it('charts show at least six months: a short window widens to the last 12', () => {
    const t = '2026-09-17';
    expect(cashflowChartMonths(cashflowWindow('3M', t, '2023-10'), t, '2023-10')).toHaveLength(12);
    expect(cashflowChartMonths(cashflowWindow('1J', t, '2023-10'), t, '2023-10')).toHaveLength(12);
    expect(cashflowChartMonths(cashflowWindow('3M', t, '2026-04'), t, '2026-04')).toEqual([
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
    ]);
    expect(cashflowChartMonths([], t, '2026-09')).toEqual([]);
  });
});
