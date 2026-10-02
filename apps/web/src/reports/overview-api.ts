import type { ExplorerReport, PeriodComparisonReport, YearReportRead } from '@budget/db';
import type { CompareMode, ExplorerQuery } from '@budget/domain';
import { queryOptions } from '@tanstack/react-query';
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

/**
 * The Finanz-Check of the year's last month end comes from the stored rule results, so the
 * results are re-derived first (idempotent, as the Regelwerk page does when it opens).
 */
export const yearReportQuery = (year: number | null) =>
  queryOptions({
    queryKey: [...LEDGER_KEY, 'overview-year', year],
    retry: false,
    queryFn: async () => {
      await evaluateRules().catch(() => undefined);
      return request<YearReportRead>(
        'GET',
        year === null ? '/api/overview/year' : `/api/overview/year?year=${year}`,
      );
    },
  });

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
