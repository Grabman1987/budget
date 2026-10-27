// @vitest-environment jsdom
import { QueryClient, QueryClientProvider, QueryObserver } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useLedgerWrites } from './mutations';
import type { BookingPage, ListedBooking } from './types';

vi.mock('@budget/ui', async (original) => ({
  ...(await original<object>()),
  useToast: () => ({ show: vi.fn() }),
}));
afterEach(() => vi.unstubAllGlobals());

it('finishes a saved edit without waiting for reads and refreshes visible wealth', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let finishRead!: () => void;
  const blocked = new Promise<void>((done) => {
    finishRead = done;
  });
  let reads = 0;
  let wealthReads = 0;
  client.setQueryData(['ledger', 'bookings'], { items: [], total: 0, sumCents: 0 });
  client.setQueryData(['ledger', 'wealth'], {});
  const historyKey = ['ledger', 'bookings', 'infinite', { accountId: 'synthetic' }];
  client.setQueryData(historyKey, {
    pages: [
      { items: [], total: 0, sumCents: 0, nextCursor: 'older' },
      { items: [], total: 0, sumCents: 0, nextCursor: null },
    ],
    pageParams: [undefined, 'older'],
  });
  const observer = new QueryObserver(client, {
    queryKey: ['ledger', 'bookings'],
    staleTime: Infinity,
    queryFn: async () => {
      reads++;
      await blocked;
      return { items: [], total: 0, sumCents: 0 };
    },
  });
  const wealth = new QueryObserver(client, {
    queryKey: ['ledger', 'wealth'],
    staleTime: Infinity,
    queryFn: async () => {
      wealthReads++;
      await blocked;
      return {};
    },
  });
  const unsubscribe = observer.subscribe(() => undefined);
  const unwealth = wealth.subscribe(() => undefined);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ bookings: [], groupId: 'synthetic' }))),
  );
  const { result, unmount } = renderHook(useLedgerWrites, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  let saved = false;
  try {
    await act(async () => {
      void result.current.patch
        .mutateAsync({ id: 'synthetic', patch: { memo: 'Changed' } })
        .then(() => {
          saved = true;
        });
      await new Promise((done) => setTimeout(done, 30));
    });
    expect(reads).toBe(1);
    expect(saved).toBe(true);
    expect(wealthReads).toBe(1);
    expect(client.getQueryState(['ledger', 'wealth'])?.isInvalidated).toBe(true);
    expect(client.getQueryData(historyKey)).toEqual({
      pages: [{ items: [], total: 0, sumCents: 0, nextCursor: 'older' }],
      pageParams: [undefined],
    });
  } finally {
    finishRead();
    unsubscribe();
    unwealth();
    unmount();
    client.clear();
  }
});

it.each([
  ['edit', false], ['delete', false], ['edit', true], ['delete', true],
] as const)('keeps full-filter native facts pending during deferred %s and restores on failure=%s', async (kind, fail) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const key = ['ledger', 'bookings', 'infinite', { q: 'synthetic' }];
  const row = (id: string, amountCents: number, currency = 'EUR') =>
    ({ id, amountCents, currency, splits: [] }) as unknown as ListedBooking;
  const groups = [
    { currency: 'EUR', count: 3, cents: -1557 },
    { currency: 'USD', count: 1, cents: -4321 },
  ];
  const first: BookingPage = { items: [row('a', -1234)], total: 4, sumCents: -5878, nextCursor: 'older', nativeTotals: groups };
  const second: BookingPage = { items: [row('b', 567), row('c', -890), row('usd', -4321, 'USD')], total: 4, sumCents: -5878, nextCursor: null, nativeTotals: groups };
  const before = { pages: [first, second], pageParams: [undefined, 'older'] };
  client.setQueryData(key, before);
  let finishWrite!: (response: Response) => void;
  let finishRead!: () => void;
  const readBlocked = new Promise<void>((done) => { finishRead = done; });
  const canonical = fail ? { pages: [first], pageParams: [undefined] } : { pages: [{ ...first,
    items: kind === 'edit' ? [row('a', -2000)] : [row('b', 567)],
    total: kind === 'edit' ? 4 : 3,
    nativeTotals: [
      { currency: 'EUR', count: kind === 'edit' ? 3 : 2, cents: kind === 'edit' ? -2323 : -323 },
      { currency: 'USD', count: 1, cents: -4321 },
    ],
  }], pageParams: [undefined] };
  const observer = new QueryObserver(client, { queryKey: key, staleTime: Infinity,
    queryFn: async () => { await readBlocked; return canonical; },
  });
  const unsubscribe = observer.subscribe(() => undefined);
  const fetch = vi.fn(() => new Promise<Response>((done) => { finishWrite = done; }));
  vi.stubGlobal('fetch', fetch);
  const { result, unmount } = renderHook(useLedgerWrites, {
    wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
  let writing!: Promise<unknown>;
  try {
    act(() => {
      writing = (kind === 'edit'
        ? result.current.patch.mutateAsync({ id: 'a', patch: { amountCents: -2000 } })
        : result.current.remove.mutateAsync({ id: 'a' })).catch((error: unknown) => error);
    });
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const pending = client.getQueryData<typeof before>(key)!;
    expect(pending.pages.map((page) => page.nativeTotalsPending)).toEqual([true, true]);
    expect(pending.pages.map((page) => page.nativeTotals)).toEqual([groups, groups]);
    expect(pending.pages[0]?.items.map((item) => item.amountCents)).toEqual(kind === 'edit' ? [-2000] : []);
    await act(async () => {
      finishWrite(new Response(JSON.stringify(fail
        ? { error: 'invalid', message: 'Synthetic rejection' }
        : { groupId: 'synthetic-group', bookings: [] }), { status: fail ? 422 : 200 }));
      await writing;
    });
    if (fail) {
      expect(client.getQueryData<typeof before>(key)?.pages[0]).toEqual(first);
      expect(client.getQueryData<typeof before>(key)?.pages[0]?.nativeTotalsPending).toBeUndefined();
    } else expect(client.getQueryData<typeof before>(key)?.pages[0]?.nativeTotalsPending).toBe(true);
    await act(async () => { finishRead(); });
    await waitFor(() => expect(client.getQueryState(key)?.fetchStatus).toBe('idle'));
    await waitFor(() => expect(client.getQueryData<typeof before>(key)?.pages[0]?.nativeTotals).toEqual(canonical.pages[0]?.nativeTotals));
    expect(client.getQueryData<typeof before>(key)?.pages[0]?.nativeTotalsPending).toBeUndefined();
  } finally {
    finishRead(); unsubscribe(); unmount(); client.clear();
  }
});
