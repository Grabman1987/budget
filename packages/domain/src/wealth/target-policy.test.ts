import { expect, it } from 'vitest';
import { resolveTargetTier, validateTargetPolicy, type TargetPolicy } from './target-policy';
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
