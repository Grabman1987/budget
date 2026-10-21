import { ChartValues, privateAmount, useAmountPrivacy, type ChartTooltipPoint } from '@budget/ui';
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { eur } from '../ledger/format';
import { chartPercent } from '../charts/tooltip-data';
import type { ExplorerChartModel, ExplorerChartUnit } from './explorer-chart-model-626';

export function explorerChartValue626(value: number | null, unit: ExplorerChartUnit): string {
  if (value === null || !Number.isSafeInteger(value)) return '–';
  return unit === 'cents'
    ? eur(value)
    : privateAmount(unit === 'bp' ? chartPercent(value) : value.toLocaleString('de-AT'));
}

/** Wrap, never replace or flatten, the existing native table and its original links/actions. */
export function ExplorerTableInspector626({
  data,
  children,
  active = true,
}: {
  data: ExplorerChartModel;
  children: ReactNode;
  active?: boolean;
}) {
  useAmountPrivacy();
  const root = useRef<HTMLDivElement>(null);
  const horizontalPosition = useRef(0);
  useLayoutEffect(() => {
    if (!active) return;
    const scroller = root.current?.querySelector<HTMLElement>('.ex-scroll, .ex-template-scroll');
    if (!scroller) return;
    scroller.scrollLeft = horizontalPosition.current;
  }, [active]);
  const units = new Map(
    data.cohorts.flatMap((cohort) => cohort.rows.map((row) => [row.key, cohort.unit] as const)),
  );
  const rows = [
    ...data.rows,
    ...(data.totals
      ? [
          {
            key: '__original_total',
            label: 'Summe',
            values: data.totals.values,
            total: data.totals.total,
            average: null,
          },
        ]
      : []),
  ];
  const points: ChartTooltipPoint[] = rows.flatMap((row) => {
    const unit = units.get(row.key) ?? data.cohorts[0]?.unit ?? 'cents';
    return [
      ...data.columns.map((column, index) => ({
        x: 50,
        date: column.label,
        series: [
          { name: row.label, value: explorerChartValue626(row.values[index] ?? null, unit) },
        ],
      })),
      ...data.summaryColumns.map((column) => ({
        x: 50,
        date: column.label,
        series: [{ name: row.label, value: explorerChartValue626(row[column.key], unit) }],
      })),
    ];
  });
  return (
    <div
      ref={root}
      className="ex-table-inspector-626"
      onScrollCapture={(event) => {
        const scroller = root.current?.querySelector<HTMLElement>(
          '.ex-scroll, .ex-template-scroll',
        );
        if (active && scroller && event.target === scroller)
          horizontalPosition.current = scroller.scrollLeft;
      }}
      onKeyDownCapture={(event) => {
        if (
          (event.key === 'ArrowLeft' || event.key === 'ArrowRight') &&
          !event.altKey &&
          !event.ctrlKey &&
          !event.metaKey &&
          event.target instanceof Element &&
          !event.target.matches('.chart-interactive')
        )
          event.stopPropagation();
      }}
    >
      <ChartValues
        key={active ? 'active' : 'inactive'}
        label="Tabellenwerte: Zeile, Spalte und genauer Wert"
        points={active ? points : []}
      >
        {children}
      </ChartValues>
    </div>
  );
}
