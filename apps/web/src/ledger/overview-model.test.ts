import { valuationMissingText } from './labels';
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
  interestKind: null,
  installmentCents: null,
  termStart: null,
  originalAmountCents: null,
  sortOrder: 1,
  closedAt: null,
  note: null,
  balanceCents: 0,
  clearedCents: 0,
  unclearedCents: 0,
  scheduledCents: 0,
  holdingsCents: 0,
  valueEurCents: 0,
  missingFxCurrencies: [],
  missingPriceSecurityIds: [],
  bookingCount: 0,
  pendingCount: 0,
  lastReconciledOn: null,
  ...over,
});

describe('overviewModel', () => {
  it('orders the groups like YNAB and keeps the owner order inside each', () => {
    const model = overviewModel([
      account({
        id: 'depot',
        type: 'brokerage',
        role: 'investment',
        onBudget: false,
        sortOrder: 1,
      }),
      account({ id: 'kredit', type: 'loan', role: 'debt', onBudget: false, sortOrder: 2 }),
      account({ id: 'karte', type: 'credit_card', role: 'budget', sortOrder: 3 }),
      account({ id: 'bar', type: 'cash', sortOrder: 9, name: 'Bar' }),
      account({ id: 'giro', type: 'checking', sortOrder: 4, name: 'Giro' }),
      account({ id: 'tages', type: 'savings', role: 'reserve', sortOrder: 5 }),
      account({ id: 'reise', type: 'cash', role: 'reserve', onBudget: false, sortOrder: 6 }),
      account({ id: 'alt', type: 'checking', closedAt: '2026-01-01', sortOrder: 0 }),
    ]);
    expect(model.groups.map((g) => [g.group.title, g.accounts.map((a) => a.id)])).toEqual([
      ['Budget-Konten', ['giro', 'tages', 'bar']],
      ['Kreditkarten', ['karte']],
      ['Kredite', ['kredit']],
      ['Investments', ['depot', 'reise']],
    ]);
    expect(model.closed.map((a) => a.id)).toEqual(['alt']);
  });

  it('groups open accounts in chain order and uses their EUR values', () => {
    const model = overviewModel([
      account({ id: 'g', balanceCents: 150_000, valueEurCents: 150_000 }),
      account({
        id: 'd',
        role: 'investment',
        type: 'brokerage',
        balanceCents: 500,
        holdingsCents: 7_900_000,
        valueEurCents: 7_900_500,
      }),
      account({
        id: 'k',
        role: 'debt',
        type: 'loan',
        balanceCents: -1_200_000,
        valueEurCents: -1_200_000,
      }),
      account({ id: 'x', balanceCents: 0, closedAt: '2026-05-01', valueEurCents: 0 }),
    ]);
    expect(model.groups.map((g) => [g.group.id, g.sumCents])).toEqual([
      ['budget', 150_000],
      ['loans', -1_200_000],
      ['investments', 7_900_500],
    ]);
    expect(model.netWorthCents).toBe(150_000 + 7_900_500 - 1_200_000);
    expect(model.closed.map((a) => a.id)).toEqual(['x']);
  });

  it('values foreign cash in EUR and includes positive or negative closed residuals', () => {
    const model = overviewModel([
      account({ id: 'usd', currency: 'USD', balanceCents: 10_000, valueEurCents: 9_200 }),
      account({
        id: 'closed-plus',
        closedAt: '2026-05-01',
        balanceCents: 12_345,
        valueEurCents: 12_345,
      }),
      account({
        id: 'closed-minus',
        role: 'debt',
        closedAt: '2026-05-01',
        balanceCents: -2_000,
        valueEurCents: -2_000,
      }),
    ]);
    expect(model.groups.find((g) => g.group.id === 'budget')?.sumCents).toBe(9_200);
    expect(model.closedValueCents).toBe(10_345);
    expect(model.netWorthCents).toBe(19_545);
  });

  it('keeps the total unavailable when any account has no EUR valuation', () => {
    const model = overviewModel([
      account({ id: 'eur', balanceCents: 10_000, valueEurCents: 10_000 }),
      account({
        id: 'usd',
        currency: 'USD',
        balanceCents: 10_000,
        valueEurCents: null,
        missingFxCurrencies: ['USD'],
      }),
    ]);
    expect(model.netWorthCents).toBeNull();
    expect(model.missingFxCurrencies).toEqual(['USD']);
  });
});

describe('netWorthChange', () => {
  const now = [account({ id: 'g', balanceCents: 120_000, valueEurCents: 120_000 })];
  it('is the difference of the same accounts', () => {
    expect(
      netWorthChange(
        now,
        [account({ id: 'g', balanceCents: 100_000, valueEurCents: 100_000 })],
        '2026-08-30',
      ),
    ).toBe(20_000);
  });
  it('is null when an account was opened after the reference day', () => {
    const fresh = [account({ id: 'g', openingDate: '2026-09-15', valueEurCents: 0 })];
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

it('distinguishes unavailable market quotes from missing currency rates', () => {
  const missing = account({
    holdingsCents: null,
    valueEurCents: null,
    missingPriceSecurityIds: ['s'],
  });
  expect(overviewModel([missing])).toMatchObject({
    netWorthCents: null,
    missingPriceSecurityIds: ['s'],
    missingFxCurrencies: [],
  });
  expect(valuationMissingText(missing)).toBe('Wertpapierkurs fehlt');
  expect(valuationMissingText({ ...missing, missingFxCurrencies: ['CHF'] })).toBe(
    'Wertpapierkurs fehlt · Wechselkurs fehlt: CHF',
  );
});
