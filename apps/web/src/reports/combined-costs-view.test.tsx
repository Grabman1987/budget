// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import type { BankCostsReport, CostsTaxesReport } from '@budget/db';
import { CombinedCostsView } from './combined-costs-view';

afterEach(cleanup);

it('shows one total with trading fees counted once and the cost ratio', () => {
  const bank = {
    totalCents: 12_000,
    months: ['2025-10', '2026-09'],
    rows: [{ key: 'modeledInterest', cents: 0 }],
  } as unknown as BankCostsReport;
  const portfolio = {
    from: '2025-10-01',
    to: '2026-09-30',
    valueCents: 1_000_000,
    costs: { terCents: 3_000, fees: { totalCents: 999 } },
    taxes: { totalCents: 5_000 },
  } as unknown as CostsTaxesReport;
  render(<CombinedCostsView bank={bank} portfolio={portfolio} />);
  expect(screen.getByTestId('cc-total').textContent).toMatch(/200,00/);
  expect(document.body.textContent).toMatch(/Kostenquote: 2.?%/);
  expect(screen.getByTestId('cc-table').textContent).not.toMatch(/9,99/);
});
