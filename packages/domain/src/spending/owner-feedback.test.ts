import { describe, expect, it } from 'vitest';
import { monthsBetween } from '../date';
import {
  contractBinding,
  contractsOverview,
  contractSeries,
  type ContractSource,
} from './contracts';
import {
  personalInflation,
  implicitContractRhythm,
  trailingPriceLevels,
  useTrailingMean,
  type InflationItem,
} from './inflation';
import { deduplicatePreviewSources } from '../schedule/payments-preview';
import { goalSollCents } from '../goals';
import { paceModel } from '../kpi/pace';

const months = monthsBetween('2023-01', '2026-03');
const item = (
  id: string,
  categoryId: string,
  from: number,
  to: number,
  price: number,
): InflationItem => ({
  id,
  name: id,
  categoryId,
  categoryName: categoryId,
  rhythm: 'monthly',
  source: 'bookings',
  class: 'need',
  level: Object.fromEntries(months.map((m, i) => [m, i >= from && i <= to ? price : null])),
  spend: Object.fromEntries(months.map((m, i) => [m, i >= from && i <= to ? price : 0])),
});

describe('owner report feedback with synthetic prices', () => {
  it('new subscriptions enter without quantity inflation; contributions conserve the headline', () => {
    const result = personalInflation({
      available: months,
      items: [item('existing', 'rent', 0, 38, 60_000), item('new', 'phone', 1, 38, 2_000)],
      baseConsumptionCents: 744_000,
    });
    expect(result.points.every((p) => p.index === 100)).toBe(true);
    expect(result.basketItems).toBe(2);
    expect(result.contributionSumBp).toBe(result.inflationBp);
  });
  it('rent successor at month 28 carries the old price and later steps still count', () => {
    const successor = item('manager-b', 'rent', 27, 38, 54_000);
    successor.level = {
      ...successor.level,
      '2026-01': 59_400,
      '2026-02': 59_400,
      '2026-03': 59_400,
    };
    const result = personalInflation({
      available: months,
      items: [item('manager-a', 'rent', 0, 26, 60_000), successor],
      baseConsumptionCents: 720_000,
    });
    expect(result.points[26]?.index).toBe(100);
    expect(result.points[27]?.index).toBe(90);
    expect(result.points[36]?.index).toBe(99);
    expect(result.basketItems).toBe(1);
    expect(result.basket[0]?.successors).toEqual(['manager-b']);
    expect(result.basket[0]).toMatchObject({ baseCents: 60_000, nowCents: 59_400, changeBp: -100 });
    expect(result.contributionSumBp).toBe(result.inflationBp);
  });
  it('recognizes implicit monthly contracts, rejects sparse and irregular charges', () => {
    const charges = months.slice(0, 8).map((m) => ({ date: `${m}-03`, amountCents: -4_000 }));
    expect(implicitContractRhythm(charges)).toBe('monthly');
    expect(implicitContractRhythm(charges.slice(0, 5))).toBeNull();
    expect(
      implicitContractRhythm(
        charges.map((c, i) => ({ ...c, date: `2023-01-${String(i + 1).padStart(2, '0')}` })),
      ),
    ).toBeNull();
  });
  it('spreads parallel utility charges, settlements and credits across twelve months; overrides win', () => {
    const charges = months.slice(0, 14).flatMap((m) => [
      { date: `${m}-03`, amountCents: -6_000, payeeId: 'supplier' },
      { date: `${m}-10`, amountCents: -3_000, payeeId: 'grid' },
    ]);
    charges.push({ date: '2024-01-20', amountCents: -12_000, payeeId: 'supplier' });
    charges.push({ date: '2024-02-20', amountCents: 6_000, payeeId: 'supplier' });
    expect(useTrailingMean(charges, null)).toBe(true);
    expect(useTrailingMean(charges, false)).toBe(false);
    expect(useTrailingMean([], true)).toBe(true);
    const successor = months.slice(0, 14).map((m, i) => ({
      date: `${m}-03`,
      amountCents: i === 13 ? -30_000 : -6_000,
      payeeId: i < 8 ? 'supplier-a' : 'supplier-b',
    }));
    expect(useTrailingMean(successor, null)).toBe(true);
    expect(
      useTrailingMean(
        [
          { date: '2023-01-01', amountCents: -6_000, payeeId: 'a' },
          { date: '2023-01-02', amountCents: -6_000, payeeId: 'b' },
          { date: '2023-02-01', amountCents: -6_000, payeeId: 'a' },
          { date: '2023-03-01', amountCents: -30_000, payeeId: 'a' },
        ],
        null,
      ),
    ).toBe(false);
    const levels = trailingPriceLevels(months, charges);
    expect(levels['2023-11']).toBeNull();
    expect(levels['2023-12']).toBe(9_000);
    expect(levels['2024-01']).toBe(10_000);
    expect(levels['2024-02']).toBe(9_500);
  });
  it('year verdict is personal minus reference, December versus December', () => {
    const rent = item('rent', 'rent', 0, 38, 60_000);
    const reference = Object.fromEntries(months.map((m, i) => [m, i < 12 ? 100 : 102]));
    const result = personalInflation({
      available: months,
      items: [rent],
      baseConsumptionCents: 720_000,
      reference,
    });
    expect(result.years.find((y) => y.year === 2024)).toMatchObject({
      ownChangeBp: 0,
      referenceChangeBp: 200,
      differenceBp: -200,
    });
    expect(result.years.find((y) => y.year === 2026)?.throughMonth).toBe('2026-03');
    expect(result.years[0]?.ownChangeBp).toBeNull();
  });
  it('excludes any ended or end-dated obligation from binding, uses stored current amounts with derived history', () => {
    expect(
      contractBinding({ categoryKind: 'fixed', categoryStage: null, endDate: '2027-01-01' }),
    ).toBeNull();
    expect(
      contractBinding({ categoryKind: 'fixed', categoryStage: null, rhythm: 'once' }),
    ).toBeNull();
    const source: ContractSource = {
      id: 'phone',
      name: 'Phone',
      groupName: 'Communication',
      categoryId: 'phone',
      categoryName: 'Phone',
      class: 'need',
      categoryKind: 'fixed',
      categoryStage: null,
      rhythm: 'monthly',
      startDate: '2025-01-20',
      endDate: null,
      versions: [
        { validFrom: '2025-01-20', amountCents: 1_000, currency: 'EUR' },
        { validFrom: '2026-01-20', amountCents: 1_500, currency: 'EUR' },
      ],
      currentVersions: [{ validFrom: '2026-10-01', amountCents: 1_600, currency: 'EUR' }],
    };
    const result = contractsOverview('2026-09-17', [source], () => null);
    expect(result.boundMonthlyCents).toBe(1_600);
    expect(result.items[0]?.recentIncrease?.changeBp).toBe(5_000);
    expect(
      contractSeries([source], '2025-01', '2026-02', () => null).points[0]?.fixedMonthlyCents,
    ).toBe(1_000);
  });
  it('deduplicates one transfer against one identical savings execution without guessing missing identities', () => {
    const plan = {
      id: 'plan',
      name: 'Savings',
      date: '2026-11-03',
      amountCents: 10_000,
      currency: 'EUR',
      sourceAccountId: 'giro',
      targetAccountId: 'reserve',
      source: 'savings' as const,
    };
    const transfer = { ...plan, id: 'transfer', source: 'transfer' as const };
    expect(deduplicatePreviewSources([plan, transfer]).map((s) => s.id)).toEqual(['transfer']);
    expect(deduplicatePreviewSources([plan, { ...plan, id: 'second' }, transfer])).toHaveLength(2);
    expect(deduplicatePreviewSources([{ ...plan, targetAccountId: null }, transfer])).toHaveLength(
      2,
    );
  });
  it('linear target is bounded; early pace includes open fixed costs and unspent variable plan', () => {
    expect(goalSollCents(120_000, '2026-01', '2027-01', '2026-07')).toBe(60_000);
    expect(goalSollCents(120_000, '2026-01', '2027-01', '2025-12')).toBe(0);
    expect(goalSollCents(120_000, '2026-01', '2027-01', '2027-02')).toBe(120_000);
    const input = {
      month: '2026-09',
      today: '2026-09-01',
      limitCents: 100_000,
      fixedSpentCents: 0,
      fixed: [{ day: '2026-09-20', cents: 60_000, settled: false }],
      spending: [{ day: '2026-09-01', cents: 5_000 }],
    };
    const early = paceModel(input);
    expect(early.figures.forecastEndCents).toBe(100_000);
    expect(early.figures.forecastAvailable).toBe(true);
    expect(paceModel({ ...input, limitCents: 0 }).figures.forecastAvailable).toBe(true);
    expect(paceModel({ ...input, today: '2026-09-07' }).figures.forecastEndCents).toBe(81_429);
  });
});
