import { describe, expect, it } from 'vitest';
import {
  contractBinding,
  contractSeries,
  contractVersionOn,
  contractsOverview,
  type ContractSource,
  type FxLookup,
} from './contracts';

const source = (patch: Partial<ContractSource> & { id: string }): ContractSource => ({
  name: patch.id,
  groupName: 'Wohnen',
  categoryId: `cat-${patch.id}`,
  categoryName: patch.id,
  class: 'need',
  categoryKind: 'fixed',
  categoryStage: 1,
  rhythm: 'monthly',
  startDate: null,
  endDate: null,
  versions: [{ validFrom: '2023-10-01', amountCents: 10_000, currency: 'EUR' }],
  ...patch,
});

const noRate: FxLookup = () => null;
const usd: FxLookup = (currency) => (currency === 'USD' ? 920_000 : null);

describe('contractBinding', () => {
  it('selects fixed costs, minimum loan payments and periodic costs like rule R10', () => {
    expect(contractBinding({ categoryKind: 'fixed', categoryStage: 1 })).toBe('fixed');
    expect(contractBinding({ categoryKind: 'debt', categoryStage: 1 })).toBe('fixed');
    expect(contractBinding({ categoryKind: 'debt', categoryStage: null })).toBe('fixed');
    expect(contractBinding({ categoryKind: 'debt', categoryStage: 6 })).toBeNull();
    expect(contractBinding({ categoryKind: 'periodic', categoryStage: 4 })).toBe('periodic');
    expect(contractBinding({ categoryKind: 'variable', categoryStage: 2 })).toBeNull();
    expect(contractBinding({ categoryKind: 'invest', categoryStage: 8 })).toBeNull();
    expect(contractBinding({ categoryKind: null, categoryStage: null })).toBeNull();
  });
});

describe('contractsOverview', () => {
  const asOf = '2026-09-17';
  const sources = [
    source({
      id: 'miete',
      versions: [
        { validFrom: '2023-10-01', amountCents: 89_000, currency: 'EUR' },
        { validFrom: '2026-01-01', amountCents: 98_000, currency: 'EUR' },
      ],
    }),
    source({
      id: 'quartal',
      rhythm: 'quarterly',
      versions: [{ validFrom: '2023-10-01', amountCents: 3_000, currency: 'EUR' }],
    }),
    source({
      id: 'jahr',
      categoryKind: 'periodic',
      rhythm: 'yearly',
      groupName: 'Versicherungen',
      versions: [{ validFrom: '2023-10-01', amountCents: 48_600, currency: 'EUR' }],
    }),
    source({
      id: 'ki',
      groupName: 'Abos',
      class: 'want',
      versions: [{ validFrom: '2024-06-01', amountCents: 2_000, currency: 'USD' }],
    }),
    source({ id: 'alt', endDate: '2025-12-31' }),
    source({ id: 'spar', categoryKind: 'saving' }),
    source({ id: 'zukunft', startDate: '2027-01-01' }),
  ];
  const overview = contractsOverview(asOf, sources, usd);

  it('counts only contracts in force, with monthly and yearly equivalents', () => {
    expect(overview.items.map((i) => i.id)).toEqual(['miete', 'quartal', 'jahr', 'ki']);
    const by = Object.fromEntries(overview.items.map((i) => [i.id, i]));
    expect(by['miete']).toMatchObject({
      eurCents: 98_000,
      monthlyCents: 98_000,
      yearlyCents: 1_176_000,
    });
    expect(by['quartal']).toMatchObject({ monthlyCents: 1_000, yearlyCents: 12_000 });
    expect(by['jahr']).toMatchObject({
      monthlyCents: 4_050,
      yearlyCents: 48_600,
      binding: 'periodic',
    });
  });
  it('keeps the original amount of a foreign currency and converts at the rate of the day', () => {
    const ki = overview.items.find((i) => i.id === 'ki');
    expect(ki).toMatchObject({
      currency: 'USD',
      nativeCents: 2_000,
      eurCents: 1_840,
      rateMicro: 920_000,
    });
  });
  it('chains fixed per month plus periodic over twelve to the bound amount', () => {
    expect(overview.fixedMonthlyCents).toBe(98_000 + 1_000 + 1_840);
    expect(overview.periodicAnnualCents).toBe(48_600);
    expect(overview.boundMonthlyCents).toBe(overview.fixedMonthlyCents + 4_050);
    expect(overview.yearlyCents).toBe(overview.fixedMonthlyCents * 12 + 48_600);
    expect(overview.groups).toEqual(['Wohnen', 'Versicherungen', 'Abos']);
  });
  it('flags a foreign contract without rate instead of guessing and leaves it out of the sums', () => {
    const partial = contractsOverview(asOf, sources, noRate);
    const ki = partial.items.find((i) => i.id === 'ki');
    expect(ki).toMatchObject({ eurCents: null, monthlyCents: null, nativeCents: 2_000 });
    expect(partial.unconvertedCount).toBe(1);
    expect(partial.fixedMonthlyCents).toBe(99_000);
  });
  it('reports a price increase of the last twelve months with its yearly effect', () => {
    const recent = contractsOverview('2026-03-01', sources, usd).items.find(
      (i) => i.id === 'miete',
    );
    expect(recent?.recentIncrease).toEqual({
      from: '2026-01-01',
      changeBp: 1011,
      yearlyEffectCents: 108_000,
    });
    const later = contractsOverview('2027-03-01', sources, usd);
    expect(later.items.find((i) => i.id === 'miete')?.recentIncrease).toBeNull();
    expect(overview.items.find((i) => i.id === 'miete')?.changes).toHaveLength(2);
  });
});

