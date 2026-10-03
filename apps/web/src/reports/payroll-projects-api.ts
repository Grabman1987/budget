import type { readPayroll, readProjects } from '@budget/db';
import { queryOptions } from '@tanstack/react-query';
import { request } from '../api/http';
import { LEDGER_KEY } from '../ledger/queries';
export type PayrollData = ReturnType<typeof readPayroll>;
export type ProjectsData = ReturnType<typeof readProjects>;
export const payrollQuery = (month: string) =>
  queryOptions({
    queryKey: [...LEDGER_KEY, 'payroll', month],
    retry: false,
    queryFn: () => request<PayrollData>('GET', `/api/payslips?month=${month}`),
  });
export const projectsReportQuery = (period: string) =>
  queryOptions({
    queryKey: [...LEDGER_KEY, 'projects', period],
    retry: false,
    queryFn: () => request<ProjectsData>('GET', `/api/projects/report?period=${period}`),
  });
