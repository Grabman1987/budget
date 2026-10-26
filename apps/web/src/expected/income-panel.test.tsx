// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { setAmountsHidden } from '@budget/ui';
import { incomeQuery, type MonthIncome } from './api';
import { IncomeBody } from './income-panel';

afterEach(() => {
  cleanup();
  setAmountsHidden(false);
});

function showOctoberIncome() {
  const month = '2026-10';
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  const income: MonthIncome = {
    month,
    expectedCents: 30_000,
    receivedCents: 0,
    byIncomeType: [
      { incomeTypeId: 'salary', name: 'Gehalt', expectedCents: 30_000, receivedCents: 0 },
    ],
    byPayment: [
      {
        paymentId: 'synthetic-october-payment',
        occurrenceId: 'synthetic-october-occurrence',
        name: 'Gehalt',
        incomeTypeId: 'salary',
        incomeTypeName: 'Gehalt',
        dueDate: '2026-10-15',
        status: 'expected',
        expectedCents: 30_000,
        receivedCents: 0,
      },
    ],
  };
  client.setQueryData(incomeQuery(month).queryKey, income);
  return render(
    <QueryClientProvider client={client}>
      <IncomeBody month={month} bookedCents={100_000} />
    </QueryClientProvider>,
  );
}

it('labels October expected receipts separately from budget-relevant plan-month inflows', () => {
  showOctoberIncome();

  expect(screen.getByText(/von erwartet 300,00 €.*Oktober 2026/)).toBeTruthy();
  expect(
    screen.getByText(/Zählt für Zu verteilen: 1\.000,00 € im Planmonat Oktober 2026/),
  ).toBeTruthy();
  expect(screen.getByText(/Erwartete Zahlungen sind Planwerte/)).toBeTruthy();
  expect(
    screen.getByText(/Zu verteilen zählt.*tatsächlich gebuchte Zuflüsse.*zugeordneten Planmonat/),
  ).toBeTruthy();
  expect(
    screen.getByText(
      /Heute zählt Haushaltseinnahmen nach Buchungsdatum.*Für nächsten Monat.*Folgemonat/,
    ),
  ).toBeTruthy();
});

it('keeps the scope explanation while amount privacy masks expected and booked values', () => {
  showOctoberIncome();
  expect(screen.getByRole('progressbar').getAttribute('max')).toBe('30000');
  act(() => setAmountsHidden(true));

  expect(screen.getByText(/Zählt für Zu verteilen:.*im Planmonat Oktober 2026/)).toBeTruthy();
  expect(screen.getByTestId('income-received').textContent).toBe('••• €');
  expect(screen.queryByText(/300,00 €|1\.000,00 €/)).toBeNull();
  expect(screen.queryByRole('progressbar', { hidden: true })).toBeNull();
  act(() => setAmountsHidden(false));
  expect(screen.getByRole('progressbar').getAttribute('max')).toBe('30000');
  expect(screen.getByRole('progressbar').getAttribute('value')).toBe('0');
});
