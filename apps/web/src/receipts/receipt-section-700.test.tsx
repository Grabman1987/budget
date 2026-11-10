// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { ToastProvider } from '@budget/ui';
import { ApiError } from '../api/http';
import type * as Http from '../api/http';
import { ReceiptSection } from './receipt-section';

const GROUP = '70000000-0000-4000-8000-000000000001';
const ACK = {
  groupId: GROUP,
  receipt: { id: '70000000-0000-4000-8000-000000000002', sha256: 'a'.repeat(64), sizeBytes: 9 },
};

// In-memory stand-in for the IndexedDB intent store; one row per immutable intent.
const store = vi.hoisted(() => ({ rows: new Map<string, Record<string, unknown>>(), fail: false }));
vi.mock('../pwa/receipt-store', () => ({
  receiptEpoch: () => 'initial',
  assertReceiptEpoch: () => undefined,
  withReceiptLock: (_epoch: string, run: () => Promise<unknown>) => run(),
  listReceiptIntents: async () => [...store.rows.values()],
  addReceiptIntent: async (item: { id: string }) => {
    if (store.fail) throw new Error('quota');
    store.rows.set(item.id, { ...item });
    return item;
  },
  markReceiptIntent: async (id: string, _epoch: string, reason?: string) => {
    const row = store.rows.get(id);
    if (!row) return undefined;
    Object.assign(row, { uncertain: true, reason });
    return row;
  },
  finishReceiptIntent: async (id: string) => store.rows.delete(id),
}));
const http = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('../api/http', async (importOriginal) => ({
  ...(await importOriginal<typeof Http>()),
  notifyApiWrite: () => undefined,
  request: async (method: string, path: string, body?: unknown, headers?: unknown) =>
    method === 'GET' ? { receipts: [] } : http.post(method, path, body, headers),
}));

function view(bookingId?: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <ReceiptSection {...(bookingId ? { bookingId } : {})} />
      </ToastProvider>
    </QueryClientProvider>,
  );
}
const pick = (name = 'synthetic.png', type = 'image/png') =>
  userEvent.upload(
    screen.getByLabelText('Belegdatei auswählen'),
    new File(['synthetic'], name, { type }),
  );

beforeEach(() => {
  store.rows.clear();
  store.fail = false;
  http.post.mockReset();
});

it('shows an uncertain file after a lost response and retries it with the same key and bytes', async () => {
  http.post.mockRejectedValueOnce(new ApiError(0, 'network')).mockResolvedValueOnce(ACK);
  view('booking-1');
  await pick();
  const row = await screen.findByTestId('receipt-intent');
  expect(within(row).getByText('Verbindung unterbrochen')).toBeTruthy();
  expect(row.textContent).toContain('Unsicher, ob die Datei angekommen ist');
  expect(store.rows.size).toBe(1);
  const [id] = [...store.rows.keys()];

  await userEvent.click(within(row).getByRole('button', { name: /erneut senden/i }));
  await waitFor(() => expect(screen.queryByTestId('receipt-intent')).toBeNull());
  // Exactly two deliveries of one intent: same Idempotency-Key and uploadIntent, one stored row.
  expect(http.post).toHaveBeenCalledTimes(2);
  for (const call of http.post.mock.calls) {
    expect(call[3]).toEqual({ 'Idempotency-Key': id });
    expect((call[2] as FormData).get('uploadIntent')).toBe(id);
    expect((call[2] as FormData).get('bookingId')).toBe('booking-1');
  }
  expect(store.rows.size).toBe(0);
});

it.each([
  [new ApiError(401, 'unauthorized'), 'Anmeldung nötig'],
  [new ApiError(503, 'unavailable'), 'Server nicht erreichbar'],
  [new ApiError(422, 'invalid_receipt'), 'Abgelehnt'],
  [new ApiError(409, 'idempotency_conflict'), 'Konflikt'],
])('shows %# failure state with retry and cancel controls', async (error, label) => {
  http.post.mockRejectedValueOnce(error);
  view();
  await pick();
  const row = await screen.findByTestId('receipt-intent');
  expect(within(row).getByText(label)).toBeTruthy();
  expect(within(row).getByRole('button', { name: /erneut senden/i })).toBeTruthy();
  expect(within(row).getByRole('button', { name: /verwerfen/i })).toBeTruthy();
});

it('cancel removes only the local file and never sends again', async () => {
  http.post.mockRejectedValueOnce(new ApiError(0, 'network'));
  view('booking-1');
  await pick();
  const row = await screen.findByTestId('receipt-intent');
  await userEvent.click(within(row).getByRole('button', { name: /verwerfen/i }));
  await waitFor(() => expect(screen.queryByTestId('receipt-intent')).toBeNull());
  expect(store.rows.size).toBe(0);
  expect(http.post).toHaveBeenCalledTimes(1);
  expect(http.post.mock.calls.every(([method]) => method === 'POST')).toBe(true);
});

it('quota failure keeps the selection in memory, says it was not saved and can retry', async () => {
  store.fail = true;
  view();
  await pick('big.pdf', 'application/pdf');
  const alert = await screen.findByTestId('receipt-unsaved');
  expect(alert.textContent).toContain('Nicht gespeichert');
  expect(alert.textContent).toContain('big.pdf');
  expect(http.post).not.toHaveBeenCalled();
  expect(store.rows.size).toBe(0);

  store.fail = false;
  http.post.mockResolvedValueOnce(ACK);
  await userEvent.click(within(alert).getByRole('button', { name: 'Erneut speichern' }));
  await waitFor(() => expect(screen.queryByTestId('receipt-unsaved')).toBeNull());
  expect(http.post).toHaveBeenCalledTimes(1);
  expect(store.rows.size).toBe(0);
});

it('a successful first send leaves no pending entry and creates exactly one delivery', async () => {
  http.post.mockResolvedValueOnce(ACK);
  view();
  await pick();
  await waitFor(() => expect(http.post).toHaveBeenCalledTimes(1));
  expect(screen.queryByTestId('receipt-intent')).toBeNull();
  expect(store.rows.size).toBe(0);
});

it('discarding an unsaved selection drops it without any write', async () => {
  store.fail = true;
  view();
  await pick();
  const alert = await screen.findByTestId('receipt-unsaved');
  await userEvent.click(within(alert).getByRole('button', { name: 'Verwerfen' }));
  expect(screen.queryByTestId('receipt-unsaved')).toBeNull();
  expect(http.post).not.toHaveBeenCalled();
});
