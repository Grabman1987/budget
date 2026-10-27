// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SpendingReportViews } from './spending-report-views';
import { WealthReportViews } from './wealth-report-views';
import { validateReportSearch } from './report-search';
import { findReport } from '../nav/reports-catalog';
import { REPORTS_CATALOG } from '../nav/pages';

const state = vi.hoisted(() => ({ search: {} as Record<string, unknown>, navigate: vi.fn() }));
vi.mock('@tanstack/react-router', () => ({ useSearch: () => state.search, useNavigate: () => state.navigate }));
vi.mock('../pages/payee-analysis-report', () => ({
  PayeeAnalysisReport: ({ viewControl, selection }: { viewControl: ReactNode; selection: { id: string | null; onChange: (id: string | null) => void; onPeriodChange: (period: string) => void } }) =>
    <div data-testid="payee-body">{viewControl}<span>{selection.id}</span><button onClick={() => selection.onChange('recipient-b')}>Select recipient</button><button onClick={() => selection.onPeriodChange('3M')}>Change payee period</button></div>,
}));
vi.mock('./spending-analysis-report', () => ({ SpendingAnalysisReport: ({ viewControl, onPeriodChange }: { viewControl: ReactNode; onPeriodChange: (period: string) => void }) => <div data-testid="group-body">{viewControl}<button onClick={() => onPeriodChange('3M')}>Change group period</button></div> }));
vi.mock('./assets-debts-report', () => ({ AssetsDebtsReport: ({ viewControl }: { viewControl: ReactNode }) => <div data-testid="balance-body">{viewControl}</div> }));
vi.mock('./wealth-history-report', () => ({ WealthHistoryReport: ({ viewControl }: { viewControl: ReactNode }) => <div data-testid="history-body">{viewControl}</div> }));
vi.mock('./whole-picture-report', () => ({ WholePictureReport: ({ viewControl }: { viewControl: ReactNode }) => <div data-testid="whole-body">{viewControl}</div> }));
const patch = () => {
  const call = state.navigate.mock.calls.at(-1)![0] as { search: (previous: Record<string, unknown>) => Record<string, unknown>; replace?: boolean };
  return { search: call.search(state.search), replace: call.replace };
};
afterEach(() => { cleanup(); state.search = {}; state.navigate.mockReset(); });

it('unions every view selector with saved IDs, scoped income, exact windows and bounded recipient IDs', () => {
  for (const darstellung of ['income', 'overview', 'cashflow', 'gruppen', 'empfaenger', 'bilanz', 'verlauf', 'gesamt']) {
    expect(validateReportSearch({ darstellung, empfaenger: 'none', ansicht: 'server-id', projekt: 'a', exakt: 'true', gruppen: ['g'], kategorien: ['c'] })).toMatchObject({ darstellung, empfaenger: 'none', ansicht: 'server-id', projekt: 'a', exakt: true, gruppen: ['g'], kategorien: ['c'] });
  }
  expect(validateReportSearch({ darstellung: 'unknown', empfaenger: 'x'.repeat(65), projekt: 'x'.repeat(65) })).toMatchObject({ darstellung: undefined, empfaenger: undefined, projekt: undefined, projektUngueltig: true });
});
it('keeps only one spending body mounted and preserves the URL tuple through view and recipient changes', () => {
  state.search = { darstellung: 'gruppen', zeitraum: '2026-08..2026-08', empfaenger: 'recipient-a', ansicht: 'server-id', exakt: true, monat: '2026-08', gruppen: ['g'] };
  const report = findReport('ausgaben')!;
  const view = render(<SpendingReportViews report={report} meta={REPORTS_CATALOG} />);
  expect(getComputedStyle(screen.getByTestId('group-body')).display).not.toBe('none');
  expect(getComputedStyle(screen.getByTestId('group-body')).visibility).toBe('visible');
  expect(screen.queryByTestId('payee-body')).toBeNull();
  expect(state.navigate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Change group period' }));
  expect(patch()).toEqual({ search: { ...state.search, zeitraum: '3M', empfaenger: undefined }, replace: true });
  fireEvent.click(screen.getByRole('button', { name: 'Empfänger' }));
  expect(patch().search).toEqual({ ...state.search, darstellung: 'empfaenger' });
  state.search = patch().search;
  view.rerender(<SpendingReportViews report={report} meta={REPORTS_CATALOG} />);
  expect(screen.getByTestId('payee-body').textContent).toContain('recipient-a');
  expect(screen.queryByTestId('group-body')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Select recipient' }));
  expect(patch().search).toEqual({ ...state.search, empfaenger: 'recipient-b' });
  fireEvent.click(screen.getByRole('button', { name: 'Change payee period' }));
  expect(patch()).toEqual({ search: { ...state.search, zeitraum: '3M', empfaenger: undefined }, replace: true });
});
it.each([
  ['bilanz', 'balance-body', 'Vermögensverlauf', 'Alles'],
  ['verlauf', 'history-body', 'Gesamtübersicht', 'YTD'],
  ['gesamt', 'whole-body', 'Vermögen und Schulden', '1J'],
])('materializes only the current %s reader fallback at a real switch', (darstellung, body, next, period) => {
  state.search = { darstellung, monat: '2026-08', ansicht: 'server-id', exakt: true, projekt: 'a' };
  render(<WealthReportViews report={findReport('vermoegen-schulden')!} meta={REPORTS_CATALOG} />);
  expect(getComputedStyle(screen.getByTestId(body)).display).not.toBe('none');
  expect(getComputedStyle(screen.getByTestId(body)).visibility).toBe('visible');
  expect(state.navigate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: next }));
  expect(patch().search).toMatchObject({ zeitraum: period, monat: '2026-08', ansicht: 'server-id', exakt: true, projekt: 'a' });
});
it('preserves an explicit calendar period and selected month rather than adopting the destination default', () => {
  state.search = { darstellung: 'bilanz', zeitraum: '2026-08..2026-08', monat: '2026-08' };
  render(<WealthReportViews report={findReport('vermoegen-schulden')!} meta={REPORTS_CATALOG} />);
  fireEvent.click(screen.getByRole('button', { name: 'Gesamtübersicht' }));
  expect(patch().search).toEqual({ ...state.search, darstellung: 'gesamt' });
});
