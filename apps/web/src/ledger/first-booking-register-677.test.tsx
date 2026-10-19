// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AccountRegister } from './account-register';
import { emptyDraft } from './booking-model';
import { useLedgerWrites } from './mutations';
import type { BookingCreate } from './api';
import type { AccountRow, BookingPage, ListedBooking } from './types';

const toast = vi.hoisted(() => ({ show: vi.fn() }));
vi.mock('@budget/ui', async (original) => ({
  ...(await original<object>()),
  useToast: () => toast,
}));
vi.mock('./upcoming-register', () => ({
  useRegisterToday: () => '2026-10-19',
  useUpcomingRegister: () => ({ model: null, notes: null }),
}));
vi.mock('./booking-panel', () => ({ BookingPanel: () => null }));
vi.mock('./booking-table', () => ({
  BookingTable: ({ items }: { items: ListedBooking[] }) => (
    <table>
      <tbody>
        {items.map((item) => (
          <tr key={item.id}>
            <td>{item.payeeName}</td>
          </tr>
        ))}
      </tbody>
    </table>
  ),
}));
// Offline persistence has separate tests; keep the actual POST and its result here.
vi.mock('../pwa/queue', async () => {
  const { createBooking } = await import('./api');
  return {
    submitCapture: (input: BookingCreate) => createBooking(input),
    requestQueueSync: vi.fn(),
  };
});

const booking: ListedBooking = {
  id: 'synthetic-first-booking',
  accountId: 'synthetic-account',
  accountName: 'Synthetic account',
  date: '2026-10-19',
  amountCents: -2_000,
  payeeId: null,
  payeeName: 'Synthetic first payee',
  memo: null,
  status: 'confirmed',
  flag: null,
  transferId: null,
  transferAccountId: null,
  transferAccountName: null,
  projectId: null,
  currency: 'EUR',
  originalAmountCents: null,
  originalCurrency: null,
  splits: [],
  balanceAfterCents: 48_000,
};
const empty: BookingPage = { items: [], total: 0, sumCents: 0, nextCursor: null };

afterEach(() => {
  vi.unstubAllGlobals();
  toast.show.mockClear();
});

it('replaces a pending pre-save empty register read after the first booking, without reload', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let releaseEmpty!: (response: Response) => void;
  const pendingEmpty = new Promise<Response>((resolve) => {
    releaseEmpty = resolve;
  });
  let releaseFresh!: (response: Response) => void;
  const pendingFresh = new Promise<Response>((resolve) => {
    releaseFresh = resolve;
  });
  let reads = 0;
  let writes = 0;
  let undos = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn((path: string, init: RequestInit) => {
      if (init.method === 'POST' && path === '/api/bookings') {
        writes++;
        return Promise.resolve(
          Response.json({ bookings: [booking], groupId: 'synthetic-group' }, { status: 201 }),
        );
      }
      if (init.method === 'POST' && path === '/api/undo') {
        undos++;
        return Promise.resolve(Response.json({ groupId: 'synthetic-undo-group' }));
      }
      if (init.method === 'GET' && path.startsWith('/api/bookings?')) {
        reads++;
        // This response represents a read already computed before the POST commits.
        if (reads === 1) return pendingEmpty;
        expect(writes).toBe(1);
        if (reads === 2) return pendingFresh;
        expect(undos).toBe(1);
        return Promise.resolve(Response.json(empty));
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    }),
  );
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const register = render(<AccountRegister account={{ id: booking.accountId } as AccountRow} />, {
    wrapper,
  });
  const mutation = renderHook(useLedgerWrites, { wrapper });
  try {
    await waitFor(() => expect(reads).toBe(1));
    expect(screen.getByText('Buchungen werden geladen …')).toBeTruthy();
    await act(async () => {
      await mutation.result.current.create.mutateAsync({
        input: {
          type: 'booking',
          accountId: booking.accountId,
          date: booking.date,
          amountCents: -2_000,
          status: 'confirmed',
          splits: [{ categoryId: null, amountCents: -2_000 }],
        },
        draft: emptyDraft(booking.accountId, booking.date),
      });
    });
    expect(toast.show).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Buchung gespeichert.' }),
    );
    // Saving has finished even though both GETs are blocked; refreshes stay off save's path.
    expect(reads).toBe(2);
    await act(async () =>
      releaseFresh(
        Response.json({ items: [booking], total: 1, sumCents: -2_000, nextCursor: null }),
      ),
    );
    await waitFor(() => expect(screen.getByText(booking.payeeName!)).toBeTruthy());
    // Complete the old request last. It must neither satisfy the refresh nor restore emptiness.
    await act(async () => releaseEmpty(Response.json(empty)));
    await waitFor(() => expect(screen.getByText(booking.payeeName!)).toBeTruthy());
    expect(screen.queryByText('Noch keine Buchungen auf diesem Konto.')).toBeNull();
    expect(screen.getByText('1 Buchung')).toBeTruthy();
    expect(reads).toBe(2);
    expect(writes).toBe(1);
    const undoAction = toast.show.mock.calls[0]?.[0] as { onAction: () => void };
    await act(async () => undoAction.onAction());
    await waitFor(() =>
      expect(screen.getByText('Noch keine Buchungen auf diesem Konto.')).toBeTruthy(),
    );
    expect(screen.queryByText(booking.payeeName!)).toBeNull();
    expect(screen.getByText('0 Buchungen')).toBeTruthy();
    expect(reads).toBe(3);
    expect(undos).toBe(1);
  } finally {
    releaseEmpty(Response.json(empty));
    releaseFresh(Response.json(empty));
    register.unmount();
    mutation.unmount();
    client.clear();
  }
});
