import {
  LIQUIDITY_HORIZONS,
  LIQUIDITY_LEVERS,
  type LiquidityHorizon,
  type LiquidityLeverId,
  type LiquidityPoint,
  type LiquidityReport,
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

/** The lowest point of the plotted balance line (first day on a tie), derived from the series. */
export function lowestPoint(
  points: ReadonlyArray<LiquidityPoint>,
): { day: string; cents: number; index: number } | null {
  let low: { day: string; cents: number; index: number } | null = null;
  for (const [index, p] of points.entries())
    if (!low || p.balanceCents < low.cents) low = { day: p.day, cents: p.balanceCents, index };
  return low;
}

/** The next booking events of the chart, in chart order: the movement rows of all months. */
export function upcomingEvents(report: LiquidityReport, limit: number) {
  return report.movements.flatMap((m) => m.rows).slice(0, limit);
}

/** Next salary receipt in the forecast (the first income of a salary payment after the start day). */
export function salaryDay(
  report: LiquidityReport,
  salaryPaymentIds: ReadonlySet<string>,
): string | null {
  const row = report.movements
    .flatMap((m) => m.rows)
    .find(
      (r) =>
        r.day > report.startDay && r.cents > 0 && !!r.ref && salaryPaymentIds.has(r.ref.paymentId),
    );
  return row?.day ?? null;
}
