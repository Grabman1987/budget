// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { emptyDraft } from '../ledger/booking-model';
import { QueueList, QueueProvider } from './queue-ui';
import { queuedStatus, type BookingAcknowledgement, type QueuedBooking } from './queue-store';

const device = vi.hoisted(() => ({
  items: [] as QueuedBooking[],
  acknowledgements: [] as BookingAcknowledgement[],
  refresh: () => {},
}));
vi.mock('./queue-store', async (original) => ({
  ...(await original<object>()),
  readQueueState: async () =>
    structuredClone({ items: device.items, acknowledgements: device.acknowledgements }),
  subscribeQueue: (fn: () => void) => {
    device.refresh = fn;
    return () => {};
  },
}));
vi.mock('../auth/status-query', () => ({
  authStatusQuery: { queryKey: ['status'], queryFn: async () => ({ authenticated: false }) },
}));
vi.mock('../ledger/capture-form', () => ({ CaptureForm: () => null }));
vi.mock('../ledger/mutations', () => ({ useLedgerWrites: () => ({ offerUndo: () => {} }) }));
vi.mock('./queue', () => ({ sendQueue: async () => {}, queueReason: () => 'Synthetic failure' }));
vi.mock('@budget/ui', async (original) => ({
  ...(await original<object>()),
  useAmountPrivacy: () => {},
}));
afterEach(cleanup);

const pending: QueuedBooking = {
  id: 'synthetic-delivery-key',
  createdAt: 1,
  uncertain: false,
  input: {
    type: 'booking',
    accountId: 'synthetic-account',
    date: '2026-11-01',
    amountCents: -1250,
    splits: [],
  },
  draft: emptyDraft('synthetic-account', '2026-11-01'),
};

it('shows exactly one status per change as local, sending, failed and acknowledged', async () => {
  device.items = [pending];
  device.acknowledgements = [];
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <QueueProvider>
        <QueueList />
      </QueueProvider>
    </QueryClientProvider>,
  );
  await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Lokal gespeichert'));
  device.items = [{ ...pending, uncertain: true, sending: true }];
  act(device.refresh);
  await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Wird gesendet'));
  device.items = [{ ...pending, uncertain: true, reason: 'Synthetic failure' }];
  act(device.refresh);
  await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Fehlgeschlagen'));
  expect(screen.getByText(/Serverempfang unklar/)).toBeTruthy();
  device.items = [];
  device.acknowledgements = [
    { id: pending.id, bookingIds: ['synthetic-booking'], savedAt: '2026-11-01T10:00:00.000Z' },
  ];
  act(device.refresh);
  await waitFor(() =>
    expect(screen.queryByRole('region', { name: 'Wartet auf Verbindung' })).toBeNull(),
  );
  const saved = screen.getByRole('region', { name: 'Buchungsstatus' });
  expect(within(saved).getByText('Auf dem Server gespeichert')).toBeTruthy();
  expect(within(saved).getByText('Buchungs-ID: synthetic-booking')).toBeTruthy();
  expect(saved.querySelector('time')?.dateTime).toBe('2026-11-01T10:00:00.000Z');
  client.clear();
});

it('shows an interrupted uncertain delivery as failed after restart, never as saved', () => {
  expect(queuedStatus({ ...pending, uncertain: true })).toBe('Fehlgeschlagen');
});
