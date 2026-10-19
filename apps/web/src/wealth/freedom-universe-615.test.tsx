// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { setAmountsHidden } from '@budget/ui';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import type { FreedomView } from './freedom-api';
import { FreedomContent } from './freedom-page';

vi.mock('../shell/app-link', () => ({
  AppLink: ({ children }: { children: ReactNode }) => <a href="#synthetic">{children}</a>,
}));
vi.mock('../charts/use-element-width', () => ({ useElementWidth: () => [{ current: null }, 640] }));
afterEach(() => {
  cleanup();
  setAmountsHidden(false);
});
const view: FreedomView = {
  asOf: '2024-02-01',
  refMonth: '2024-01',
  months: [{ month: '2024-01', consumptionCents: 100 }],
  annualSpendCents: 1200,
  multiple: 25,
  targetCents: 30000,
  investedCents: 25000,
  progressBp: 8333,
  defaultRealReturnBp: 500,
  defaultSavingCents: 0,
  savingMonths: 4,
  expensesUnsafe: false,
  accounts: [
    {
      id: 'selected',
      name: 'Selected brokerage',
      valueCents: 20000,
      missingPrice: false,
      missingFxCurrencies: [],
    },
    {
      id: 'savings',
      name: 'Selected savings',
      valueCents: 7000,
      missingPrice: false,
      missingFxCurrencies: [],
    },
    {
      id: 'negative',
      name: 'Negative settlement',
      valueCents: -2000,
      missingPrice: false,
      missingFxCurrencies: [],
    },
  ],
};

it('keeps the current-selection history note next to the curve and masks every source amount in privacy mode', () => {
  render(<FreedomContent view={view} />);
  const chartSection = screen.getByRole('heading', { name: 'Weg zum Ziel' }).closest('section')!;
  expect(
    within(chartSection).getByText(
      'Kontenauswahl Stand heute · gilt auch für historische Bewertungen.',
    ),
  ).toBeTruthy();
  expect(within(chartSection).getByTestId('freedom-chart')).toBeTruthy();
  const accounts = document.getElementById('freedom-accounts')!;
  expect(within(accounts).getAllByRole('row')).toHaveLength(4);
  expect(accounts.textContent).toContain('Selected savings');
  expect(accounts.textContent).toContain('−20,00');
  act(() => setAmountsHidden(true));
  expect(accounts.textContent).not.toMatch(/200,00|70,00|20,00/);
  expect(accounts.textContent).toContain('•••');
  expect(within(chartSection).getByText(/Kontenauswahl Stand heute/)).toBeTruthy();
});
