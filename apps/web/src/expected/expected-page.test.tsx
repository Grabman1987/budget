// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ToastProvider } from '@budget/ui';
import { addDays, todayInVienna } from '@budget/domain';
import { expectedQuery, incomeQuery, occurrencesQuery, type ExpectedPayment } from './api';
import { ExpectedPage } from './expected-page';
import { PaymentPanel } from './payment-panel';

const navigate = vi.fn();
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
  useLocation: ({ select }: { select: (location: object) => unknown }) => select({ state: {} }),
}));
vi.mock('../shell/use-month', () => ({ useMonth: () => ['2026-10'] }));
vi.mock('../pages/placeholder-page', () => ({
  PageFrame: ({ income, children }: { income: ReactNode; children: ReactNode }) => (
    <main>
      {income}
      {children}
    </main>
  ),
}));

afterEach(cleanup);

beforeEach(() => {
  navigate.mockReset();
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});

function show(detail = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  const payment: ExpectedPayment = {
    id: 'synthetic-payment',
    name: 'Testzahlung',
    kind: 'outflow',
    accountId: null,
    payeeId: null,
    contactId: null,
    categoryId: null,
    incomeTypeId: null,
    contactShareBp: 0,
    amountToleranceCents: 0,
    dateWindowDays: 3,
    rhythm: 'monthly',
    intervalWeeks: null,
    dueDay: 20,
    dueMonth: null,
    dateShift: 'none',
    startDate: '2026-01-20',
    endDate: null,
    note: null,
    deletedAt: null,
    version: {
      id: 'synthetic-version',
      validFrom: '2026-01-20',
      amountCents: 1234,
      amountMaxCents: null,
      currency: 'EUR',
    },
    amountCents: -1234,
    nextDueDate: '2026-10-20',
    monthlyEquivalentCents: -1234,
    yearlyEquivalentCents: -14808,
  };
  client.setQueryData(['expected-refresh'], { groupId: 'synthetic-refresh' });
  client.setQueryData(expectedQuery().queryKey, [payment]);
  client.setQueryData(['ledger-lookups'], {
    accounts: [],
    categories: [],
    groups: [],
    incomeTypes: [],
    contacts: [],
    payees: [],
  });
  client.setQueryData(incomeQuery('2026-10').queryKey, {
    month: '2026-10',
    expectedCents: 1234,
    receivedCents: 0,
    byIncomeType: [],
    byPayment: [],
  });
  const today = todayInVienna();
  client.setQueryData(occurrencesQuery(addDays(today, -31), addDays(today, 90)).queryKey, []);
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        {detail ? (
          <PaymentPanel state={{ mode: 'view', id: payment.id }} onClose={() => {}} />
        ) : (
          <ExpectedPage />
        )}
      </ToastProvider>
    </QueryClientProvider>,
  );
}

it('opens payment content as a page with the selected month and list context', () => {
  show();
  fireEvent.click(screen.getAllByRole('button', { name: 'Alle' })[0]!);
  fireEvent.click(screen.getByRole('button', { name: /Testzahlung/ }));
  expect(navigate).toHaveBeenLastCalledWith(
    expect.objectContaining({
      to: '/plan/erwartet/$id',
      params: { id: 'synthetic-payment' },
      search: { monat: '2026-10', ansicht: 'all', art: 'all' },
    }),
  );
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('keeps payment details free of input fields until a form is explicitly opened', () => {
  show(true);
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.queryByLabelText('Ab Monat')).toBeNull();
  expect(screen.queryByLabelText('Name')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Neue Version' }));
  expect(screen.getByRole('dialog', { name: 'Neue Version' }).classList.contains('modal')).toBe(
    true,
  );
  expect(screen.getByLabelText('Ab Monat')).toBeTruthy();
});

it('opens the reused income page with month and Expected return context', () => {
  show();
  fireEvent.click(screen.getByRole('button', { name: /Einnahmen im Detail/ }));
  expect(navigate).toHaveBeenLastCalledWith(
    expect.objectContaining({
      to: '/plan/erwartet/einnahmen',
      search: { monat: '2026-10', ansicht: 'next', art: 'all' },
    }),
  );
});
