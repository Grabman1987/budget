import { STRATEGY_TARGETS, type StrategyCategory } from './strategy-plan';
import type { StrategyTrend } from './strategy-trend';

const TRENDS: readonly StrategyTrend[] = ['weak', 'mixed', 'strong'];

/** Why a position's category has its current target weight, in terms of the trend signal. */
export interface StrategyPositionSignal {
  category: StrategyCategory;
  /** True when the category's target differs between trend states (Nasdaq 2x and EUR bonds). */
  trendDriven: boolean;
  /** Target weight in basis points under the binding trend; null without a binding trend. */
  targetBp: number | null;
  /** Targets of all three states, in the order weak, mixed, strong. */
  byTrend: readonly { trend: StrategyTrend; targetBp: number }[];
  /**
   * Direction in which a stronger trend moves this target: 'up' (Nasdaq 2x), 'down' (EUR bonds)
   * or null when the target does not depend on the trend.
   */
  strongerTrend: 'up' | 'down' | null;
}

/**
 * Read-only explanation of one category's target weight. The trend never changes a position by
 * itself: it only selects which fixed target row applies. Pure; no estimate when no trend is bound.
 */
export function strategyPositionSignal(
  category: StrategyCategory,
  bindingTrend: StrategyTrend | null,
): StrategyPositionSignal {
  const byTrend = TRENDS.map((trend) => ({ trend, targetBp: STRATEGY_TARGETS[trend][category] }));
  const weak = STRATEGY_TARGETS.weak[category],
    strong = STRATEGY_TARGETS.strong[category];
  return {
    category,
    trendDriven: new Set(byTrend.map((row) => row.targetBp)).size > 1,
    targetBp: bindingTrend ? STRATEGY_TARGETS[bindingTrend][category] : null,
    byTrend,
    strongerTrend: strong > weak ? 'up' : strong < weak ? 'down' : null,
  };
}
