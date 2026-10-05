import type { ChartTooltipPoint } from '@budget/ui';
import { eur } from '../ledger/format';

/** Presentation only: callers supply the same values and positions used in their drawing. */
export function chartPoints(
  dates: readonly string[],
  x: (index: number) => number,
  series: ReadonlyArray<{
    name: string;
    values: readonly (number | null | undefined)[];
    color?: string;
    negativeColor?: string;
    className?: string;
    format?: (value: number) => string;
  }>,
): ChartTooltipPoint[] {
  return dates.map((date, i) => ({
    date,
    x: x(i),
    series: series.map(({ values, format = eur, negativeColor, ...s }) => ({
      ...(negativeColor && values[i] != null && values[i]! < 0
        ? { name: s.name, color: negativeColor }
        : s),
      value: values[i] == null || !Number.isFinite(values[i]) ? '–' : format(values[i]!),
    })),
  }));
}

export const chartPercent = (bp: number) =>
  new Intl.NumberFormat('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .format(bp / 100)
    .replace('-', '−') + ' %';

/** Percent display only; source amounts remain integer cents. */
export const chartShare = (value: number, total: number) =>
  total > 0
    ? new Intl.NumberFormat('de-AT', {
        style: 'percent',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
        .format(value / total)
        .replace('-', '−')
    : '–';
