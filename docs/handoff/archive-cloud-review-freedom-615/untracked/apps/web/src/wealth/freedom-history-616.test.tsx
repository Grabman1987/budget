// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setAmountsHidden } from '@budget/ui';
import { projectFreedom } from '@budget/domain';
import type { FreedomInvestedHistory } from '@budget/db';
import { afterEach, expect, it, vi } from 'vitest';
import { FreedomChart } from './freedom-chart';

vi.mock('../charts/use-element-width', () => ({ useElementWidth: () => [{ current: null }, 640] }));
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
  expect(screen.getByTestId('freedom-chart').querySelector('.l-trend')).toBeNull();
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
