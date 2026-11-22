// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { setAmountsHidden } from '@budget/ui';
import type { AnnualCostYear } from '@budget/db';
import { CombinedCostsView } from './combined-costs-view';

afterEach(() => {
  cleanup();
  setAmountsHidden(false);
});

const current = {
  year: 2026,
  from: '2026-01-01',
  to: '2026-09-30',
  partial: true,
  total: {
    householdCents: 10000,
    portfolioFeeCents: 2000,
    terCents: 3000,
    portfolioCostCents: 5000,
    taxCents: 5000,
    totalCents: 20000,
    ratioBp: 50,
  },
  valuationNotes: [],
  portfolioUnavailable: null,
  bankParts: [{ key: 'orders', name: 'Depot- / Transaktionsgebühren', cents: 1500 }],
  incomplete: {
    modeledInterestMissingFxPeriods: 0,
    skippedForeignTrades: 0,
    skippedForeignBookings: 0,
  },
} satisfies AnnualCostYear;
const prior = {
  ...current,
  year: 2025,
  from: '2025-01-01',
  to: '2025-12-31',
  partial: false,
  total: { ...current.total, taxCents: -4000, totalCents: 11000, ratioBp: 125 },
} satisfies AnnualCostYear;

it('keeps household costs and taxes out of the portfolio ratio and shows one grand total', () => {
  render(<CombinedCostsView selected={current} years={[current]} selectYear={vi.fn()} />);
  expect(screen.getByTestId('cc-total').textContent).toBe('200,00 €');
  expect(document.body.textContent).toMatch(/ohne Steuern\): 0,5 %/);
  expect(
    within(screen.getByTestId('cc-table')).getByRole('row', { name: /Haushalt/ }).textContent,
  ).toContain('100,00 €');
  expect(screen.getByTestId('cc-table').textContent).not.toMatch(/9,99/);
  expect(screen.queryByTestId('cc-incomplete')).toBeNull();
});

it('names missing sources and keeps a tax refund negative', () => {
  const selected = {
    ...prior,
    incomplete: {
      modeledInterestMissingFxPeriods: 2,
      skippedForeignTrades: 1,
      skippedForeignBookings: 0,
    },
  };
  render(<CombinedCostsView selected={selected} years={[selected]} selectYear={vi.fn()} />);
  expect(screen.getByTestId('cc-incomplete').textContent).toBe(
    'unvollständig: 2 Zinszeiträume ohne EUR-Kurs, 1 Trades ohne Wechselkurs.',
  );
  expect(
    within(screen.getByTestId('cc-table')).getByRole('row', { name: /Steuern \(einbehalten/ })
      .textContent,
  ).toContain('−40,00 €');
});

it('shows annual totals and ratios newest first, marks partial years, and selects a year', () => {
  const selectYear = vi.fn();
  render(<CombinedCostsView selected={current} years={[current, prior]} selectYear={selectYear} />);
  const rows = within(screen.getByTestId('cc-years')).getAllByRole('row');
  expect(rows[1]?.textContent).toBe('2026 · Teiljahr200,00 €0,5 %');
  expect(rows[2]?.textContent).toBe('2025110,00 €1,25 %');
  fireEvent.change(screen.getByRole('combobox', { name: 'Kalenderjahr' }), {
    target: { value: '2025' },
  });
  expect(selectYear).toHaveBeenCalledWith(2025);
});

it('masks amounts and ratios in both the selected year and the yearly table', () => {
  setAmountsHidden(true);
  render(<CombinedCostsView selected={current} years={[current, prior]} selectYear={vi.fn()} />);
  expect(screen.getByTestId('cc-total').textContent).toBe('••• €');
  expect(screen.getByTestId('cc-years').textContent).not.toMatch(/200,00|110,00|0,5|1,25/);
  expect(document.body.textContent).not.toMatch(/0,5 %|1,25 %/);
});
