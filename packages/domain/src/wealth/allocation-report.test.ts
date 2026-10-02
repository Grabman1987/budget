import { describe, expect, it } from 'vitest';
import {
  allocationTimeline,
  NO_REGION,
  parseRegionWeights,
  splitByRegion,
} from './allocation-report';
import type { WealthPosition } from './types';

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
