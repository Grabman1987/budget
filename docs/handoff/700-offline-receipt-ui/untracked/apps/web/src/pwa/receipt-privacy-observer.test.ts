// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let receivers: { onmessage: ((event: { data: unknown }) => void) | null }[];
let cleanups: (() => void)[];
beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  receivers = [];
  cleanups = [];
  vi.stubGlobal(
    'BroadcastChannel',
    class {
      onmessage = null;
      constructor() {
        receivers.push(this);
      }
      postMessage() {}
      close() {}
    },
  );
});
afterEach(() => {
  for (const cleanup of cleanups) cleanup();
  vi.unstubAllGlobals();
});
async function observe() {
  const store = await import('./receipt-queue-store');
  const privacy = vi.fn(),
    list = vi.fn();
  cleanups.push(store.subscribeReceiptQueuePrivacy(privacy), store.subscribeReceiptQueue(list));
  return {
    store,
    privacy,
    list,
    receive: (data: unknown) => receivers.at(-1)!.onmessage!({ data }),
  };
}
it('ordinary list/ACK notifications and first epoch initialization do not discard a tokenless selection', async () => {
  const { privacy, list, receive } = await observe();
  receive('list');
  localStorage.setItem('budget-receipt-queue-epoch', 'synthetic-first-epoch');
  window.dispatchEvent(
    new StorageEvent('storage', {
      key: 'budget-receipt-queue-epoch',
      oldValue: null,
      newValue: 'synthetic-first-epoch',
    }),
  );
  expect(list).toHaveBeenCalled();
  expect(privacy).not.toHaveBeenCalled();
});
it('actual owned hold messages notify immediately but release/list notifications never create a new privacy event', async () => {
  const { privacy, receive } = await observe();
  const id = 'budget-receipt-queue-signout.synthetic';
  receive({ kind: 'hold', id });
  expect(privacy).toHaveBeenCalledExactlyOnceWith('intent');
  receive({ kind: 'release', ids: [id] });
  receive('list');
  expect(privacy).toHaveBeenCalledTimes(1);
});
it('a queued storage intent still clears memory when a fast sibling already completed and removed the marker', async () => {
  const { privacy } = await observe();
  const id = 'budget-receipt-queue-signout.synthetic-fast';
  expect(localStorage.getItem(id)).toBeNull();
  window.dispatchEvent(
    new StorageEvent('storage', { key: id, oldValue: null, newValue: 'pending' }),
  );
  expect(privacy).toHaveBeenCalledWith('intent');
});
it('an actual completed-wipe broadcast is a fence even before the observer has seen its first epoch', async () => {
  const { privacy, receive } = await observe();
  receive('changed');
  expect(privacy).toHaveBeenCalledWith('fence');
});
it('same-tab intent notifies synchronously before failed native access; a broken UI subscriber cannot stop the fence', async () => {
  const { store, privacy } = await observe();
  cleanups.push(
    store.subscribeReceiptQueuePrivacy(() => {
      throw new Error('synthetic failed render');
    }),
  );
  const later = vi.fn();
  cleanups.push(store.subscribeReceiptQueuePrivacy(later));
  const hold = store.holdReceiptQueueForSignOut();
  expect(privacy).toHaveBeenCalledWith('intent');
  expect(later).toHaveBeenCalledWith('intent');
  expect(
    Object.keys(localStorage).some((key) => key.startsWith('budget-receipt-queue-signout.')),
  ).toBe(true);
  await expect(hold.ready).rejects.toThrow();
});
