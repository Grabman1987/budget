import type { ExplorerReport, PeriodComparisonReport, YearReportRead } from '@budget/db';
import type { CompareMode, ExplorerQuery } from '@budget/domain';
import { queryOptions, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { request } from '../api/http';
import { LEDGER_KEY } from '../ledger/queries';
import { evaluateRules } from '../rules/api';

/** Calls behind the Überblick reports (`/api/overview`). Every ledger write refreshes them. */

export type { ExplorerReport, PeriodComparisonReport, YearReportRead };

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
