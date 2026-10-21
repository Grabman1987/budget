import { QueryClient } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { INBOX_KEY, inboxPagesQuery, type InboxStored } from './api';

afterEach(() => vi.unstubAllGlobals());
it('isolates account pages in the query cache while preserving the exact global key and URL', async () => {
  const calls: { path: string; method: string | undefined }[] = [];
  vi.stubGlobal('fetch', async (path: string, init?: RequestInit) => {
    calls.push({ path: String(path), method: init?.method });
    const url = new URL(String(path), 'https://synthetic.invalid');
    const id = url.searchParams.get('bankAccountId') ?? 'global';
    const entry = {
      type: 'stored',
      id,
      kind: 'import',
      title: 'Bankumsatz prüfen',
      detail: null,
      refType: 'bank-sync-candidate',
      refId: id,
      urgent: false,
      createdAt: '2026-10-20T08:00:00Z',
      bankCandidate: {
        date: '2026-10-20',
        amountCents: -1201,
        currency: 'EUR',
        memo: 'Shop A',
        payeeName: null,
        accountName: 'Gleiches Konto',
      },
    } satisfies InboxStored;
    return new Response(
      JSON.stringify({
        asOf: '2026-10-20',
        count: 1,
        entries: [entry],
        readSourceSummaries: [],
        totalEntries: 1,
        countsByKind: { import: 1 },
        countsByCause: {},
        limit: 100,
        offset: 0,
        next: null,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const a = '72400000-0000-4000-8000-000000000001';
  const b = '72400000-0000-4000-8000-000000000002';
  try {
    const global = inboxPagesQuery();
    expect(global.queryKey).toEqual([...INBOX_KEY, 'pages', 100, 'all', null, null, null, 'auto']);
    const first = inboxPagesQuery('all', undefined, 'newest', undefined, 'umsaetze', undefined, a);
    const second = inboxPagesQuery('all', undefined, 'newest', undefined, 'umsaetze', undefined, b);
    expect(first.queryKey).not.toEqual(second.queryKey);
    expect(first.queryKey).not.toEqual(global.queryKey);
    expect(
      (await client.fetchInfiniteQuery(first)).pages[0]?.entries.map((entry) => entry.id),
    ).toEqual([a]);
    expect(
      (await client.fetchInfiniteQuery(second)).pages[0]?.entries.map((entry) => entry.id),
    ).toEqual([b]);
    expect(
      (await client.fetchInfiniteQuery(global)).pages[0]?.entries.map((entry) => entry.id),
    ).toEqual(['global']);
    expect(calls).toEqual([
      {
        path: `/api/inbox?limit=100&offset=0&dateSort=newest&segment=umsaetze&bankAccountId=${a}`,
        method: 'GET',
      },
      {
        path: `/api/inbox?limit=100&offset=0&dateSort=newest&segment=umsaetze&bankAccountId=${b}`,
        method: 'GET',
      },
      { path: '/api/inbox?limit=100&offset=0&segment=auto', method: 'GET' },
    ]);
  } finally {
    client.clear();
  }
});
