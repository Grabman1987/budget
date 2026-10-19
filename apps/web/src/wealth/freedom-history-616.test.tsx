// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setAmountsHidden } from '@budget/ui';
import { projectFreedom } from '@budget/domain';
import type { FreedomInvestedHistory } from '@budget/db';
import { afterEach, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { FreedomChart } from './freedom-chart';
import { FreedomContent } from './freedom-page';

vi.mock('../charts/use-element-width', () => ({ useElementWidth: () => [{ current: null }, 640] }));
vi.mock('../shell/app-link', () => ({
  AppLink: ({ children }: { children: ReactNode }) => <a href="#synthetic">{children}</a>,
}));
afterEach(() => {
  cleanup();
  setAmountsHidden(false);
});
const history: FreedomInvestedHistory = {
  availableFrom: '2023-10-01',
  monthEnds: [
    { date: '2023-10-31', investedCents: 10000 },
    { date: '2023-11-30', investedCents: null },
    { date: '2023-12-31', investedCents: 30000 },
  ],
  current: { date: '2024-01-15', investedCents: 35000 },
};
const projection = projectFreedom({
  investedCents: 35000,
  monthlySavingCents: 3000,
  realReturnBp: 0,
  targetCents: 50000,
  startMonth: '2024-01',
});
const chart = (p = projection) => (
  <FreedomChart history={history} projection={p} target={50000} startMonth="2024-01" />
);

it('draws two actual segments without trend fitting, inspects dated gaps and masks tooltip/table amounts', async () => {
  render(chart());
  expect(screen.getAllByTestId('freedom-actual-segment')).toHaveLength(2);
  expect(screen.getByTestId('freedom-chart').querySelector('.report-trend-line')).toBeNull();
  const group = screen.getByRole('group', { name: /Investiertes Vermögen: Ist/ });
  act(() => group.focus());
  expect(screen.getByRole('status').textContent).toContain('31.10.2023');
  expect(screen.getByRole('status').textContent).toContain('100,00');
  await userEvent.keyboard('{ArrowRight}');
  expect(screen.getByRole('status').textContent).toContain('30.11.2023');
  expect(screen.getByRole('status').textContent).toContain('–');
  await userEvent.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}');
  expect(screen.getByRole('status').textContent).toContain('500,00');
  act(() => setAmountsHidden(true));
  expect(screen.getByRole('status').textContent).not.toMatch(/100,00|300,00|350,00|500,00/);
  expect(screen.getByRole('status').textContent).toContain('•••');
  const table = screen.getByTestId('freedom-history-table');
  expect(table.textContent).toContain('nicht bewertbar');
  expect(table.textContent).toContain('Heute');
  expect(table.textContent).not.toMatch(/100,00|300,00|350,00/);
  await userEvent.keyboard('{Escape}');
  expect(screen.queryByRole('status')).toBeNull();
});

it('retains exact forecast table values and restores historical chart if the forecast becomes unavailable', async () => {
  const { rerender } = render(chart());
  await userEvent.click(screen.getByRole('switch', { name: 'Prognosewerte als Tabelle' }));
  const rows = within(screen.getByTestId('freedom-table')).getAllByRole('row').slice(1);
  expect(
    rows.map((row) => within(row).getAllByRole('cell')[1]!.textContent?.replace(/\s/g, '')),
  ).toEqual(['350,00€', '500,00€']);
  rerender(
    <FreedomChart
      history={{ ...history, current: { ...history.current, investedCents: null } }}
      projection={null}
      target={null}
      startMonth="2024-01"
    />,
  );
  expect(screen.getByTestId('freedom-chart')).toBeTruthy();
  expect(screen.getAllByTestId('freedom-actual-segment')).toHaveLength(2);
  expect(screen.queryByRole('switch')).toBeNull();
});

it('the actual page retains known history when the current source valuation prevents every forecast', () => {
  render(
    <FreedomContent
      view={{
        asOf: '2024-01-15',
        refMonth: '2023-12',
        months: [{ month: '2023-12', consumptionCents: 100 }],
        annualSpendCents: 1200,
        multiple: 25,
        targetCents: 30000,
        investedCents: null,
        progressBp: null,
        defaultRealReturnBp: 500,
        defaultSavingCents: 0,
        savingMonths: 1,
        expensesUnsafe: false,
        accounts: [
          {
            id: 'synthetic',
            name: 'Synthetic missing source',
            valueCents: null,
            missingPrice: true,
            missingFxCurrencies: [],
          },
        ],
        investedHistory: { ...history, current: { ...history.current, investedCents: null } },
      }}
    />,
  );
  const way = screen.getByRole('heading', { name: 'Weg zum Ziel' }).closest('section')!;
  expect(within(way).getByTestId('freedom-chart')).toBeTruthy();
  expect(within(way).getAllByTestId('freedom-actual-segment')).toHaveLength(2);
  expect(within(way).queryByRole('switch')).toBeNull();
  expect(within(way).getByTestId('freedom-history-table').textContent).toContain('300,00');
  expect(way.textContent).toContain('nicht vollständig bewertbar');
});

it.each([
  { targetCents: -30000, annualSpendCents: -1200, consumptionCents: -100 },
  { targetCents: 0, annualSpendCents: 0, consumptionCents: 0 },
])(
  'retains actual history without drawing invalid target $targetCents',
  ({ targetCents, annualSpendCents, consumptionCents }) => {
    render(
      <FreedomContent
        view={{
          asOf: '2024-01-15',
          refMonth: '2023-12',
          months: [{ month: '2023-12', consumptionCents }],
          annualSpendCents,
          multiple: 25,
          targetCents,
          investedCents: 35000,
          progressBp: null,
          defaultRealReturnBp: 500,
          defaultSavingCents: 0,
          savingMonths: 1,
          expensesUnsafe: false,
          accounts: [],
          investedHistory: history,
        }}
      />,
    );
    const way = screen.getByRole('heading', { name: 'Weg zum Ziel' }).closest('section')!;
    expect(within(way).getByTestId('freedom-chart')).toBeTruthy();
    expect(within(way).getAllByTestId('freedom-actual-segment')).toHaveLength(2);
    expect(within(way).getByTestId('freedom-chart').querySelector('.l-goal')).toBeNull();
    expect(way.textContent).toContain('kein positives Ziel');
  },
);
