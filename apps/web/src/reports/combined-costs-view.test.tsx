// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import type { BankCostsReport, CostsTaxesReport } from '@budget/db';
import { CombinedCostsView } from './combined-costs-view';

afterEach(cleanup);

const portfolio = {
  from: '2025-10-01',
  to: '2026-09-30',
  valueCents: 1_000_000,
  costs: { terCents: 3_000, fees: { totalCents: 999 } },
  taxes: { totalCents: 5_000 },
} as unknown as CostsTaxesReport;

it('keeps household costs and taxes out of the portfolio ratio and shows one grand total', () => {
  const bank = {
    totalCents: 12_000,
    portfolioAccountFeeCents: 500,
    months: ['2025-10', '2026-09'],
    rows: [
      { key: 'modeledInterest', cents: 0 },
      { key: 'orders', cents: 1_500 },
    ],
    modeledInterestMissingFxPeriods: 0,
    skippedForeignTrades: 0,
  } as unknown as BankCostsReport;
  render(<CombinedCostsView bank={bank} portfolio={portfolio} />);
  // 12 000 bank + 3 000 TER + 5 000 tax; ratio only (1 500 + 500 + 3 000) / 1 000 000 = 0,5 %.
  expect(screen.getByTestId('cc-total').textContent).toMatch(/200,00/);
  expect(document.body.textContent).toMatch(/ohne Steuern\): 0,5.?%/);
  expect(screen.getByTestId('cc-table').textContent).toMatch(/Zinskosten100,00/);
  expect(screen.getByTestId('cc-table').textContent).not.toMatch(/9,99/);
  expect(screen.queryByTestId('cc-incomplete')).toBeNull();
});

it('names an incomplete bank report and keeps a tax refund negative', () => {
  const bank = {
    totalCents: 1_000,
    portfolioAccountFeeCents: 0,
    months: ['2026-09'],
    rows: [],
    modeledInterestMissingFxPeriods: 2,
    skippedForeignTrades: 1,
  } as unknown as BankCostsReport;
  render(
    <CombinedCostsView
      bank={bank}
      portfolio={{ ...portfolio, taxes: { totalCents: -4_000 } } as unknown as CostsTaxesReport}
    />,
  );
  expect(screen.getByTestId('cc-incomplete').textContent).toBe(
    'unvollständig: 2 Zinszeiträume ohne EUR-Kurs, 1 Trades ohne Wechselkurs.',
  );
  expect(screen.getByTestId('cc-table').textContent).toMatch(
    /Steuern \(einbehalten\/erstattet\)[^A-Za-z]*40,00/,
  );
});

it('splits bank and interest costs by calendar year, newest first, and marks partial years', () => {
  const bank = {
    totalCents: 1_000,
    portfolioAccountFeeCents: 0,
    months: ['2026-09'],
    rows: [],
    modeledInterestMissingFxPeriods: 0,
    skippedForeignTrades: 0,
    monthly: [
      { month: '2025-12', totalCents: 700 },
      { month: '2026-01', totalCents: 200 },
      { month: '2026-02', totalCents: 150 },
    ],
  } as unknown as BankCostsReport;
  render(<CombinedCostsView bank={bank} portfolio={portfolio} />);
  const text = screen.getByTestId('cc-years').textContent ?? '';
  expect(text.indexOf('2026')).toBeLessThan(text.indexOf('2025'));
  expect(text).toMatch(/2026[^0-9]*3,50[^0-9]*2 von 12 Monaten/);
  expect(text).toMatch(/2025[^0-9]*7,00[^0-9]*1 von 12 Monaten/);
});
