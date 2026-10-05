import { describe, expect, it } from 'vitest';
import {
  allocationTimeline,
  NO_REGION,
  parseRegionWeights,
  splitByRegion,
  compositionGroups,
} from './allocation-report';
import type { WealthPosition } from './types';

it('groups classified cents without changing shares; target-only classes contribute to group Soll', () => {
  const rows = [
    {
      assetClassId: 'a',
      name: 'Klasse A',
      valueCents: 101,
      shareBp: 5050,
      portfolioValueCents: 101,
      portfolioShareBp: 2525,
      targetBp: 2000,
      products: [],
    },
    {
      assetClassId: 'b',
      name: 'Klasse B',
      valueCents: 99,
      shareBp: 4950,
      portfolioValueCents: 99,
      portfolioShareBp: 2475,
      targetBp: null,
      products: [],
    },
    {
      assetClassId: 'c',
      name: 'Klasse C',
      valueCents: 0,
      shareBp: 0,
      portfolioValueCents: 0,
      portfolioShareBp: 0,
      targetBp: 1000,
      products: [],
    },
  ];
  const groups = compositionGroups(rows, [
    { id: 'g', name: 'Gruppe A', parentId: null },
    { id: 'a', name: 'Klasse A', parentId: 'g' },
    { id: 'c', name: 'Klasse C', parentId: 'g' },
  ]);
  expect(
    groups.map((g) => [
      g.name,
      g.valueCents,
      g.shareBp,
      g.portfolioShareBp,
      g.targetBp,
      g.deviationBp,
      g.targetComplete,
    ]),
  ).toEqual([
    ['Gruppe A', 101, 5050, 2525, 3000, -475, true],
    ['Klasse B', 99, 4950, 2475, null, null, false],
  ]);
  expect(groups[0]?.classes.map((c) => c.assetClassId)).toEqual(['a', 'c']);
});

it('a group target is unknown when any member class has no target', () => {
  const row = (assetClassId: string, targetBp: number | null) => ({
    assetClassId,
    name: assetClassId,
    valueCents: 10,
    shareBp: 5000,
    portfolioValueCents: 10,
    portfolioShareBp: 2500,
    targetBp,
  });
  const defs = [
    { id: 'g', name: 'G', parentId: null },
    { id: 'a', name: 'A', parentId: 'g' },
    { id: 'b', name: 'B', parentId: 'g' },
  ];
  const [group] = compositionGroups([row('a', 2000), row('b', null)], defs);
  expect(group).toMatchObject({ targetBp: null, deviationBp: null, targetComplete: false });
  const [full] = compositionGroups([row('a', 2000), row('b', 1000)], defs);
  expect(full).toMatchObject({ targetBp: 3000, deviationBp: 2000, targetComplete: true });
});

it('sums signed group cents exactly and rejects unsafe totals', () => {
  const rows = [Number.MAX_SAFE_INTEGER, 2, -2].map((valueCents, i) => ({
    assetClassId: `class-${i}`,
    name: `Klasse ${i}`,
    valueCents,
    shareBp: 0,
    portfolioValueCents: 0,
    portfolioShareBp: 0,
    targetBp: null,
  }));
  const definitions = [
    ...rows.map((row) => ({ id: row.assetClassId, name: row.name, parentId: 'group' })),
    { id: 'group', name: 'Gruppe', parentId: null },
  ];
  expect(compositionGroups(rows, definitions)[0]?.valueCents).toBe(Number.MAX_SAFE_INTEGER);
  expect(() => compositionGroups(rows.slice(0, 2), definitions)).toThrow(RangeError);
});

describe('parseRegionWeights', () => {
  it('reads valid weights', () => {
    expect(parseRegionWeights('{"USA":0.6,"Europa":0.4}')).toEqual({ USA: 0.6, Europa: 0.4 });
    expect(parseRegionWeights('{"Europa":0.5}')).toEqual({ Europa: 0.5 });
  });

  it('treats missing or invalid content as no region data', () => {
    for (const bad of [
      null,
      undefined,
      '',
      'nope',
      '[]',
      '"x"',
      '{}',
      '{"A":-0.1}',
      '{"A":"1"}',
      '{"A":0.7,"B":0.4}',
      '{"":0.5}',
    ])
      expect(parseRegionWeights(bad)).toBeNull();
  });
});

