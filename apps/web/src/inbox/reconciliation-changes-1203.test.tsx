// @vitest-environment jsdom
import { ToastProvider } from '@budget/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ReconciliationChanges } from './reconciliation-changes';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it('#1203 shows creation vs current balance and the changed bookings after opening', async () => {
  const fetchMock = vi.fn(async () =>
    Response.json({
      changes: {
        checkId: 'c',
        date: '2026-09-01',
        statementBalanceCents: 10000,
        currentBalanceCents: 9223,
        explainedCents: -777,
        unexplainedCents: 0,
        changes: [
          {
            bookingId: 'b1',
            at: '2026-10-02T10:00:00.000Z',
            change: 'created',
            date: '2026-08-30',
            payeeName: 'Synthetischer Laden',
            amountBeforeCents: null,
            amountAfterCents: -777,
            effectCents: -777,
          },
        ],
      },
    }),
  );
  vi.stubGlobal('fetch', fetchMock);
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ToastProvider>
        <ReconciliationChanges accountId="a" />
      </ToastProvider>
    </QueryClientProvider>,
  );
  expect(fetchMock).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Was hat sich geändert?' }));
  expect(await screen.findByText(/Bei Erstellung/)).toBeTruthy();
  expect(screen.getByText(/vollständig durch die Änderungen unten erklärt/)).toBeTruthy();
  expect(screen.getByText(/Synthetischer Laden · angelegt/)).toBeTruthy();
});
