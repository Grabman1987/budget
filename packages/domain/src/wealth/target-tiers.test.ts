import { describe, expect, it } from 'vitest';
import { selectTargetTier, sortTargetTiers, targetTierListProblem } from './target-tiers';

const tiers = [
  { id: 'open', upToCents: null },
  { id: 'b', upToCents: 2_000_000 },
  { id: 'a', upToCents: 1_000_000 },
  { id: 'c', upToCents: 5_000_000 },
];

describe('target tiers', () => {
  it('sorts ascending with the open tier last', () => {
    expect(sortTargetTiers(tiers).map((t) => t.id)).toEqual(['a', 'b', 'c', 'open']);
  });

  it('selects by the investment sum, thresholds inclusive', () => {
    expect(selectTargetTier(tiers, 0)?.id).toBe('a');
    expect(selectTargetTier(tiers, 1_000_000)?.id).toBe('a');
    expect(selectTargetTier(tiers, 1_000_001)?.id).toBe('b');
    expect(selectTargetTier(tiers, 5_000_000)?.id).toBe('c');
    expect(selectTargetTier(tiers, 5_000_001)?.id).toBe('open');
  });

  it('puts a negative sum into the lowest tier', () => {
    expect(selectTargetTier(tiers, -250_000)?.id).toBe('a');
  });

  it('uses the highest tier when no open tier exists', () => {
    const closed = tiers.filter((t) => t.upToCents !== null);
    expect(selectTargetTier(closed, 99_000_000)?.id).toBe('c');
    expect(selectTargetTier([], 1)).toBeNull();
  });

  it('rejects malformed lists', () => {
    expect(targetTierListProblem(tiers)).toBeNull();
    expect(targetTierListProblem([])).toMatch(/at least one/);
    expect(
      targetTierListProblem([
        { id: 'x', upToCents: null },
        { id: 'y', upToCents: null },
      ]),
    ).toMatch(/only one/);
    expect(
      targetTierListProblem([
        { id: 'x', upToCents: 5 },
        { id: 'y', upToCents: 5 },
      ]),
    ).toMatch(/same threshold/);
    expect(targetTierListProblem([{ id: 'x', upToCents: -1 }])).toMatch(/0 or more/);
  });
});
