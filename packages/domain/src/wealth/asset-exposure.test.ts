import { describe, expect, it } from 'vitest';
import { splitAssetExposure } from './asset-exposure';

describe('A02 weighted asset exposure', () => {
  const weights = [
    { assetClassId: 'a', weightBp: 6000 },
    { assetClassId: 'b', weightBp: 3500 },
    { assetClassId: 'c', weightBp: 500 },
  ];
  it('60/35/5 apportions 101 cents as 61/35/5, with deterministic ties', () => {
    expect(splitAssetExposure(101, weights).map((p) => p.valueCents)).toEqual([61, 35, 5]);
    expect(
      splitAssetExposure(1, [
        { assetClassId: 'b', weightBp: 5000 },
        { assetClassId: 'a', weightBp: 5000 },
      ]),
    ).toEqual([
      { assetClassId: 'a', weightBp: 5000, valueCents: 1 },
      { assetClassId: 'b', weightBp: 5000, valueCents: 0 },
    ]);
  });
  it('conserves signed and safe-integer cent values, including the unknown remainder', () => {
    for (const value of [0, 1, -101, 123456789, Number.MAX_SAFE_INTEGER])
      expect(
        splitAssetExposure(value, weights).reduce((a, p) => a + BigInt(p.valueCents), 0n),
      ).toBe(BigInt(value));
    expect(
      splitAssetExposure(101, [{ assetClassId: 'a', weightBp: 6000 }]).map((p) => p.valueCents),
    ).toEqual([61, 40]);
    expect(splitAssetExposure(101, [])).toEqual([
      { assetClassId: null, weightBp: 10000, valueCents: 101 },
    ]);
  });
});

describe('splitAssetExposure beyond the plain-number range', () => {
  it('gives the same exact split for huge values as for small ones scaled', () => {
    const weights = [
      { assetClassId: 'a', weightBp: 3333 },
      { assetClassId: 'b', weightBp: 3333 },
      { assetClassId: 'c', weightBp: 3333 },
    ];
    for (const value of [1, 7, 101, 999_999_999, 901_000_000_000, 9_007_199_254_740_991, -12_345]) {
      const parts = splitAssetExposure(value, weights);
      expect(parts.reduce((sum, p) => sum + p.valueCents, 0)).toBe(value);
      expect(parts.map((p) => p.assetClassId)).toEqual(['a', 'b', 'c', null]);
    }
  });
});
