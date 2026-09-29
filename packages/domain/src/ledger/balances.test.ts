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

describe('opening-date rule (C5, same rule as the SQL read model)', () => {
  // Account opened after the start date 01.10.2023, with history before its opening date.
  const late = [{ id: 'tg', openingBalanceCents: 50000, openingDate: '2024-03-15' }];
  const history = [
    { accountId: 'tg', date: '2024-03-01', amountCents: 7000 },
    { accountId: 'tg', date: '2024-03-15', amountCents: -1000 },
    { accountId: 'tg', date: '2024-04-02', amountCents: 2500 },
  ];

  it('is 0 before the opening date, then opening balance plus bookings from that day on', () => {
    const on = (asOf?: string) => accountBalances(late, history, asOf).get('tg');
    expect(on('2023-10-31')).toBe(0);
    expect(on('2024-03-14')).toBe(0);
    expect(on('2024-03-15')).toBe(49000);
    expect(on('2024-03-31')).toBe(49000);
    expect(on('2024-04-30')).toBe(51500);
    expect(on()).toBe(51500);
  });

  it('balanceSeries follows the same rule', () => {
    const dates = ['2024-02-29', '2024-03-14', '2024-03-15', '2024-04-30'];
    expect(balanceSeries(late, history, dates).map((s) => s.balances.get('tg'))).toEqual([
      0, 0, 49000, 51500,
    ]);
  });
});
