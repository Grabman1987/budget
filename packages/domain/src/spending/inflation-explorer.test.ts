import { describe, expect, it } from 'vitest';
import { monthsBetween } from '../date';
import { categoryInflationExplorer, type InflationItem } from './inflation';

const available = monthsBetween('2023-10', '2025-10');
const levels = (after: number) =>
  Object.fromEntries(available.map((m) => [m, m < '2025-01' ? 100 : after]));
const categories = [
  { id: 'food', name: 'Lebensmittel Beispiel', coicop: [{ code: '01.1', shareBp: 10000 }] },
];
const observations = available.map((month) => ({
  month,
  cents: month < '2025-01' ? 1000 : 2200,
  count: month < '2025-01' ? 1 : 2,
}));

describe('category explorer (synthetic)', () => {
  it('separates booking-average development, sub-index difference and count contribution since budget start', () => {
    const [row] = categoryInflationExplorer({
      available,
      categories,
      items: [],
      observations: { food: observations },
      reference: levels(105),
      subindices: { '01.1': levels(105) },
    });
    expect(row!.points[0]).toEqual({ month: '2023-10', index: 100, reference: 100 });
    expect(row!.points.at(-1)).toEqual({ month: '2025-10', index: 110, reference: 105 });
    expect(row).toMatchObject({
      ownChangeBp: 1000,
      referenceChangeBp: 500,
      differenceBp: 500,
      volumeBp: 11000,
      spendingDifferenceBp: 11500,
      volumeShareBp: 9565,
      source: 'booking-average',
    });
    expect(row!.referenceLabel).toContain('Nahrungsmittel');
  });

  it('uses total CPI only without mapping; unavailable mapped history never silently falls back', () => {
    const rows = categoryInflationExplorer({
      available,
      categories: [...categories, { id: 'other', name: 'Andere Beispiel', coicop: [] }],
      items: [],
      observations: { food: observations, other: observations },
      reference: levels(103),
      subindices: {},
    });
    expect(rows[0]!.points.at(-1)!.reference).toBeNull();
    expect(rows[0]!.differenceBp).toBeNull();
    expect(rows[1]).toMatchObject({
      referenceLabel: 'Gesamt-VPI (kein Teilindex)',
      referenceChangeBp: 300,
      differenceBp: 700,
    });
  });

  it('reuses per-contract chaining for parallel prices without category-sum jumps', () => {
    const item = (id: string, level: InflationItem['level'], spend: number): InflationItem => ({
      id,
      name: id,
      categoryId: 'food',
      class: 'need',
      rhythm: 'monthly',
      source: 'stored',
      level,
      spend: Object.fromEntries(available.map((m) => [m, spend])),
    });
    const [row] = categoryInflationExplorer({
      available,
      categories,
      observations: {},
      reference: levels(105),
      subindices: { '01.1': levels(105) },
      items: [
        item('a', Object.fromEntries(available.map((m) => [m, m < '2025-01' ? 1000 : 1100])), 1000),
        item('b', Object.fromEntries(available.map((m) => [m, m < '2025-01' ? 9000 : 9000])), 1000),
      ],
    });
    expect(row!.points.at(-1)!.index).toBe(105);
    expect(row!.differenceBp).toBe(0);
    expect(row!.volumeBp).toBeNull();
  });

  it('attributes recorded units rather than booking counts when the physical quantity is complete', () => {
    const [row] = categoryInflationExplorer({
      available,
      categories,
      items: [],
      observations: {
        food: available.map((month) => ({
          month,
          cents: month < '2025-01' ? 1000 : 2400,
          count: 1,
          units: month < '2025-01' ? 100_000_000 : 200_000_000,
        })),
      },
      reference: levels(105),
      subindices: { '01.1': levels(105) },
    });
    expect(row).toMatchObject({
      source: 'unit-price',
      ownChangeBp: 2000,
      differenceBp: 1500,
      volumeBp: 12000,
      spendingDifferenceBp: 13500,
      volumeShareBp: 8889,
    });
  });

  it('does not invent an October 2023 baseline or divide by a zero cost difference', () => {
    const [missing] = categoryInflationExplorer({
      available: available.slice(1),
      categories,
      items: [],
      observations: { food: observations },
      reference: levels(105),
      subindices: {},
    });
    expect(missing!.points).toEqual([]);
    const [same] = categoryInflationExplorer({
      available,
      categories,
      items: [],
      observations: { food: available.map((month) => ({ month, cents: 1000, count: 1 })) },
      reference: levels(100),
      subindices: { '01.1': levels(100) },
    });
    expect(same!.volumeBp).toBe(0);
    expect(same!.volumeShareBp).toBeNull();
  });
});
