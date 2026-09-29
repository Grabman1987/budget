import { describe, expect, it } from 'vitest';
import { accountBalances, balanceSeries } from './balances';

const accounts = [
  { id: 'giro', openingBalanceCents: 100000, openingDate: '2023-10-01' },
  { id: 'kredit', openingBalanceCents: -500000, openingDate: '2023-10-01' },
];
const bookings = [
  { accountId: 'giro', date: '2023-10-01', amountCents: -2500 },
  { accountId: 'giro', date: '2023-10-30', amountCents: 350000 },
  { accountId: 'kredit', date: '2023-10-03', amountCents: 41200 },
  { accountId: 'giro', date: '2023-11-02', amountCents: -1 },
];

describe('accountBalances', () => {
  it('is the opening balance plus all bookings up to the date', () => {
    const at = accountBalances(accounts, bookings, '2023-10-31');
    expect(at.get('giro')).toBe(100000 - 2500 + 350000);
    expect(at.get('kredit')).toBe(-500000 + 41200);
  });

  it('includes everything without a date and ignores bookings before the opening date', () => {
    expect(accountBalances(accounts, bookings).get('giro')).toBe(100000 - 2500 + 350000 - 1);
    const early = accountBalances(accounts, [
      { accountId: 'giro', date: '2023-09-30', amountCents: 999 },
    ]);
    expect(early.get('giro')).toBe(100000);
  });

  it('reports accounts without bookings and rejects bookings of unknown accounts', () => {
    expect(accountBalances(accounts, []).get('kredit')).toBe(-500000);
    expect(() =>
      accountBalances(accounts, [{ accountId: 'x', date: '2024-01-01', amountCents: 1 }]),
    ).toThrow(/unknown account/i);
  });

  it('does not accept non-integer amounts (money is integer cents)', () => {
    expect(() =>
      accountBalances(accounts, [{ accountId: 'giro', date: '2024-01-01', amountCents: 1.5 }]),
    ).toThrow(RangeError);
  });
});

describe('balanceSeries', () => {
  it('returns the balance at each requested date in one pass', () => {
    const series = balanceSeries(accounts, bookings, ['2023-10-31', '2023-11-30']);
    expect(series.map((s) => s.balances.get('giro'))).toEqual([447500, 447499]);
  });
});
