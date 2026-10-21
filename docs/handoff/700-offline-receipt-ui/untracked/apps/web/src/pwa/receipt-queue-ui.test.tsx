// @vitest-environment jsdom
import { ToastProvider } from '@budget/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  ReceiptPendingList,
  ReceiptQueueProvider,
  ReceiptSelection,
  finishReceiptLogin,
  startReceiptSignOut,
} from './receipt-queue-ui';
import type { QueuedReceiptUpload, ReceiptQueueRecoveryTicket } from './receipt-queue-store';

const mocks = vi.hoisted(() => ({
  begin: vi.fn(),
  enqueue: vi.fn(),
  list: vi.fn(),
  cancel: vi.fn(),
  send: vi.fn(),
  hold: vi.fn(),
  repair: vi.fn(),
  listeners: new Set<() => void>(),
  privacy: new Set<() => void>(),
}));
vi.mock('./receipt-queue-store', () => ({
  beginReceiptQueue: mocks.begin,
  enqueueReceiptUpload: mocks.enqueue,
  listReceiptUploads: mocks.list,
  cancelUnsentReceiptUpload: mocks.cancel,
  holdReceiptQueueForSignOut: mocks.hold,
  recoverReceiptQueueAfterConfirmedAction: mocks.repair,
  subscribeReceiptQueue: (listener: () => void) => {
    mocks.listeners.add(listener);
    return () => mocks.listeners.delete(listener);
  },
  subscribeReceiptQueuePrivacy: (listener: () => void) => {
    mocks.privacy.add(listener);
    return () => mocks.privacy.delete(listener);
  },
}));
vi.mock('./receipt-queue', async () => ({
  ...(await vi.importActual<typeof import('./receipt-queue')>('./receipt-queue')),
  sendReceiptQueue: mocks.send,
}));
vi.mock('../auth/status-query', () => ({
  authStatusQuery: {
    queryKey: ['synthetic-ui-auth'],
    queryFn: async () => ({ authenticated: false }),
  },
}));
vi.mock('../ledger/mutations', () => ({ useLedgerWrites: () => ({ offerUndo: vi.fn() }) }));
const TARGET = 'synthetic-saved-booking';
const ID = 'c1a67949-c5c7-4aaf-b754-41bd4cf68aee';
let rows: QueuedReceiptUpload[];
function item(file: File, bookingId?: string): QueuedReceiptUpload {
  return {
    id: ID,
    createdAt: 1,
    blob: file,
    filename: file.name,
    mime: file.type,
    ...(bookingId ? { bookingId } : {}),
    uncertain: false,
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function mount() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ToastProvider>
        <ReceiptQueueProvider>
          <ReceiptSelection bookingId={TARGET} />
          <ReceiptPendingList all />
        </ReceiptQueueProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}
beforeEach(async () => {
  vi.clearAllMocks();
  rows = [];
  mocks.begin.mockResolvedValue({ epoch: 'synthetic', generation: 1 });
  mocks.list.mockImplementation(async () => rows);
  mocks.enqueue.mockImplementation(async (file, target) => {
    const saved = item(file, target);
    rows.push(saved);
    return saved;
  });
  mocks.send.mockResolvedValue({ sent: 0 });
  mocks.repair.mockResolvedValue(undefined);
  mocks.hold.mockReturnValue({ clear: async () => undefined, release: async () => undefined });
  await finishReceiptLogin('new-login', {} as ReceiptQueueRecoveryTicket);
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
});
afterEach(() => vi.unstubAllGlobals());

it('keeps the original chooser/File and target until actual durable enqueue resolves; transport starts afterwards', async () => {
  const persisted = deferred<QueuedReceiptUpload>();
  mocks.enqueue.mockReturnValue(persisted.promise);
  const order: string[] = [];
  mocks.enqueue.mockImplementation((file, target) => {
    expect(file).toBe(chosen);
    expect(target).toBe(TARGET);
    order.push('enqueue');
    return persisted.promise;
  });
  mocks.send.mockImplementation(async () => {
    order.push('send');
    return { sent: 0 };
  });
  const chosen = new File(['synthetic exact bytes'], 'synthetic.png', { type: 'image/png' });
  mount();
  const input = screen.getByLabelText('Belegdatei auswählen') as HTMLInputElement;
  await userEvent.upload(input, chosen);
  await waitFor(() => expect(mocks.enqueue).toHaveBeenCalledOnce());
  expect(input.files?.[0]).toBe(chosen);
  expect(input.value).not.toBe('');
  expect(mocks.send).not.toHaveBeenCalled();
  rows = [item(chosen, TARGET)];
  persisted.resolve(rows[0]!);
  await waitFor(() => expect(mocks.send).toHaveBeenCalledOnce());
  expect(order).toEqual(['enqueue', 'send']);
  expect(input.value).toBe('');
});
it('quota failure says NOT SAVED, retains the same File in memory and retries persistence before any send', async () => {
  mocks.enqueue.mockRejectedValueOnce(
    new DOMException('synthetic private detail', 'QuotaExceededError'),
  );
  const chosen = new File(['synthetic exact bytes'], 'synthetic-quota.png', { type: 'image/png' });
  mount();
  const input = screen.getByLabelText('Belegdatei auswählen') as HTMLInputElement;
  await userEvent.upload(input, chosen);
  expect(await screen.findByRole('dialog', { name: 'Beleg nicht gespeichert' })).toBeTruthy();
  expect(screen.getByRole('alert').textContent).toContain('Nicht auf dem Gerät gespeichert');
  expect(screen.queryByText(/synthetic private detail/)).toBeNull();
  expect(rows).toEqual([]);
  expect(mocks.send).not.toHaveBeenCalled();
  expect(input.files?.[0]).toBe(chosen);
  await userEvent.click(screen.getByRole('button', { name: 'Erneut auf Gerät speichern' }));
  await waitFor(() => expect(mocks.send).toHaveBeenCalledOnce());
  expect(mocks.enqueue.mock.calls.map((call) => call[0])).toEqual([chosen, chosen]);
  expect(mocks.enqueue.mock.calls.map((call) => call[1])).toEqual([TARGET, TARGET]);
  expect(input.value).toBe('');
});
it('a tokenless unavailable selection survives ordinary list events but an explicit privacy intent clears it', async () => {
  mocks.begin.mockRejectedValue(new Error('synthetic unavailable'));
  mount();
  const chosen = new File(['synthetic'], 'synthetic-tokenless.png', { type: 'image/png' });
  await userEvent.upload(screen.getByLabelText('Belegdatei auswählen'), chosen);
  expect(await screen.findByRole('dialog', { name: 'Beleg nicht gespeichert' })).toBeTruthy();
  act(() => {
    for (const changed of mocks.listeners) changed();
  });
  expect(screen.getByRole('dialog', { name: 'Beleg nicht gespeichert' })).toBeTruthy();
  expect(mocks.enqueue).not.toHaveBeenCalled();
  act(() => {
    for (const privacy of mocks.privacy) privacy();
  });
  await waitFor(() =>
    expect(screen.queryByRole('dialog', { name: 'Beleg nicht gespeichert' })).toBeNull(),
  );
  expect((screen.getByLabelText('Belegdatei auswählen') as HTMLInputElement).value).toBe('');
  expect(mocks.send).not.toHaveBeenCalled();
});
it('a delayed persistence callback cannot restore a selection or start send after same-tab sign-out intent', async () => {
  const persisted = deferred<QueuedReceiptUpload>();
  mocks.enqueue.mockReturnValue(persisted.promise);
  mount();
  const chosen = new File(['synthetic'], 'synthetic-late.png', { type: 'image/png' });
  await userEvent.upload(screen.getByLabelText('Belegdatei auswählen'), chosen);
  await waitFor(() => expect(mocks.enqueue).toHaveBeenCalledOnce());
  let completed!: () => Promise<void>;
  act(() => {
    completed = startReceiptSignOut();
  });
  persisted.resolve(item(chosen, TARGET));
  await act(async () => {
    await completed();
  });
  expect(mocks.send).not.toHaveBeenCalled();
  expect(screen.queryByText('synthetic-late.png')).toBeNull();
  expect((screen.getByLabelText('Belegdatei auswählen') as HTMLInputElement).value).toBe('');
});
it('an uncertain send disables destructive cancellation while an unclaimed row delegates to atomic store cancel', async () => {
  const file = new File(['synthetic'], 'synthetic.png', { type: 'image/png' });
  rows = [
    item(file, TARGET),
    {
      ...item(file),
      id: '91d7c8c7-ff23-4270-962d-a52c6a85f782',
      uncertain: true,
      failure: 'server',
    },
  ];
  mocks.cancel.mockResolvedValue(true);
  mount();
  await screen.findByText(/Serverempfang unklar/);
  const controls = screen.getAllByRole('button', {
    name: 'Wartende Datei löschen',
  }) as HTMLButtonElement[];
  expect(controls.map((control) => control.disabled)).toEqual([false, true]);
  await userEvent.click(controls[0]!);
  expect(mocks.cancel).toHaveBeenCalledExactlyOnceWith(ID);
  expect(mocks.cancel).not.toHaveBeenCalledWith(rows[1]!.id);
});
it('shows only fixed privacy warnings after failed clear, surviving routing children changes without exposing raw errors', async () => {
  mocks.hold.mockReturnValue({
    clear: async () => {
      throw new Error('synthetic secret filename');
    },
    release: vi.fn(),
  });
  mount();
  let finished!: () => Promise<void>;
  act(() => {
    finished = startReceiptSignOut();
  });
  await act(async () => {
    await finished();
  });
  expect(screen.getByRole('alert').textContent).toContain(
    'Löschen der wartenden Belegdateien nicht bestätigt',
  );
  expect(screen.queryByText(/synthetic secret filename/)).toBeNull();
});
it('blank camera MIME selection is passed unchanged to native storage without a raw preview', async () => {
  mount();
  const chosen = new File(['synthetic-camera'], 'synthetic-camera', { type: '' });
  fireEvent.change(screen.getByLabelText('Beleg fotografieren'), { target: { files: [chosen] } });
  await waitFor(() => expect(mocks.enqueue).toHaveBeenCalledExactlyOnceWith(chosen, TARGET));
  expect(chosen.type).toBe('');
  expect(document.querySelector('img,object,iframe,embed')).toBeNull();
});
