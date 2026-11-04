import { Button, Line, useAmountPrivacy, useIsPhone, useMediaQuery } from '@budget/ui';
import { useBlocker } from '@tanstack/react-router';
import { useRef, useState, type MouseEvent, type ReactNode } from 'react';
import type { ExplorerQuery, ExplorerResult, VerdictMetric } from '@budget/domain';
import type { ExplorerChartModel } from './explorer-chart-model-626';
import { explorerChartValue626 } from './explorer-table-inspector-626';
import { REDESIGN_ENABLED } from '../shell/redesign-flag';
import { AppLink } from '../shell/app-link';
import './explorer-redesign.css';

export function explorerHeadline(result: ExplorerResult): VerdictMetric {
  if (result.totals && result.query.meas === 'summe' && result.unit === 'cents')
    return { label: 'Gesamt im gewählten Zeitraum', value: result.totals.total, unit: 'money' };
  return {
    label: 'Zeilen · keine additive Gesamtsumme',
    value: result.rows.length,
    unit: 'count',
  };
}

/** Named edits are guarded; exploration alone does not create a saved-view draft. */
export function explorerDraftDirty(
  name: string,
  query: ExplorerQuery,
  original?: { name: string; query: ExplorerQuery },
) {
  return original
    ? name.trim() !== original.name ||
        Object.keys(query).some(
          (key) => query[key as keyof ExplorerQuery] !== original.query[key as keyof ExplorerQuery],
        )
    : name.trim().length > 0;
}
export function ExplorerDraftGuard({
  state,
}: {
  state: { current: { dirty: boolean; busy: boolean } };
}) {
  useBlocker({
    shouldBlockFn: () =>
      state.current.busy ||
      (state.current.dirty && !window.confirm('Ungespeicherte Auswertung verwerfen?')),
    enableBeforeUnload: () => state.current.dirty || state.current.busy,
  });
  return null;
}

export function ExplorerTableDetails({ children }: { children: ReactNode }) {
  return REDESIGN_ENABLED ? (
    <ResponsiveTableDetails>{children}</ResponsiveTableDetails>
  ) : (
    <>{children}</>
  );
}
function ResponsiveTableDetails({ children }: { children: ReactNode }) {
  const phone = useIsPhone();
  const printing = useMediaQuery('print');
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem('budget.report-explorer.full-table') === '1';
    } catch {
      return false;
    }
  });
  const ref = useRef<HTMLDetailsElement>(null);
  return (
    <details
      ref={ref}
      className="r6-table-details"
      open={!phone || printing || open}
      onToggle={(event) => {
        if (!phone || printing || event.currentTarget.open === open) return;
        setOpen(event.currentTarget.open);
        try {
          localStorage.setItem(
            'budget.report-explorer.full-table',
            event.currentTarget.open ? '1' : '0',
          );
        } catch {
          /* Optional preference only. */
        }
      }}
    >
      <summary>Vollständige Tabelle anzeigen</summary>
      {children}
    </details>
  );
}

function Spark({ values }: { values: readonly (number | null)[] }) {
  const known = values.filter((v): v is number => v !== null);
  const low = Math.min(...known),
    high = Math.max(...known);
  const x = (i: number) => 2 + (i / Math.max(1, values.length - 1)) * 86;
  const y = (v: number) => 24 - ((v - low) / (high - low || 1)) * 22;
  const segments: Array<Array<readonly [number, number]>> = [];
  let current: Array<readonly [number, number]> = [];
  values.forEach((value, index) => {
    if (value === null) {
      if (current.length) segments.push(current);
      current = [];
    } else current.push([x(index), y(value)]);
  });
  if (current.length) segments.push(current);
  return (
    <svg width="90" height="28" viewBox="0 0 90 28" aria-hidden="true">
      {segments.map((points, index) => (
        <Line key={index} points={points} kind="actual" draw={false} />
      ))}
    </svg>
  );
}

/** Source rows only: no extra request, rebasing, grouping or summing of chart coordinates. */
export function ExplorerPhoneRows({
  data,
  mode = 'latest',
  onOpen,
  rowLink,
  ready = true,
}: {
  data: ExplorerChartModel;
  mode?: 'latest' | 'total';
  onOpen?: (event: MouseEvent<HTMLButtonElement>, key: string, column: string) => void;
  rowLink?: (key: string) => Record<string, string> | null;
  ready?: boolean;
}) {
  useAmountPrivacy();
  const [all, setAll] = useState(false);
  const unitFor = new Map(
    data.cohorts.flatMap((cohort) => cohort.rows.map((row) => [row.key, cohort.unit] as const)),
  );
  const column = data.columns.at(-1);
  const shown = all ? data.rows : data.rows.slice(0, 8);
  return (
    <div className="r6-phone-rows">
      <p className="r6-meta">
        {mode === 'total'
          ? data.measure === 'avg'
            ? 'Ø im gesamten Zeitraum'
            : 'Gesamter Zeitraum'
          : `Letzte Spalte · ${column?.label ?? 'keine Monatswerte'}`}
      </p>
      <ul aria-label="Kompakte Auswertungszeilen">
        {shown.map((row) => {
          const unit = unitFor.get(row.key) ?? 'cents';
          const value = mode === 'total' ? row.total : (row.values.at(-1) ?? null);
          const content = (
            <>
              <strong>{row.label}</strong>
              <Spark values={row.values} />
              <span>{explorerChartValue626(value, unit)}</span>
            </>
          );
          const link = rowLink?.(row.key);
          return (
            <li key={row.key}>
              {onOpen && column && value !== null && unit !== 'bp' && ready ? (
                <button type="button" onClick={(event) => onOpen(event, row.key, column.key)}>
                  {content}
                </button>
              ) : link && ready ? (
                <AppLink to="/konten/buchungen" search={link}>
                  {content}
                </AppLink>
              ) : (
                <div>{content}</div>
              )}
            </li>
          );
        })}
      </ul>
      {data.rows.length > 8 && (
        <Button variant="ghost" onClick={() => setAll(!all)}>
          {all ? 'Weniger Zeilen anzeigen' : `Alle ${data.rows.length} Zeilen anzeigen`}
        </Button>
      )}
    </div>
  );
}
