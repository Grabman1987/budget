import { afterEach, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { validateReportSearch } from './report-search';
import { cashflowQuery } from './cashflow-api';
import { incomeReportQuery } from './month-api';
import { LEDGER_KEY } from '../ledger/queries';
import { filterFromSearch, validateBookingsSearch } from '../ledger/bookings-search';

afterEach(() => vi.unstubAllGlobals());

it('unions project/view filters with saved-view IDs and both exact-window URL spellings', () => {
  for (const exact of [true, 'true']) {
    expect(validateReportSearch({ ansicht: 'server-saved-id', exakt: exact, vorlage: 'heatmap', projekt: 'a', darstellung: 'cashflow', kategorien: ['miete'], gruppen: ['g'] })).toMatchObject({ ansicht: 'server-saved-id', exakt: true, vorlage: 'heatmap', projekt: 'a', darstellung: 'cashflow', kategorien: ['miete'], gruppen: ['g'] });
  }
  for (const projekt of ['', 'x'.repeat(65), 7]) expect(validateReportSearch({ projekt })).toMatchObject({ projekt: undefined, projektUngueltig: true });
  expect(validateReportSearch({ projektUngueltig: 'true' })).toMatchObject({ projektUngueltig: true });
  expect(validateReportSearch({ projekt: undefined, projektUngueltig: undefined, darstellung: 'unknown' })).toMatchObject({ projekt: undefined, projektUngueltig: undefined, darstellung: undefined });
});

it('retains legacy no-project cache keys/URLs and separates encoded project reads without writes', async () => {
  const client = new QueryClient();
  const fetch = vi.fn(async () => Response.json({ synthetic: true }));
  vi.stubGlobal('fetch', fetch);
  const period = '2026-08..2026-08';
  expect(cashflowQuery(period).queryKey).toEqual([...LEDGER_KEY, 'cashflow-report', period]);
  expect(incomeReportQuery('2026-08').queryKey).toEqual([...LEDGER_KEY, 'month-report', 'income', '2026-08']);
  expect(cashflowQuery(period, 'a').queryKey).not.toEqual(cashflowQuery(period, 'b').queryKey);
  expect(incomeReportQuery('2026-08', 'a').queryKey).not.toEqual(incomeReportQuery('2026-08', 'b').queryKey);
  try {
    await client.fetchQuery(cashflowQuery(period));
    await client.fetchQuery(incomeReportQuery('2026-08'));
    await client.fetchQuery(cashflowQuery(period, 'a /&'));
    await client.fetchQuery(incomeReportQuery('2026-08', 'a /&'));
    expect(fetch.mock.calls).toEqual([
      [`/api/cashflow?period=${period}`, expect.objectContaining({ method: 'GET' })],
      ['/api/reports/month/income?month=2026-08', expect.objectContaining({ method: 'GET' })],
      [`/api/cashflow?period=${period}&projectId=a%20%2F%26`, expect.objectContaining({ method: 'GET' })],
      ['/api/reports/month/income?month=2026-08&projectId=a%20%2F%26', expect.objectContaining({ method: 'GET' })],
    ]);
  } finally { client.clear(); }
});

it('drills into an actual scoped booking ID using supported ledger fields and retains project context only in the report return URL', () => {
  const back = '/reports/einnahmen-ausgaben/buchungen?projekt=a&darstellung=overview&monat=2026-08&zeitraum=2026-08..2026-08&zelle=inc&spalte=2026-08';
  const search = validateBookingsSearch({ buchung: 'salary-a', von: '2026-08-01', bis: '2026-08-31', ruecksprung: back });
  expect(search).toMatchObject({ buchung: 'salary-a', von: '2026-08-01', bis: '2026-08-31', ruecksprung: back });
  expect(filterFromSearch(search)).toMatchObject({ id: 'salary-a', from: '2026-08-01', to: '2026-08-31' });
  expect(filterFromSearch(search)).not.toHaveProperty('projectId');
});
