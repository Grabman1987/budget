import type { getContactStatement, listContactStatements } from '@budget/db';
import type { contactTotals } from '@budget/domain';
import { queryOptions } from '@tanstack/react-query';
import { request } from '../api/http';
import { LEDGER_KEY } from '../ledger/queries';
export type ContactReportStatement = ReturnType<typeof getContactStatement>;
export interface ContactOverview {
  asOf: string;
  currency: 'EUR';
  contacts: ReturnType<typeof listContactStatements>;
  totals: ReturnType<typeof contactTotals>;
}
export const contactOverviewQuery = () =>
  queryOptions({
    queryKey: [...LEDGER_KEY, 'contact-report'],
    retry: false,
    queryFn: () => request<ContactOverview>('GET', '/api/contacts?history=1'),
  });
export const contactReportQuery = (id: string, asOf: string, enabled: boolean) =>
  queryOptions({
    queryKey: [...LEDGER_KEY, 'contact-report', id, asOf],
    enabled: enabled && !!id,
    retry: false,
    queryFn: () =>
      request<ContactReportStatement>(
        'GET',
        `/api/contacts/${encodeURIComponent(id)}?asOf=${encodeURIComponent(asOf)}`,
      ),
  });
