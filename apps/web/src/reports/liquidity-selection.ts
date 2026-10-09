import {
  LIQUIDITY_HORIZONS,
  LIQUIDITY_LEVERS,
  type LiquidityHorizon,
  type LiquidityLeverId,
} from '@budget/domain';
import { useState } from 'react';

type Selection = { horizon: LiquidityHorizon; levers: LiquidityLeverId[] };
const KEY = 'budget-liquidity-selection';

export function readLiquiditySelection(): Selection {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Selection | null;
    if (stored && LIQUIDITY_HORIZONS.includes(stored.horizon))
      return {
        horizon: stored.horizon,
        levers: Array.isArray(stored.levers)
          ? LIQUIDITY_LEVERS.filter((id) => stored.levers.includes(id))
          : [],
      };
  } catch {
    /* Storage can be unavailable. */
  }
  return { horizon: '6m', levers: [] };
}

export function useLiquiditySelection() {
  const [selection, setSelection] = useState(readLiquiditySelection);
  const update = (next: Selection) => {
    setSelection(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* In-memory choice still works. */
    }
  };
  return {
    ...selection,
    setHorizon: (horizon: LiquidityHorizon) => update({ ...selection, horizon }),
    setLevers: (levers: LiquidityLeverId[]) => update({ ...selection, levers }),
  };
}
