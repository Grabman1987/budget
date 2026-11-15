import { describe, expect, it } from 'vitest';
import { strategyPositionSignal } from './strategy-position-signal';

// Owner table of #762, literal (basis points): weak / mixed / strong.
describe('strategyPositionSignal', () => {
  it('Nasdaq 2x rises with a stronger trend', () => {
    expect(strategyPositionSignal('nasdaq2x', 'mixed')).toEqual({
      category: 'nasdaq2x',
      trendDriven: true,
      targetBp: 1500,
      byTrend: [
        { trend: 'weak', targetBp: 500 },
        { trend: 'mixed', targetBp: 1500 },
        { trend: 'strong', targetBp: 3000 },
      ],
      strongerTrend: 'up',
    });
  });

  it('EUR bonds fall with a stronger trend', () => {
    expect(strategyPositionSignal('eurBonds', 'strong')).toEqual({
      category: 'eurBonds',
      trendDriven: true,
      targetBp: 1000,
      byTrend: [
        { trend: 'weak', targetBp: 3500 },
        { trend: 'mixed', targetBp: 2500 },
        { trend: 'strong', targetBp: 1000 },
      ],
      strongerTrend: 'down',
    });
  });

  it.each([
    ['global', 5000],
    ['gold', 1000],
  ] as const)('%s is independent of the trend', (category, targetBp) => {
    const result = strategyPositionSignal(category, 'weak');
    expect(result).toMatchObject({ trendDriven: false, targetBp, strongerTrend: null });
    expect(result.byTrend.map((row) => row.targetBp)).toEqual([targetBp, targetBp, targetBp]);
  });

  it('names no target without a binding trend instead of guessing one', () => {
    expect(strategyPositionSignal('nasdaq2x', null)).toMatchObject({
      trendDriven: true,
      targetBp: null,
    });
    expect(strategyPositionSignal('global', null).targetBp).toBeNull();
  });
});