describe('splitByRegion', () => {
  it('adds up to the value exactly (largest remainder)', () => {
    const parts = splitByRegion(100_001, { USA: 0.6, Europa: 0.3, Asien: 0.1 });
    expect(parts.reduce((a, p) => a + p.valueCents, 0)).toBe(100_001);
    expect(parts.find((p) => p.region === 'USA')?.valueCents).toBe(60_001);
    expect(parts.find((p) => p.region === 'Europa')?.valueCents).toBe(30_000);
    expect(parts.find((p) => p.region === 'Asien')?.valueCents).toBe(10_000);
  });

  it('puts the part without a weight into NO_REGION, and unknown securities wholly', () => {
    expect(splitByRegion(1_000, { Europa: 0.75 })).toEqual([
      { region: 'Europa', valueCents: 750 },
      { region: NO_REGION, valueCents: 250 },
    ]);
    expect(splitByRegion(1_000, null)).toEqual([{ region: NO_REGION, valueCents: 1_000 }]);
  });

  it('survives sums of thirds and huge values without losing a cent', () => {
    const thirds = splitByRegion(100, { A: 1 / 3, B: 1 / 3, C: 1 / 3 });
    expect(thirds.reduce((a, p) => a + p.valueCents, 0)).toBe(100);
    const big = splitByRegion(Number.MAX_SAFE_INTEGER, { A: 0.123456, B: 0.876544 });
    expect(big.reduce((a, p) => a + p.valueCents, 0)).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('has no parts for a value of zero or less', () => {
    expect(splitByRegion(0, { A: 1 })).toEqual([]);
    expect(splitByRegion(-5, null)).toEqual([]);
  });
});

const pos = (id: string, assetClass: string | null, valueCents: number): WealthPosition => ({
  id,
  kind: 'etf',
  assetClass,
  valueCents,
});

describe('allocationTimeline', () => {
  const targets1 = [
    { assetClass: 'world', targetBp: 7_000 },
    { assetClass: 'spec', targetBp: 3_000 },
  ];
  const targets2 = [
    { assetClass: 'world', targetBp: 6_000 },
    { assetClass: 'spec', targetBp: 4_000 },
  ];

  it('follows the Soll valid on each day and flags the R13 breach per day', () => {
    const timeline = allocationTimeline([
      {
        date: '2026-01-31',
        positions: [pos('a', 'world', 7_000), pos('b', 'spec', 3_000)],
        targets: targets1,
      },
      {
        date: '2026-02-28',
        positions: [pos('a', 'world', 9_000), pos('b', 'spec', 1_000)],
        targets: targets1,
      },
      {
        date: '2026-03-31',
        positions: [pos('a', 'world', 6_000), pos('b', 'spec', 4_000)],
        targets: targets2,
      },
    ]);
    expect(timeline.dates).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
    expect(timeline.totalCents).toEqual([10_000, 10_000, 10_000]);
    const world = timeline.classes.find((c) => c.assetClass === 'world')!;
    expect(world.istBp).toEqual([7_000, 9_000, 6_000]);
    expect(world.targetBp).toEqual([7_000, 7_000, 6_000]);
    expect(world.breach).toEqual([false, true, false]);
    const spec = timeline.classes.find((c) => c.assetClass === 'spec')!;
    expect(spec.targetBp).toEqual([3_000, 3_000, 4_000]);
    // Every day the shares add up to the whole.
    for (let i = 0; i < 3; i++)
      expect(timeline.classes.reduce((a, c) => a + (c.istBp[i] ?? 0), 0)).toBe(10_000);
  });

  it('keeps classes without Soll visible and days without value at zero shares', () => {
    const timeline = allocationTimeline([
      { date: '2026-01-31', positions: [], targets: targets1 },
      {
        date: '2026-02-28',
        positions: [pos('a', null, 500), pos('b', 'world', 500)],
        targets: targets1,
      },
    ]);
    expect(timeline.totalCents).toEqual([0, 1_000]);
    const none = timeline.classes.find((c) => c.assetClass === '')!;
    expect(none.istBp).toEqual([0, 5_000]);
    expect(none.targetBp).toEqual([null, null]);
    expect(none.breach).toEqual([false, false]);
    expect(timeline.classes.find((c) => c.assetClass === 'world')?.istBp[0]).toBe(0);
  });
});
