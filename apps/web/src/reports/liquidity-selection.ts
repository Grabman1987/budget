import {
  LIQUIDITY_HORIZONS,
  LIQUIDITY_LEVERS,
  type LiquidityHorizon,
  type LiquidityLeverId,
  type LiquidityPoint,
  type LiquidityReport,
} from '@budget/domain';
import { useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';

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

/** Explicit URL state wins over the previous local preference, including an empty lever set. */
export function validateLiquiditySearch(search: Record<string, unknown>) {
  return {
    horizon: LIQUIDITY_HORIZONS.includes(search['horizon'] as LiquidityHorizon)
      ? (search['horizon'] as LiquidityHorizon)
      : undefined,
    levers:
      typeof search['levers'] === 'string' && search['levers'].length <= 200
        ? LIQUIDITY_LEVERS.filter((id) =>
            (search['levers'] as string).split(',').includes(id),
          ).join(',')
        : undefined,
  };
}

export function useLiquiditySelection() {
  const [fallback] = useState(readLiquiditySelection);
  const search = useSearch({ strict: false }) as ReturnType<typeof validateLiquiditySearch>;
  const navigate = useNavigate();
  const selection: Selection = {
    horizon: search.horizon ?? fallback.horizon,
    levers:
      search.levers !== undefined
        ? LIQUIDITY_LEVERS.filter((id) => search.levers?.split(',').includes(id))
        : search.horizon !== undefined
          ? []
          : fallback.levers,
  };
  const update = (next: Selection) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* The URL still retains the chosen view when preference storage is unavailable. */
    }
    void navigate({
      to: '.',
      resetScroll: false,
      search: ((previous: Record<string, unknown>) => ({
        ...previous,
        horizon: next.horizon,
        levers: next.levers.join(','),
      })) as never,
    });
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
  const row = report.scheduledInflows.find(
    (r) => r.day > report.startDay && r.cents > 0 && salaryPaymentIds.has(r.ref.paymentId),
  );
  return row?.day ?? null;
}
