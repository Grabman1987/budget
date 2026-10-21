import type {
  ExplorerReport,
  PeriodComparisonReport,
  YearReportRead as YearReportData,
} from '@budget/db';
import {
  explorerCsv,
  type CompareMode,
  type ExplorerQuery,
  type ExplorerResult,
} from '@budget/domain';
import { queryOptions, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { ApiError, request } from '../api/http';
import { LEDGER_KEY } from '../ledger/queries';
import type { WithValuationNotes } from '../ledger/valuation-hint';
import { evaluateRules } from '../rules/api';

/** Calls behind the Überblick reports (`/api/overview`). Every ledger write refreshes them. */

/** The year report as the API answers it: with the securities valued by an estimate, if any. */
export type YearReportRead = YearReportData & WithValuationNotes;
export type { ExplorerReport, PeriodComparisonReport };

export const periodComparisonQuery = (mode: CompareMode) =>
  queryOptions({
    queryKey: [...LEDGER_KEY, 'overview-compare', mode],
    retry: false,
    queryFn: () =>
      request<PeriodComparisonReport>(
        'GET',
        `/api/overview/compare?mode=${encodeURIComponent(mode)}`,
      ),
  });

export const yearReportQuery = (year: number | null) =>
  queryOptions({
    queryKey: [...LEDGER_KEY, 'overview-year', year],
    retry: false,
    queryFn: () =>
      request<YearReportRead>(
        'GET',
        year === null ? '/api/overview/year' : `/api/overview/year?year=${year}`,
      ),
  });

/**
 * Re-derives the stored rule results (idempotent, as the Regelwerk page does) when a report finds
 * them missing or stale, and refreshes the reports that read them. Evaluating twelve month ends
 * takes seconds, so it runs beside the page, at most once per visit and only when `needed`.
 */
export function useRuleDerivation(needed: boolean) {
  const qc = useQueryClient();
  const started = useRef(false);
  useEffect(() => {
    if (!needed || started.current) return;
    started.current = true;
    void evaluateRules()
      .then(() => qc.invalidateQueries({ queryKey: [...LEDGER_KEY] }))
      .catch(() => undefined);
  }, [needed, qc]);
}

export const explorerQuery = (query: ExplorerQuery) =>
  queryOptions({
    queryKey: [...LEDGER_KEY, 'overview-explorer', query],
    retry: false,
    queryFn: () =>
      request<ExplorerReport>(
        'GET',
        `/api/overview/explorer?${new URLSearchParams(query as unknown as Record<string, string>)}`,
      ),
  });

export const EXPLORER_CSV_CHANGED_MESSAGE =
  'Die Daten haben sich geändert. Bitte lade die Auswertung neu und exportiere erneut.';

/** Recompute on the server, then fail closed if it no longer equals the displayed pivot. */
export async function fetchExplorerCsv(
  result: ExplorerResult,
): Promise<{ blob: Blob; filename: string }> {
  const expected = explorerCsv(result);
  const response = await fetch(
    `/api/overview/explorer.csv?${new URLSearchParams(result.query as unknown as Record<string, string>)}`,
    { credentials: 'same-origin' },
  );
  if (!response.ok) throw new ApiError(response.status, 'export_failed');
  if (!/^text\/csv(?:;|$)/i.test(response.headers.get('content-type') ?? ''))
    throw new Error('Invalid CSV response');
  const filename = response.headers
    .get('content-disposition')
    ?.match(
      /^attachment; filename="(explorer-(?:\d{4}-\d{2}|empty)-(?:\d{4}-\d{2}|empty)\.csv)"$/,
    )?.[1];
  const displayedFilename = `explorer-${result.months[0] ?? 'empty'}-${result.months.at(-1) ?? 'empty'}.csv`;
  if (filename !== displayedFilename) throw new Error(EXPLORER_CSV_CHANGED_MESSAGE);
  const bytes = await response.arrayBuffer();
  // Response.text()/Blob.text() strip a UTF-8 BOM. Keep it for exact projection comparison.
  const actual = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  if (actual !== expected) throw new Error(EXPLORER_CSV_CHANGED_MESSAGE);
  return { blob: new Blob([bytes], { type: 'text/csv;charset=utf-8' }), filename };
}
