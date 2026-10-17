// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { addMonths } from '@budget/domain';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { freedomScenario } from './freedom-model';
import type { FreedomView } from './freedom-api';
import { FreedomChart } from './freedom-chart';
import { eur } from '../ledger/format';

vi.mock('../charts/use-element-width', () => ({ useElementWidth: () => [{ current: null }, 640] }));
afterEach(cleanup);

const view: FreedomView = {
  asOf: '2026-10-01',
  refMonth: '2026-09',
  months: Array.from({ length: 12 }, (_, i) => ({
    month: addMonths('2025-10', i),
    consumptionCents: i === 11 ? 4000 : 0,
  })),
  annualSpendCents: 4_000,
  multiple: 25,
  targetCents: 100_000,
  investedCents: 0,
  progressBp: 0,
  defaultRealReturnBp: 500,
  defaultSavingCents: 0,
  savingMonths: 6,
  accounts: [],
  expensesUnsafe: false,
};
const projection = freedomScenario(view, '50', 0).projection!;
const draw = () =>
  render(<FreedomChart projection={projection} target={100_000} startMonth="2026-10" />);

it('is a real switch that swaps the chart for a table of the same forecast values', async () => {
  draw();
  const toggle = screen.getByRole('switch', { name: 'Prognosewerte als Tabelle' });
  expect(toggle.getAttribute('aria-checked')).toBe('false');
  expect(screen.getByTestId('freedom-chart')).toBeTruthy();
  expect(screen.queryByTestId('freedom-table')).toBeNull();

  await userEvent.click(toggle);
  expect(toggle.getAttribute('aria-checked')).toBe('true');
  expect(screen.queryByTestId('freedom-chart')).toBeNull();
  const rows = within(screen.getByTestId('freedom-table')).getAllByRole('row').slice(1);
  expect(rows).toHaveLength(projection.yearlyPath.length);
  expect(rows.map((r) => within(r).getAllByRole('cell')[1]!.textContent)).toEqual(
    projection.yearlyPath.map((v) => eur(v)),
  );

  await userEvent.click(toggle);
  expect(screen.getByTestId('freedom-chart')).toBeTruthy();
  expect(screen.queryByTestId('freedom-table')).toBeNull();
});

it('is operable from the keyboard and the visible label toggles it', async () => {
  draw();
  const toggle = screen.getByRole('switch', { name: 'Prognosewerte als Tabelle' });
  toggle.focus();
  await userEvent.keyboard(' ');
  expect(screen.getByTestId('freedom-table')).toBeTruthy();
  await userEvent.click(screen.getByText('Prognosewerte als Tabelle'));
  expect(screen.getByTestId('freedom-chart')).toBeTruthy();
});
