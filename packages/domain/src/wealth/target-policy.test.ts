import { expect, it } from 'vitest';
import {
  resolveTargetTier,
  validateTargetPolicy,
  targetTierStarts,
  targetTiersFromStarts,
  type TargetPolicy,
} from './target-policy';
import { wealthStageTemplate } from './wealth-stage-template';
import { allocationStatus } from './allocation';
const policy: TargetPolicy = {
  targets: [{ assetClassId: 'a', targetShareBp: 10000 }],
  tiers: [
    { upToCents: 1000000, targets: [{ assetClassId: 'a', targetShareBp: 10000 }] },
    { upToCents: 2000000, targets: [{ assetClassId: 'b', targetShareBp: 10000 }] },
    {
      upToCents: null,
      targets: [
        { assetClassId: 'a', targetShareBp: 0 },
        { assetClassId: 'b', targetShareBp: 10000 },
      ],
    },
  ],
};
it('lower bounds activate at the exact cent and round-trip legacy upper boundaries unchanged', () => {
  const tiers = targetTiersFromStarts([
    { fromCents: 0, targets: policy.targets },
    { fromCents: 50_000_000, targets: policy.tiers[1]!.targets },
  ]);
  expect(tiers.map((t) => t.upToCents)).toEqual([49_999_999, null]);
  expect(resolveTargetTier({ ...policy, tiers }, 49_999_999).tierIndex).toBe(0);
  expect(resolveTargetTier({ ...policy, tiers }, 50_000_000).tierIndex).toBe(1);
  expect(targetTierStarts(policy.tiers)).toEqual([0, 1_000_001, 2_000_001]);
  expect(
    targetTiersFromStarts(
      policy.tiers.map((t, i) => ({ ...t, fromCents: targetTierStarts(policy.tiers)[i]! })),
    ),
  ).toEqual(policy.tiers);
  const smallest = targetTiersFromStarts([
    { fromCents: 0, targets: policy.targets },
    { fromCents: 1, targets: policy.targets },
  ]);
  validateTargetPolicy({ targets: policy.targets, tiers: smallest }, new Set(['a']));
  expect(resolveTargetTier({ targets: policy.targets, tiers: smallest }, 1).tierIndex).toBe(1);
  expect(() => targetTiersFromStarts([{ fromCents: 1, targets: policy.targets }])).toThrow('erste');
});
it('the editable seven-stage scenario preserves literal weights and requires approval of conditional stages', () => {
  const tiers = wealthStageTemplate({ world: 'w', leveraged: 'l', managed: 'm', reserve: 'r' });
  const template = { targets: tiers[0]!.targets, tiers };
  validateTargetPolicy(template, new Set(['w', 'l', 'm', 'r']));
  expect(targetTierStarts(tiers)).toEqual([
    0, 1_000_000, 5_000_000, 10_000_000, 50_000_000, 100_000_000, 200_000_000,
  ]);
  expect(tiers.map((t) => t.targets.map((t) => t.targetShareBp))).toEqual([
    [8500, 1500, 0, 0],
    [7500, 500, 2000, 0],
    [7500, 500, 2000, 0],
    [7500, 500, 2000, 0],
    [6500, 500, 2000, 1000],
    [6000, 500, 2000, 1500],
    [6000, 500, 2000, 1500],
  ]);
  expect(resolveTargetTier(template, 50_000_000).tierIndex).toBe(0);
  tiers[2]!.enabled = true;
  expect(resolveTargetTier(template, 50_000_000).tierIndex).toBe(2);
  tiers[4]!.enabled = true;
  expect(resolveTargetTier(template, 50_000_000).tierIndex).toBe(4);
  expect(resolveTargetTier(template, 49_999_999).tierIndex).toBe(2);
  expect(resolveTargetTier(template, null).targets).toEqual([]);
  tiers[0]!.enabled = false;
  expect(() => validateTargetPolicy(template, new Set(['w', 'l', 'm', 'r']))).toThrow('erste');
  expect(() =>
    wealthStageTemplate({ world: 'w', leveraged: 'w', managed: 'm', reserve: 'r' }),
  ).toThrow('unterschiedliche');
});
it('inclusive cent boundaries, negative investment sums and unavailable valuations resolve deterministically', () => {
  validateTargetPolicy(policy, new Set(['a', 'b']));
  expect(resolveTargetTier(policy, -100).tierIndex).toBe(0);
  expect(resolveTargetTier(policy, 1000000).tierIndex).toBe(0);
  expect(resolveTargetTier(policy, 1000001).tierIndex).toBe(1);
  expect(resolveTargetTier(policy, 2000000).tierIndex).toBe(1);
  expect(resolveTargetTier(policy, 2000001).tierIndex).toBe(2);
  expect(resolveTargetTier(policy, null).targets).toEqual([]);
  expect(resolveTargetTier({ ...policy, tiers: [] }, null).targets).toEqual(policy.targets);
  // A stored policy whose last tier is not open falls back to that last tier instead of throwing.
  expect(resolveTargetTier({ ...policy, tiers: policy.tiers.slice(0, 2) }, 9000000).tierIndex).toBe(
    1,
  );
});
it('each tier has an exact sum, ordered integer-cent boundaries, unique managed classes and an open final tier', () => {
  expect(() =>
    validateTargetPolicy(
      {
        ...policy,
        tiers: [{ upToCents: null, targets: [{ assetClassId: 'a', targetShareBp: 9500 }] }],
      },
      new Set(['a']),
    ),
  ).toThrow('95,00 %');
  expect(() =>
    validateTargetPolicy(
      { ...policy, tiers: [{ ...policy.tiers[0]!, upToCents: 0.5 }, ...policy.tiers.slice(1)] },
      new Set(['a', 'b']),
    ),
  ).toThrow('Stufengrenzen');
  expect(() =>
    validateTargetPolicy(
      {
        ...policy,
        targets: [
          { assetClassId: 'a', targetShareBp: 5000 },
          { assetClassId: 'a', targetShareBp: 5000 },
        ],
      },
      new Set(['a']),
    ),
  ).toThrow('doppelt');
  expect(() =>
    validateTargetPolicy({ ...policy, tiers: policy.tiers.slice(0, 1) }, new Set(['a', 'b'])),
  ).toThrow('offen');
});
it('managed zero and custom zero-width band remain distinct from omission and standard', () => {
  const positions = [{ id: 'p', kind: 'etf' as const, assetClass: 'a', valueCents: 10000 }];
  expect(allocationStatus(positions, []).rows[0]!.targetBp).toBeNull();
  expect(allocationStatus(positions, [{ assetClass: 'a', targetBp: 0 }]).rows[0]!.breach).toBe(
    true,
  );
  expect(
    allocationStatus(positions, [
      { assetClass: 'a', targetBp: 9500, bandBp: 0, bandMode: 'custom' },
    ]).rows[0]!.bandBp,
  ).toBe(0);
  expect(
    allocationStatus(positions, [{ assetClass: 'a', targetBp: 9500, bandBp: 0 }]).rows[0]!.bandBp,
  ).toBe(500);
  expect(
    allocationStatus(positions, [
      { assetClass: 'a', targetBp: 9500, bandBp: 123, bandMode: 'standard' },
    ]).rows[0]!.bandBp,
  ).toBe(500);
});