describe('contractSeries', () => {
  const sources = [
    source({
      id: 'miete',
      versions: [
        { validFrom: '2023-10-01', amountCents: 80_000, currency: 'EUR' },
        { validFrom: '2024-02-01', amountCents: 90_000, currency: 'EUR' },
      ],
    }),
    source({
      id: 'neu',
      startDate: '2024-01-10',
      versions: [{ validFrom: '2024-01-01', amountCents: 5_000, currency: 'EUR' }],
    }),
    source({ id: 'jahr', categoryKind: 'periodic' }),
  ];
  const series = contractSeries(sources, '2023-12', '2024-03', usd);
  it('values fixed and periodic contracts by their monthly equivalent', () => {
    expect(series.points).toEqual([
      { month: '2023-12', fixedMonthlyCents: 90_000 },
      { month: '2024-01', fixedMonthlyCents: 95_000 },
      { month: '2024-02', fixedMonthlyCents: 105_000 },
      { month: '2024-03', fixedMonthlyCents: 105_000 },
    ]);
    expect(series.partial).toBe(false);
  });
  it('marks price changes and new contracts, not the first version before the window', () => {
    expect(series.markers.map((m) => m.month)).toEqual(['2024-01', '2024-02']);
    expect(series.markers[1]?.entries[0]).toMatchObject({
      name: 'miete',
      previousCents: 80_000,
      amountCents: 90_000,
    });
    expect(series.markers[0]?.entries[0]).toMatchObject({ name: 'neu', previousCents: null });
  });
  it('is partial when a rate is missing on a day', () => {
    const usdSource = source({
      id: 'ki',
      versions: [{ validFrom: '2023-10-01', amountCents: 2_000, currency: 'USD' }],
    });
    const r = contractSeries([usdSource], '2024-01', '2024-02', noRate);
    expect(r.partial).toBe(true);
    expect(r.points[0]?.fixedMonthlyCents).toBe(0);
  });
});

describe('contractVersionOn', () => {
  const v = (validFrom: string, amountCents: number) => ({ validFrom, amountCents });
  const monthly = { rhythm: 'monthly' as const, startDate: null, endDate: null };

  it('returns the version in force on the day', () => {
    const versions = [v('2025-01-01', 100), v('2026-03-01', 120)];
    expect(contractVersionOn(monthly, versions, '2026-02-15')?.amountCents).toBe(100);
    expect(contractVersionOn(monthly, versions, '2026-03-01')?.amountCents).toBe(120);
  });

  it('values a payment whose first due date is ahead with its first version, within one cycle', () => {
    const versions = [v('2026-10-05', 1_999)];
    const p = { rhythm: 'monthly' as const, startDate: '2026-10-05', endDate: null };
    expect(contractVersionOn(p, versions, '2026-10-03')?.amountCents).toBe(1_999);
    expect(contractVersionOn(p, versions, '2026-09-03')).toBeUndefined();
    const yearly = { rhythm: 'yearly' as const, startDate: '2027-02-16', endDate: null };
    expect(contractVersionOn(yearly, [v('2027-02-16', 8_040)], '2026-10-03')?.amountCents).toBe(
      8_040,
    );
    expect(contractVersionOn(yearly, [v('2027-02-16', 8_040)], '2026-01-01')).toBeUndefined();
  });

  it('keeps the older price while a new payment start is ahead and ignores ended payments', () => {
    const versions = [v('2025-01-01', 100)];
    const restart = { rhythm: 'monthly' as const, startDate: '2026-10-20', endDate: null };
    expect(contractVersionOn(restart, versions, '2026-10-03')?.amountCents).toBe(100);
    const ended = { rhythm: 'monthly' as const, startDate: null, endDate: '2026-06-30' };
    expect(contractVersionOn(ended, versions, '2026-10-03')).toBeUndefined();
    expect(contractVersionOn(monthly, [], '2026-10-03')).toBeUndefined();
  });
});
