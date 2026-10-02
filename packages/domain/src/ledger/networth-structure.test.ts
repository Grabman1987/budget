import { describe, expect, it } from 'vitest';
import {
  historyDays,
  structureOf,
  structureRows,
  structureTotal,
  type Structure,
} from './networth-structure';

const types: Record<string, string> = {
  giro: 'checking',
  tg: 'savings',
  depot: 'brokerage',
  card: 'credit_card',
  loan: 'loan',
};

describe('structureOf', () => {
  it('splits every type into balances above and below zero and adds up to the total', () => {
    const s = structureOf(
      { giro: 120_000, tg: 500_000, depot: 800_000, card: -45_000, loan: -300_000 },
      (id) => types[id],
    );
    expect(s['checking']).toEqual({ assetsCents: 120_000, debtsCents: 0 });
    expect(s['credit_card']).toEqual({ assetsCents: 0, debtsCents: -45_000 });
    expect(structureTotal(s)).toBe(120_000 + 500_000 + 800_000 - 45_000 - 300_000);
  });

  it('an overpaid card counts above zero, a negative account below, in the same type', () => {
    const s = structureOf({ a: 5_000, b: -2_000 }, () => 'credit_card');
    expect(s['credit_card']).toEqual({ assetsCents: 5_000, debtsCents: -2_000 });
  });

  it('refuses an account without a type', () => {
    expect(() => structureOf({ x: 1 }, () => undefined)).toThrow(RangeError);
  });
});

describe('structureRows', () => {
  const start: Structure = {
    savings: { assetsCents: 100_000, debtsCents: 0 },
    brokerage: { assetsCents: 300_000, debtsCents: 0 },
    loan: { assetsCents: 0, debtsCents: -200_000 },
  };
  const now: Structure = {
    savings: { assetsCents: 150_000, debtsCents: 0 },
    brokerage: { assetsCents: 450_000, debtsCents: 0 },
    loan: { assetsCents: 0, debtsCents: -150_000 },
    crypto: { assetsCents: 0, debtsCents: 0 },
  };
  const rows = structureRows(start, now);

  it('lists assets before liabilities with change and shares of the assets; empty types vanish', () => {
    expect(rows.map((r) => r.key)).toEqual(['brokerage', 'savings', 'loan']);
    expect(rows[0]).toMatchObject({
      startCents: 300_000,
      nowCents: 450_000,
      deltaCents: 150_000,
      shareBp: 7500,
    });
    expect(rows[1]?.shareBp).toBe(2500);
    expect(rows[2]).toMatchObject({ liability: true, shareBp: null, deltaCents: 50_000 });
  });

  it('the change of all rows equals the change of the net worth', () => {
    expect(rows.reduce((a, r) => a + r.deltaCents, 0)).toBe(
      structureTotal(now) - structureTotal(start),
    );
  });
});

describe('historyDays', () => {
  it('weekly: from, every 7 days, always the last day', () => {
    expect(historyDays('2026-09-01', '2026-09-17', 'week')).toEqual([
      '2026-09-01',
      '2026-09-08',
      '2026-09-15',
      '2026-09-17',
    ]);
    expect(historyDays('2026-09-01', '2026-09-15', 'week')).toEqual([
      '2026-09-01',
      '2026-09-08',
      '2026-09-15',
    ]);
  });

  it('monthly: from, every month end inside the window, the last day', () => {
    expect(historyDays('2025-12-31', '2026-03-17', 'month')).toEqual([
      '2025-12-31',
      '2026-01-31',
      '2026-02-28',
      '2026-03-17',
    ]);
    expect(historyDays('2026-02-10', '2026-02-28', 'month')).toEqual(['2026-02-10', '2026-02-28']);
  });
});
