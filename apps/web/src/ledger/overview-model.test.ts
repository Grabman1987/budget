import { describe, expect, it } from 'vitest';
import { netWorthChange, overviewModel, seriesChange, utilisation } from './overview-model';
import type { AccountRow } from './types';

const account = (over: Partial<AccountRow>): AccountRow => ({
  id: 'a',
  name: 'Konto',
  type: 'checking',
  role: 'budget',
  onBudget: true,
  currency: 'EUR',
  institutionId: null,
  openingBalanceCents: 0,
  openingDate: '2026-01-01',
  creditLimitCents: null,
  overdraftLimitCents: null,
  interestRateBp: null,
  termEnd: null,
  monthlyFeeCents: null,
  sortOrder: 1,
  closedAt: null,
  note: null,
  balanceCents: 0,
  clearedCents: 0,
  unclearedCents: 0,
  scheduledCents: 0,
  holdingsCents: 0,
  bookingCount: 0,
  pendingCount: 0,
  lastReconciledOn: null,
  ...over,
});

describe('overviewModel', () => {
  it('groups open accounts in chain order and adds holdings to the value', () => {
    const model = overviewModel([
      account({ id: 'g', balanceCents: 150_000 }),
      account({
        id: 'd',
        role: 'investment',
        type: 'brokerage',
        balanceCents: 500,
        holdingsCents: 7_900_000,
      }),
      account({ id: 'k', role: 'debt', type: 'loan', balanceCents: -1_200_000 }),
      account({ id: 'x', balanceCents: 0, closedAt: '2026-05-01' }),
    ]);
    expect(model.groups.map((g) => [g.group.role, g.sumCents])).toEqual([
      ['budget', 150_000],
      ['investment', 7_900_500],
      ['debt', -1_200_000],
    ]);
    expect(model.netWorthCents).toBe(150_000 + 7_900_500 - 1_200_000);
    expect(model.closed.map((a) => a.id)).toEqual(['x']);
  });
});

describe('netWorthChange', () => {
  const now = [account({ id: 'g', balanceCents: 120_000 })];
  it('is the difference of the same accounts', () => {
    expect(netWorthChange(now, [account({ id: 'g', balanceCents: 100_000 })], '2026-08-30')).toBe(
      20_000,
    );
  });
  it('is null when an account was opened after the reference day', () => {
    const fresh = [account({ id: 'g', openingDate: '2026-09-15' })];
    expect(netWorthChange(fresh, [], '2026-08-30')).toBeNull();
  });
});

describe('seriesChange and utilisation', () => {
  it('takes last minus first', () => {
    expect(
      seriesChange([
        { date: '2026-09-01', balanceCents: 100 },
        { date: '2026-09-02', balanceCents: 350 },
      ]),
    ).toBe(250);
    expect(seriesChange([])).toBe(0);
  });
  it('utilisation is the share of the limit in use, clamped', () => {
    expect(utilisation(account({ creditLimitCents: 200_000, balanceCents: -45_000 }))).toBe(0.225);
    expect(utilisation(account({ creditLimitCents: 200_000, balanceCents: 5_000 }))).toBe(0);
    expect(utilisation(account({}))).toBeNull();
  });
});
