// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { PaymentHistoryPreview } from './payment-history-preview';
import type { ExpectedPayment, PaymentDetail } from './api';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it('renders stored Soll/Ist cents and unknown actuals without materializing any occurrence', async () => {
  const detail: PaymentDetail = {
    paymentId: 'synthetic',
    asOf: '2026-09-17',
    sparseHistory: true,
    hasEarlierRecorded: false,
    hasFurtherFuture: false,
    history: [
      {
        occurrenceId: 'paid',
        dueDate: '2026-09-10',
        source: 'stored',
        status: 'received',
        expectedAmountCents: -1001,
        currency: 'EUR',
        booking: { id: 'booking', date: '2026-09-10', amountCents: -1203, currency: 'EUR' },
        actualComparableCents: -1203,
        deviationCents: -202,
        unavailableReason: null,
      },
      {
        occurrenceId: 'missing',
        dueDate: '2026-08-10',
        source: 'stored',
        status: 'missed',
        expectedAmountCents: -1001,
        currency: 'EUR',
        booking: null,
        actualComparableCents: null,
        deviationCents: null,
        unavailableReason: 'missing_booking',
      },
    ],
    future: [
      {
        occurrenceId: null,
        dueDate: '2026-10-10',
        source: 'preview',
        status: 'expected',
        expectedAmountCents: -1001,
        currency: 'EUR',
        booking: null,
        actualComparableCents: null,
        deviationCents: null,
        unavailableReason: 'missing_booking',
      },
    ],
  };
  const calls: string[] = [];
  vi.stubGlobal('fetch', async (path: string, init?: RequestInit) => {
    calls.push((init?.method ?? 'GET') + ' ' + path);
    return Response.json(detail);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <PaymentHistoryPreview
        payment={{ id: 'synthetic', name: 'Synthetic payment' } as ExpectedPayment}
      />
    </QueryClientProvider>,
  );
  const history = await screen.findByRole('table', { name: 'Soll und Ist von Synthetic payment' });
  const rows = within(history).getAllByRole('row');
  expect(rows[1]!.textContent).toBe('10.09.2026−10,01 €−12,03 €−2,02 €');
  expect(rows[2]!.textContent).toBe('10.08.2026−10,01 €––');
  expect(
    screen.getByRole('table', { name: 'Nächste erwartete Termine von Synthetic payment' })
      .textContent,
  ).toContain('10.10.2026−10,01 €');
  expect(screen.getByText(/Stand 17.09.2026/).textContent).toContain('nicht gespeichert');
  expect(calls).toEqual(['GET /api/expected/synthetic/detail']);
  client.clear();
});
