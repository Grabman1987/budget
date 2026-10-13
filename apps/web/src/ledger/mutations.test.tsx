// @vitest-environment jsdom
import { QueryClient, QueryClientProvider, QueryObserver } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useLedgerWrites } from './mutations';

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
