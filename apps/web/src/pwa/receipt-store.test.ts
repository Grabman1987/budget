import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  addReceiptIntent,
  listReceiptIntents,
  markReceiptIntent,
  type ReceiptIntent,
} from './receipt-store';

const files = new Map<string, Record<string, unknown>>();
const meta = new Map<string, unknown>();
const storage = new Map<string, string>();

// Exercise the real storage boundary; this IDB stand-in rejects Blob serialization like WebKit.
function database() {
  return {
    close() {},
    transaction() {
      let pending = 0;
      let aborted = false;
      const tx = {
        oncomplete: () => {},
        onabort: () => {},
        abort() {
          aborted = true;
          tx.onabort();
        },
        objectStore(name: string) {
          const rows = name === 'files' ? files : meta;
          const request = (run: () => unknown) => {
            pending++;
            const result = { result: undefined as unknown, onsuccess: () => {} };
            queueMicrotask(() => {
              result.result = run();
              result.onsuccess();
              if (--pending === 0 && !aborted) tx.oncomplete();
            });
            return result;
          };
          return {
            transaction: tx,
            get: (key: string) => request(() => rows.get(key)),
            getAll: () => request(() => [...rows.values()]),
            add: (item: Record<string, unknown>) => {
              if (item['file'] instanceof Blob) throw new Error('WebKit cannot serialize Blob');
              return request(() => files.set(item['id'] as string, structuredClone(item)));
            },
            put: (value: unknown, key: string) => request(() => meta.set(key, value)),
          };
        },
      };
      return tx;
    },
  };
}
beforeEach(() => {
  files.clear();
  meta.clear();
  storage.clear();
  vi.stubGlobal('navigator', { locks: {} });
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  vi.stubGlobal('indexedDB', {
    open: () => {
      const request = { result: database(), onsuccess: () => {} };
      queueMicrotask(() => request.onsuccess());
      return request;
    },
  });
});
afterEach(() => vi.unstubAllGlobals());

const intent = (id: string, file: Blob): ReceiptIntent => ({
  id,
  file,
  epoch: 'initial',
  createdAt: 1,
  filename: 'synthetic.pdf',
  bookingId: 'synthetic-booking',
  uncertain: false,
});

it('stores literal bytes and MIME without serializing a Blob, and restores them for delivery', async () => {
  const item = intent('new-file', new Blob(['synthetic receipt'], { type: 'application/pdf' }));
  await addReceiptIntent(item);
  expect(files.get(item.id)?.['file']).toBeInstanceOf(ArrayBuffer);
  expect(files.get(item.id)?.['mime']).toBe('application/pdf');
  expect(new TextDecoder().decode(files.get(item.id)?.['file'] as ArrayBuffer)).toBe(
    'synthetic receipt',
  );
  const [listed] = await listReceiptIntents();
  const marked = await markReceiptIntent(item.id, 'initial', 'network');
  for (const restored of [listed!, marked!]) {
    expect(restored.filename).toBe('synthetic.pdf');
    expect(restored.bookingId).toBe('synthetic-booking');
    expect(restored.file.type).toBe('application/pdf');
    expect(restored.file.size).toBe(17);
    expect(await restored.file.text()).toBe('synthetic receipt');
  }
  expect(marked?.reason).toBe('network');
  expect(files.get(item.id)?.['file']).toBeInstanceOf(ArrayBuffer);
});

it('reads and marks existing v1 Blob records without rewriting their file payload', async () => {
  const item = intent('legacy-file', new Blob(['synthetic image'], { type: 'image/png' }));
  files.set(item.id, { ...item });
  const [listed] = await listReceiptIntents();
  const marked = await markReceiptIntent(item.id, 'initial');
  for (const restored of [listed!, marked!]) {
    expect(restored.file).toBe(item.file);
    expect(restored.file.type).toBe('image/png');
    expect(await restored.file.text()).toBe('synthetic image');
  }
  expect(files.get(item.id)?.['file']).toBe(item.file);
});

it('rechecks the logout fence after reading bytes and refuses a stale durable write', async () => {
  const file = new Blob(['synthetic']);
  let finishRead!: (value: ArrayBuffer) => void;
  vi.spyOn(file, 'arrayBuffer').mockImplementation(
    () =>
      new Promise((resolve) => {
        finishRead = resolve;
      }),
  );
  const pending = addReceiptIntent(intent('stale-file', file));
  storage.set('budget-receipt-wipe-epoch', '10000000-0000-4000-8000-000000000001');
  finishRead(new ArrayBuffer(9));
  await expect(pending).rejects.toMatchObject({ code: 'cleared' });
  expect(files.size).toBe(0);
});
