import { describe, expect, it } from 'vitest';
import { allocationStatus } from './allocation';
import { allocationQuality } from './quality';
import { clusterRisk, speculativeShare } from './risk';
import { newCapitalToTarget, rebalancingProposals, savingsPlanProposal } from './proposals';
import { shareBps } from './int';
import type { WealthPosition } from './types';

const positions: WealthPosition[] = [
  { id: 'a', securityId: 'a', kind: 'etf', assetClass: 'a', valueCents: 40000 },
  { id: 'b', securityId: 'b', kind: 'stock', assetClass: 'b', valueCents: 60000 },
];
const targets = [
  { assetClass: 'a', targetBp: 6000 },
  { assetClass: 'b', targetBp: 4000 },
];
const propose = (p: WealthPosition[], quality = allocationQuality(p)) =>
  rebalancingProposals({
    allocation: allocationStatus(p, targets),
    cluster: clusterRisk(p),
    speculative: speculativeShare(p),
    quality,
  });

describe('PR3 allocation quality and money semantics', () => {
  it('R07 one unknown cent makes every proposal provisional; negative unknown cash cannot cancel it', () => {
    const p = [
      ...positions,
      { id: 'unknown', kind: 'other' as const, assetClass: null, valueCents: 1 },
      { id: 'cash', kind: 'other' as const, assetClass: null, valueCents: -1 },
    ];
    expect(allocationQuality(p)).toMatchObject({
      confidence: 'provisional',
      unclassifiedValueCents: 0,
      unclassifiedExposureCents: 2,
      unclassifiedProductCount: 2,
    });
    expect(propose(p).every((p) => p.confidence === 'provisional')).toBe(true);
    expect(propose(positions).every((p) => p.confidence === 'exact')).toBe(true);
  });
  it('R08 a marginal estimated breach carries provisional confidence and known per-position estimate share', () => {
    const p = [
      { ...positions[0]!, valueCents: 54999, valuationQuality: 'estimated' as const },
      { ...positions[1]!, valueCents: 45001 },
    ];
    const quality = allocationQuality(p, { estimatedSecurityIds: ['a'] });
    expect(quality).toMatchObject({
      valuationQuality: 'estimated',
      estimatedShareBp: 5500,
      estimatedValueCents: 54999,
    });
    expect(propose(p, quality).find((p) => p.rule === 'R13')).toMatchObject({
      confidence: 'provisional',
      gapCents: 5001,
    });
    expect(propose(p, allocationQuality(p, { missingFxSecurityIds: ['a'] }))).toEqual([]);
  });
  it('does not expose an inexact new-capital amount beyond the safe integer cent range', () => {
    expect(newCapitalToTarget(1_000_000_000_000, 0, 9999)).toBeNull();
    expect(newCapitalToTarget(1_000_000_000_000, 0, 5000)).toBe(1_000_000_000_000);
  });
  it('unknown product counts deduplicate weighted slices and platforms; estimates count only affected slices', () => {
    const p = [
      {
        ...positions[0]!,
        assetClass: null,
        valueCents: 100,
        valuationQuality: 'estimated' as const,
      },
      {
        ...positions[0]!,
        id: 'other-account',
        assetClass: null,
        valueCents: 900,
        valuationQuality: 'exact' as const,
      },
    ];
    expect(allocationQuality(p, { estimatedSecurityIds: ['a'] })).toMatchObject({
      unclassifiedProductCount: 1,
      estimatedValueCents: 100,
      estimatedShareBp: 1000,
    });
  });
  it('savings proposals retain rates and total on every provisional basis', () => {
    const plans = positions.map((p) => ({ ...p, name: p.id, monthlyCents: 10000 }));
    const result = savingsPlanProposal(plans, allocationStatus(positions, targets), {
      speculativeBreached: true,
      quality: allocationQuality(positions, { estimatedSecurityIds: ['a'] }),
    });
    expect(result).toMatchObject({
      confidence: 'provisional',
      changed: false,
      note: 'quality_gate',
      totalCents: 20000,
      freedCents: 0,
    });
    expect(result.plans.map((p) => [p.proposedCents, p.confidence])).toEqual([
      [10000, 'provisional'],
      [10000, 'provisional'],
    ]);
  });
  it('Umschichtungsabstand is 200 EUR; new single-class capital at 60% is 500 EUR', () => {
    const p = propose(positions).find((p) => p.code === 'r13_under')!;
    expect(p).toMatchObject({ gapCents: 20000, newCapitalCents: 50000, confidence: 'exact' });
    expect(newCapitalToTarget(100000, 40000, 10000)).toBeNull();
    expect(newCapitalToTarget(100000, 60000, 6000)).toBeNull();
    expect(newCapitalToTarget(101, 100, 9999)).toBe(9899);
    expect(newCapitalToTarget(3, 0, 2000)).toBe(1);
    expect(
      propose(positions)
        .filter((p) => p.direction === 'reduce')
        .every((p) => p.newCapitalCents === null),
    ).toBe(true);
  });
  it('signed investment cash shares conserve 100% with mathematical floors', () => {
    expect(shareBps([101, -1], 100)).toEqual([10100, -100]);
    expect(shareBps([100, -1], 99)).toEqual([10101, -101]);
  });
});
