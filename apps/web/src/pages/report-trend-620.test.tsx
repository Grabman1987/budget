// @vitest-environment jsdom
import { TrendLine } from '@budget/ui';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ReportRoute } from './reports-pages';

const state = vi.hoisted(() => ({ reportId: '', search: {} as Record<string, unknown> }));
vi.mock('@tanstack/react-router', () => ({
  useParams: () => ({ reportId: state.reportId }),
  useSearch: () => state.search,
}));

// Exercise the route's opt-in with the real chart consumer, without report network reads.
function Chart() {
  return <svg><TrendLine points={[[0, 0], [1, 1], [2, 2]]} /></svg>;
}
vi.mock('../reports/income-cashflow-report', () => ({ IncomeCashflowReport: Chart }));
vi.mock('../reports/wealth-report-views', () => ({ WealthReportViews: Chart }));
vi.mock('../reports/portfolio-report-views', () => ({ PortfolioReportViews: Chart }));

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

it.each([
  ['einnahmen-ausgaben', 'cashflow'],
  ['vermoegen-schulden', 'verlauf'],
  ['pallocation', 'einzahlungen'],
])('keeps the bookmarked trend visible on canonical %s/%s', (reportId, darstellung) => {
  state.reportId = reportId;
  state.search = { darstellung, trend: true };
  render(<ReportRoute />);
  expect(screen.getByTestId('report-trend-line').getAttribute('d')).toBe('M0,0L2,2');
});

it.each([
  ['einnahmen-ausgaben', 'overview', true],
  ['vermoegen-schulden', 'bilanz', true],
  ['pallocation', 'rendite', true],
  ['einnahmen-ausgaben', 'cashflow', false],
  ['vermoegen-schulden', 'verlauf', false],
])('does not opt unsupported or disabled %s/%s into a trend', (reportId, darstellung, trend) => {
  state.reportId = reportId;
  state.search = { darstellung, trend };
  render(<ReportRoute />);
  expect(screen.queryByTestId('report-trend-line')).toBeNull();
});
