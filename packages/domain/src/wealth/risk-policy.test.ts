import { describe, expect, it } from 'vitest';
import { classifyRisk, grossExposureCents } from './classification';
import { clusterRisk, speculativeShare } from './risk';
import type { WealthPosition } from './types';

const position = (kind: WealthPosition['kind'], leverageFactor = 10): WealthPosition => ({
  id: 'synthetic',
  kind,
  leverageFactor,
  assetClass: null,
  valueCents: 1_000_000,
  platform: 'synthetic-platform',
});

describe('owner PR2 risk classification and economic exposure', () => {
  it.each([
    ['etf', 10, false, false, false],
    ['etf', 20, true, true, false],
    ['etf', 30, true, true, false],
    ['stock', 10, true, true, false],
    ['crypto', 10, true, true, true],
    ['p2p', 10, true, false, true],
    ['other', 10, false, false, false],
  ] as const)('R01/R02 %s at %i tenths', (kind, leverage, speculative, single, platform) => {
    expect(classifyRisk(position(kind, leverage))).toEqual({ speculative, single, platform });
  });

  it('R03 EUR 10,000 at 3x is EUR 30,000 gross without changing market value', () => {
    const p = position('etf', 30);
    expect(grossExposureCents(p)).toBe(3_000_000);
    expect(speculativeShare([p])).toMatchObject({
      totalCents: 1_000_000,
      valueCents: 1_000_000,
      grossExposureCents: 3_000_000,
      shareBp: 30_000,
      overCents: 2_900_000,
      breach: true,
    });
    expect(clusterRisk([p]).singles[0]).toMatchObject({
      valueCents: 1_000_000,
      grossExposureCents: 3_000_000,
      shareBp: 30_000,
    });
    expect(p.valueCents).toBe(1_000_000);
  });

  it('optional speculative overrides do not exempt leveraged products from cluster limits', () => {
    expect(classifyRisk({ ...position('etf', 30), speculativeOverride: false })).toEqual({
      speculative: false,
      single: true,
      platform: false,
    });
    expect(classifyRisk({ ...position('etf'), speculativeOverride: true }).speculative).toBe(true);
    expect(classifyRisk({ ...position('etf'), derivative: true })).toEqual({
      speculative: true,
      single: true,
      platform: false,
    });
  });
});
