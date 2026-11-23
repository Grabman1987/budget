// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { findReport } from '../nav/reports-catalog';
import { SpendingReportViews } from './spending-report-views';
import { validateReportSearch } from './report-search';

const state = vi.hoisted(() => ({
  search: {} as Record<string, unknown>,
  navigate: vi.fn(),
  REDESIGN_ENABLED: true,
}));
vi.mock('../shell/redesign-flag', () => state);
vi.mock('@tanstack/react-router', () => ({
  useSearch: () => state.search,
  useNavigate: () => state.navigate,
}));
vi.mock('./spending-analysis-report', () => ({
  SpendingAnalysisReport: ({
    viewControl,
    comparison,
    onComparisonChange,
  }: {
    viewControl: React.ReactNode;
    comparison: string;
    onComparisonChange: (value: 'vorperiode' | 'vorjahr') => void;
  }) => (
    <div>
      {viewControl}
      <button type="button" onClick={() => onComparisonChange('vorjahr')}>
        mode-{comparison}
      </button>
      <p>Group body</p>
    </div>
  ),
}));
vi.mock('./category-report', () => ({
  CategoryReport: ({ viewControl }: { viewControl: React.ReactNode }) => (
    <div>
      {viewControl}
      <p>Category body</p>
    </div>
  ),
}));
vi.mock('../pages/payee-analysis-report', () => ({
  PayeeAnalysisReport: () => <p>Payee body</p>,
}));
afterEach(() => {
  cleanup();
  state.search = {};
  state.REDESIGN_ENABLED = true;
  state.navigate.mockReset();
});
const props = {
  report: findReport('ausgaben')!,
  meta: { area: 'reports', title: 'Ausgaben', fills: 'Reports', spec: 'Synthetic report' } as const,
};

it('retains the category view in validated URLs and opens it directly in ON', () => {
  state.search = validateReportSearch({ darstellung: 'kategorien', kategorien: ['synthetic'] });
  expect(state.search.darstellung).toBe('kategorien');
  render(<SpendingReportViews {...props} />);
  expect(screen.getByText('Category body')).toBeTruthy();
  // The views are indented entries of the report menu (#1150), not a select.
  expect(screen.queryByRole('combobox')).toBeNull();
});

it('keeps the OFF view set and fallback unchanged', () => {
  state.REDESIGN_ENABLED = false;
  state.search = { darstellung: 'kategorien' };
  render(<SpendingReportViews {...props} />);
  expect(screen.getByText('Group body')).toBeTruthy();
  expect(screen.getAllByRole('button')).toHaveLength(3);
  expect(validateReportSearch({ darstellung: 'kategorien' }).darstellung).toBeUndefined();
});

it('keeps the comparison mode in the address and clears it for the default', () => {
  state.search = validateReportSearch({ vergleich: 'vorjahr' });
  expect(state.search.vergleich).toBe('vorjahr');
  expect(validateReportSearch({ vergleich: 'x' })).toHaveProperty('vergleich', undefined);
  render(<SpendingReportViews {...props} />);
  fireEvent.click(screen.getByText('mode-vorjahr'));
  const options = state.navigate.mock.calls[0]![0];
  expect(options.search({ zeitraum: '3M' })).toEqual({
    zeitraum: '3M',
    vergleich: 'vorjahr',
  });
  expect(options.replace).toBe(true);
});

it('defaults a retired custom comparison to Vorperiode and retains selected categories', () => {
  state.search = validateReportSearch({
    vergleich: 'eigen',
    vergleichVon: '2025-05-03',
    vergleichBis: '2025-05-05',
    kategorien: ['synthetic'],
  });
  expect(state.search).toMatchObject({ vergleich: undefined, kategorien: ['synthetic'] });
  expect(state.search).not.toHaveProperty('vergleichVon');
  expect(state.search).not.toHaveProperty('vergleichBis');
  render(<SpendingReportViews {...props} />);
  expect(screen.getByText('mode-vorperiode')).toBeTruthy();
});
