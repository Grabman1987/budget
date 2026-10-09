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

  expect(
    screen.getByText(/Zu erwarteten Zahlungen eingegangen im Oktober.*erwartet 300,00 €/),
  ).toBeTruthy();
  expect(
    screen.getByText(/Budgetrelevante Zuflüsse im Planmonat.*Oktober 2026.*1\.000,00 €/),
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
  act(() => setAmountsHidden(true));
  showOctoberIncome();

  expect(screen.getByText(/Budgetrelevante Zuflüsse im Planmonat.*Oktober 2026/)).toBeTruthy();
  expect(screen.getByTestId('income-received').textContent).toBe('••• €');
  expect(screen.queryByText(/300,00 €|1\.000,00 €/)).toBeNull();
});
