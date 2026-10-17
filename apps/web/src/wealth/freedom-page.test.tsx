// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { addMonths } from '@budget/domain';
import type { FreedomView } from './freedom-api';
import { FreedomContent } from './freedom-page';

vi.mock('../shell/app-link', () => ({
  AppLink: ({ children }: { children: ReactNode }) => <a href="#x">{children}</a>,
}));
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
  defaultSavingCents: 5_000,
  savingMonths: 6,
  accounts: [],
  expensesUnsafe: false,
};

const text = (id: string) => document.getElementById(id)!;

it('has no heading of level 1 of its own and keeps the explanations hidden until asked', () => {
  render(<FreedomContent view={view} />);
  expect(screen.queryAllByRole('heading', { level: 1 })).toHaveLength(0);
  expect(screen.getByTestId('freedom-annual-spend').textContent).toContain('Jahresausgaben');
  expect(text('freedom-info-figure').hidden).toBe(true);
  expect(text('freedom-info-assumptions').hidden).toBe(true);
});

it('opens each explanation with the keyboard, one at a time, and closes it with Escape', async () => {
  render(<FreedomContent view={view} />);
  const figure = screen.getByRole('button', { name: 'Erklärung: Freiheitszahl' });
  const assumptions = screen.getByRole('button', { name: 'Erklärung: Annahmen' });
  expect(figure.getAttribute('aria-expanded')).toBe('false');
  figure.focus();
  await userEvent.keyboard('{Enter}');
  expect(figure.getAttribute('aria-expanded')).toBe('true');
  expect(text('freedom-info-figure').hidden).toBe(false);
  expect(text('freedom-info-figure').textContent).toContain('4 % Entnahme');
  await userEvent.keyboard('{Escape}');
  expect(figure.getAttribute('aria-expanded')).toBe('false');
  expect(text('freedom-info-figure').hidden).toBe(true);

  assumptions.focus();
  await userEvent.keyboard(' ');
  expect(text('freedom-info-assumptions').hidden).toBe(false);
  expect(text('freedom-info-assumptions').textContent).toContain('Ø 6 abgeschlossene Monate');
  expect(text('freedom-info-assumptions').textContent).toContain('nicht gespeichert');
  await userEvent.keyboard('{Enter}');
  expect(text('freedom-info-assumptions').hidden).toBe(true);
});

it('shows the forecast as a chart first and as the same numbers in a table via the switch', async () => {
  render(<FreedomContent view={view} />);
  expect(screen.getByTestId('freedom-chart')).toBeTruthy();
  await userEvent.click(screen.getByRole('switch', { name: 'Prognosewerte als Tabelle' }));
  expect(screen.getByTestId('freedom-table')).toBeTruthy();
  expect(screen.queryByTestId('freedom-chart')).toBeNull();
});
