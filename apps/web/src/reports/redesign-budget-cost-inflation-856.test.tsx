// @vitest-environment jsdom
import { IndexChart } from './personal-inflation-report';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as http from '../api/http';
import { BudgetAdherenceReportPage } from './budget-adherence-report';
import { findReport } from '../nav/reports-catalog';
import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { setAmountsHidden } from '@budget/ui';
import type {
  BankCostsReport,
  BudgetAdherenceReport,
  ContractsReport,
  InflationReport,
  PlanningAccuracyReport,
} from '@budget/db';
import { afterEach, expect, it, vi } from 'vitest';
import { REPORTS_CATALOG } from '../nav/pages';
import { ReportFrame } from './report-frame';
import { ReportViewControl } from './report-view-control';
import { BudgetPlanSummary } from './budget-plan-summary';
import { ContractsSummary } from './contracts-summary';
import {
  adherenceCalculation,
  adherenceGroups,
  accuracyCalculation,
  bankCostsCalculation,
  contractsCalculation,
  inflationCalculation,
} from './budget-cost-inflation-presentation';
import { validateReportSearch } from './report-search';
const flag = vi.hoisted(() => ({ REDESIGN_ENABLED: true }));
vi.mock('../shell/redesign-flag', () => flag);
vi.mock('@tanstack/react-router', () => ({
  useParams: () => ({ reportId: 'inflation' }),
  useSearch: () => ({ monat: '2026-08' }),
  useNavigate: () => vi.fn(),
}));
vi.mock('../shell/app-link', () => ({
  AppLink: ({ to, children, ...rest }: { to: string; children: ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('./report-navigation', () => ({
  ReportNavigation: () => <nav aria-label="Weitere Berichte" />,
}));
vi.mock('../pages/placeholder-page', () => ({
  PageFrame: ({ children }: { children: ReactNode }) => (
    <div data-testid="legacy-frame">{children}</div>
  ),
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  flag.REDESIGN_ENABLED = true;
  act(() => setAmountsHidden(false));
});

it('ON shows the supplied full-month budget, signed assignments and exact groups without prorating the plan', () => {
  const data = {
    status: 'ok',
    live: true,
    liveUntil: '2026-09-17',
    groups: ['Synthetic group'],
    planCents: 9801,
    istCents: 10002,
    restCents: -201,
    items: [
      { groupName: 'Synthetic group', planCents: 10001, istCents: 10002 },
      { groupName: 'Synthetic group', planCents: -200, istCents: 0 },
    ],
  } as BudgetAdherenceReport;
  expect(adherenceGroups(data)).toEqual([
    { name: 'Synthetic group', planCents: 9801, istCents: 10002 },
  ]);
  expect(adherenceCalculation(data).terms.map((t) => t.value)).toEqual([9801, 10002]);
  render(<BudgetPlanSummary data={data} />);
  expect(screen.getByText('2,01 € über Plan · jetzt im Plan umschichten')).toBeTruthy();
  fireEvent.click(screen.getByText('Tabelle anzeigen'));
  expect(screen.getByRole('table').textContent).toContain('98,01 €');
  expect(screen.getByRole('table').textContent).toContain('100,02 €');
  expect(adherenceCalculation({ ...data, status: 'future' }).result.value).toBeNull();
});

it('ON keeps native contract amounts and missing FX distinct, and separates booked from modeled costs', () => {
  const data = {
    fixedMonthlyCents: 10001,
    boundMonthlyCents: 10001,
    periodicAnnualCents: 1,
    yearlyCents: 120013,
    unconvertedCount: 1,
    items: [
      {
        id: 'native',
        name: 'Synthetic FX',
        groupName: 'Synthetic contracts',
        currency: 'USD',
        nativeCents: 101,
        monthlyCents: null,
        yearlyCents: null,
        rhythm: 'monthly',
      },
    ],
  } as ContractsReport;
  const view = render(<ContractsSummary data={data} />);
  expect(view.container.textContent).toContain('USD');
  expect(view.container.textContent).toContain('Kurs fehlt');
  expect(view.container.textContent).not.toContain('Kündigung:');
  expect(contractsCalculation(data).terms.map((t) => t.value)).toEqual([120012, 1]);
  expect(contractsCalculation(data).result.value).toBe(120013);
  const costs = {
    months: ['2026-08'],
    totalCents: 1691,
    rows: [{ key: 'modeledInterest', cents: 1000 }],
  } as BankCostsReport;
  expect(bankCostsCalculation(costs).terms.map((t) => t.value)).toEqual([691, 1000]);
  expect(bankCostsCalculation(costs).result.value).toBe(1691);
  expect(bankCostsCalculation({ ...costs, months: [] }).result.value).toBeNull();
  expect(
    accuracyCalculation({
      summary: { count: 1, hits: 1, meanAbsoluteBp: 0 },
    } as PlanningAccuracyReport).result.value,
  ).toBeNull();
});

it('ON renders actual percentage inputs and Pp without currency, masks them, and OFF retains its frame/control/query contract', () => {
  const calculation = inflationCalculation({
    latestComparison: { month: '2026-08', ownBp: 430, referenceBp: 360, differenceBp: 70 },
  } as InflationReport);
  const props = { meta: REPORTS_CATALOG, title: 'Persönliche Inflation', calculation };
  const view = render(<ReportFrame {...props} />);
  expect(screen.getByTestId('report-frame-result').textContent).toBe('+0,7 Pp');
  expect(screen.getByTestId('report-calculation').textContent).toContain('+4,3 %');
  expect(screen.getByTestId('report-calculation').textContent).not.toContain('€');
  expect(
    inflationCalculation({
      latestComparison: null,
      indexFrom: null,
      indexTo: null,
      fromMonth: null,
      toMonth: null,
      inflationBp: null,
    } as InflationReport).result.value,
  ).toBeNull();
  expect(
    inflationCalculation({
      latestComparison: null,
      indexFrom: 100,
      indexTo: 100,
      fromMonth: '2025-08',
      toMonth: '2026-08',
      inflationBp: 0,
    } as InflationReport).result.value,
  ).toBe(0);

  act(() => setAmountsHidden(true));
  expect(screen.getByTestId('report-calculation').textContent).not.toContain('4,3');
  flag.REDESIGN_ENABLED = false;
  view.rerender(
    <ReportFrame {...props}>
      <p>Legacy body</p>
    </ReportFrame>,
  );
  expect(screen.getByTestId('legacy-frame').textContent).toBe('Legacy body');
  view.rerender(
    <ReportViewControl
      label="View"
      options={[{ value: 'base', label: 'Seit Basis' }]}
      value="base"
      onChange={() => {}}
    />,
  );
  expect(screen.getByRole('button', { name: 'Seit Basis', pressed: true })).toBeTruthy();
  expect(
    validateReportSearch({ inflationsansicht: 'explorer', warenkorb: 'year' }),
  ).not.toHaveProperty('warenkorb');
  flag.REDESIGN_ENABLED = true;
  expect(validateReportSearch({ inflationsansicht: 'explorer', warenkorb: 'year' })).toMatchObject({
    inflationsansicht: 'explorer',
    warenkorb: 'year',
  });
});

it('ON index privacy masks the endpoint and accessible value; OFF retains its original index label', () => {
  const props = {
    data: {
      referenceAvailable: false,
      points: [
        { month: '2025-08', index: 100, reference: null },
        { month: '2026-08', index: 110, reference: null },
      ],
    },
    width: 320,
  };
  const view = render(<IndexChart {...props} />);
  expect(view.container.querySelector('.svg-label-strong')!.textContent).toBe('110,0');
  act(() => setAmountsHidden(true));
  expect(view.container.querySelector('.svg-label-strong')!.textContent).toBe('•••');
  expect(
    screen.getByRole('group', { name: /Persönlicher Preisindex/ }).getAttribute('aria-label'),
  ).not.toContain('110,0');
  flag.REDESIGN_ENABLED = false;
  view.rerender(<IndexChart {...props} />);
  expect(view.container.querySelector('.svg-label-strong')!.textContent).toBe('110,0');
});

it('ON clears a cached headline when its real query enters a refetch error', async () => {
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  vi.spyOn(http, 'request').mockRejectedValue(new Error('Synthetic failed read'));
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  });
  const key = ['ledger', 'budget-adherence', '2026-08'];
  client.setQueryData(key, {
    month: '2026-08',
    status: 'ok',
    live: false,
    liveUntil: null,
    groups: [],
    items: [],
    overCount: 0,
    planCents: 10001,
    istCents: 10002,
    restCents: -1,
    allocation: [],
    deviation: { from: null, to: null, rows: [] },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <BudgetAdherenceReportPage report={findReport('budgettreue')!} meta={REPORTS_CATALOG} />
    </QueryClientProvider>,
  );
  try {
    expect(screen.getByTestId('report-frame-result').textContent).toBe('−0,01 €');
    await act(async () => {
      await client.invalidateQueries({ queryKey: key });
    });
    await screen.findByRole('alert');
    expect(client.getQueryData(key)).toMatchObject({ restCents: -1 });
    expect(screen.getByTestId('report-frame-result').textContent).toBe('—');
    expect(screen.getByTestId('report-frame-basis').textContent).toBe('nicht verfügbar');
  } finally {
    view.unmount();
    client.clear();
  }
});
