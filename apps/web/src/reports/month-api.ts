import type { monthFlowReport, monthIncomeReport, monthOnePager } from '@budget/db';
import { queryOptions } from '@tanstack/react-query';
import { request } from '../api/http';
import { LEDGER_KEY } from '../ledger/queries';

/** The reports of "Monat und Einkommen": one endpoint each, the month in the query. */
export type IncomeReportData = ReturnType<typeof monthIncomeReport>;
export type FlowReportData = ReturnType<typeof monthFlowReport>;
export type OnePagerData = ReturnType<typeof monthOnePager>;
export type FlowSpan = FlowReportData['span'];

const KEY = [...LEDGER_KEY, 'month-report'] as const;

export const incomeReportQuery = (month: string) =>
  queryOptions({
    queryKey: [...KEY, 'income', month],
    retry: false,
    queryFn: () =>
      request<IncomeReportData>(
        'GET',
        `/api/reports/month/income?month=${encodeURIComponent(month)}`,
      ),
  });

export const flowReportQuery = (month: string, span: FlowSpan) =>
  queryOptions({
    queryKey: [...KEY, 'flow', month, span],
    retry: false,
    queryFn: () =>
      request<FlowReportData>(
        'GET',
        `/api/reports/month/flow?month=${encodeURIComponent(month)}&span=${span}`,
      ),
  });

export const onePagerQuery = (month: string) =>
  queryOptions({
    queryKey: [...KEY, 'onepager', month],
    retry: false,
    queryFn: () =>
      request<OnePagerData>(
        'GET',
        `/api/reports/month/onepager?month=${encodeURIComponent(month)}`,
      ),
  });
