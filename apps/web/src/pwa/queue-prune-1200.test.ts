// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { completeQueued, pruneAcknowledgements } from './queue-store';

/** Minimal IndexedDB stand-in: records deletes per store and completes the transaction. */
function stubIndexedDb(deleted: string[]) {
  const db = {
    transaction: (stores: string[]) => {
      const tx: { oncomplete?: () => void; onerror?: () => void; onabort?: () => void } = {};
      queueMicrotask(() => tx.oncomplete?.());
      return {
        ...tx,
        set oncomplete(fn: () => void) {
          tx.oncomplete = fn;
        },
        objectStore: (name: string) => ({
          delete: (key: string) => deleted.push(`${stores.includes(name) ? name : '?'}:${key}`),
        }),
      };
    },
    close: () => {},
  };
  vi.stubGlobal('indexedDB', {
    open: () => {
      const request: { result?: unknown; onsuccess?: () => void } = { result: db };
      queueMicrotask(() => request.onsuccess?.());
      return request;
    },
  });
  vi.stubGlobal(
    'BroadcastChannel',
    class {
      postMessage() {}
      close() {}
    },
  );
}
afterEach(() => vi.unstubAllGlobals());

it('drops stored acknowledgement lists on start', async () => {
  const deleted: string[] = [];
  stubIndexedDb(deleted);
  await pruneAcknowledgements();
  expect(deleted).toEqual(['choices:acknowledgements']);
});

it('stores no acknowledgement after delivery and clears old ones', async () => {
  const deleted: string[] = [];
  stubIndexedDb(deleted);
  await completeQueued({ id: 'q1', bookingIds: ['b1'], savedAt: '2026-11-01T10:00:00.000Z' });
  expect(deleted.sort()).toEqual(['bookings:q1', 'choices:acknowledgements']);
});
