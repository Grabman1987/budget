// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { expect, it, vi } from 'vitest';
import { expectedQuery, type ExpectedPayment } from './api';
import { PaymentPage } from './payment-page';

const navigate = vi.fn();
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
  useParams: () => ({ id: 'synthetic-payment' }),
  useSearch: () => ({ ansicht: 'all', art: 'outflow' }),
}));
vi.mock('../shell/use-month', () => ({ useMonth: () => ['2026-08'] }));
vi.mock('../pages/placeholder-page', () => ({
  PageFrame: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock('./detail-nav', () => ({ ExpectedDetailBack: () => null }));
// The real page owns the return route; the financial write is verified by API/browser tests.
vi.mock('./payment-panel', () => ({
  PaymentPanel: ({ onClose }: { onClose: () => void }) => (
    <button onClick={onClose}>Zahlung gelöscht</button>
  ),
}));

it('returns to the originating Expected view and kind after deletion', () => {
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
    dueDay: 20,
    dueMonth: null,
    dateShift: 'none',
    startDate: '2026-01-20',
    endDate: null,
    note: null,
    deletedAt: null,
    version: null,
    amountCents: null,
    nextDueDate: null,
    monthlyEquivalentCents: null,
    yearlyEquivalentCents: null,
  };
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  client.setQueryData(expectedQuery().queryKey, [payment]);
  render(
    <QueryClientProvider client={client}>
      <PaymentPage />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Zahlung gelöscht' }));
  expect(navigate).toHaveBeenCalledWith({
    to: '/plan/erwartet',
    search: { monat: '2026-08' },
    state: { expectedView: 'all', expectedKind: 'outflow' },
  });
});
