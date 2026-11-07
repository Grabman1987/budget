// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { BankSyncRecap, type BankSyncRecapData } from './bank-sync-recap';
import { inboxPagesQuery } from './api';
import { validateInboxSearch } from './navigation';

vi.mock('../shell/app-link', () => ({
  AppLink: ({
    to,
    search,
    children,
    ...props
  }: {
    to: string;
    search: Record<string, string>;
    children: React.ReactNode;
  }) => (
    <a href={`${to}?${new URLSearchParams(search)}`} {...props}>
      {children}
    </a>
  ),
}));
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
afterEach(() => {
  cleanup();
  client.clear();
  vi.unstubAllGlobals();
});
const syncedAt = '2026-11-07T06:00:00.000Z';
const account = {
  sourceId: '99400000-0000-4000-8000-000000000001',
  name: 'Synthetisches Konto',
  syncedAt,
  result: { fetched: 5, linked: 2, new: 3 },
  open: 2,
  running: false,
  status: 'active',
};

it('shows per-account results and exact-batch links without writing', async () => {
  const fetch = vi.fn(async () =>
    Response.json({
      accounts: [account, { ...account, sourceId: 'other', name: 'Weiteres Konto', open: null }],
    } satisfies BankSyncRecapData),
  );
  vi.stubGlobal('fetch', fetch);
  render(
    <QueryClientProvider client={client}>
      <BankSyncRecap />
    </QueryClientProvider>,
  );
  const link = await screen.findByRole('link', { name: 'Neue Umsätze prüfen (2)' });
  const url = new URL(link.getAttribute('href')!, 'https://synthetic.invalid');
  expect(url.searchParams.get('bankSource')).toBe(account.sourceId);
  expect(url.searchParams.get('bankRecap')).toBe(syncedAt);
  expect(screen.getAllByText('5 abgerufen · 2 verknüpft · 3 neu vorgemerkt')).toHaveLength(2);
  expect(screen.getByText(/nicht eindeutig zuordnen/)).toBeTruthy();
  expect(fetch).toHaveBeenCalledExactlyOnceWith(
    '/api/bank-sync/recap',
    expect.objectContaining({ method: 'GET' }),
  );
});

it('distinguishes an empty completed batch from no completed fetch', async () => {
  vi.stubGlobal('fetch', async () =>
    Response.json({
      accounts: [
        { ...account, open: 0, result: { fetched: 5, linked: 0, new: 0 } },
        {
          ...account,
          sourceId: 'never',
          name: 'Noch ohne Abruf',
          syncedAt: null,
          result: null,
          open: null,
        },
      ],
    }),
  );
  render(
    <QueryClientProvider client={client}>
      <BankSyncRecap />
    </QueryClientProvider>,
  );
  expect(await screen.findByText('Keine neuen Umsätze dieses Abrufs offen.')).toBeTruthy();
  expect(screen.getByText('Noch kein vollständiger Abruf.')).toBeTruthy();
  expect(screen.queryByRole('link', { name: /Neue Umsätze prüfen/ })).toBeNull();
});

it('validates and isolates batch search/cache keys while leaving ordinary queries unchanged', async () => {
  expect(validateInboxSearch({ bankRecap: 'invalid' }).bankRecap).toBeUndefined();
  expect(validateInboxSearch({ bankRecap: syncedAt }).bankRecap).toBeUndefined();
  expect(validateInboxSearch({ bankSource: account.sourceId, bankRecap: syncedAt }).bankRecap).toBe(
    syncedAt,
  );
  const fetch = vi.fn<(path: string) => Promise<Response>>(async () =>
    Response.json({ entries: [], next: null }),
  );
  vi.stubGlobal('fetch', fetch);
  const normal = inboxPagesQuery('all', account.sourceId);
  const recap = inboxPagesQuery(
    'all',
    account.sourceId,
    undefined,
    undefined,
    'auto',
    undefined,
    undefined,
    undefined,
    syncedAt,
  );
  expect(recap.queryKey).not.toEqual(normal.queryKey);
  await client.fetchInfiniteQuery(recap);
  const url = new URL(fetch.mock.calls[0]![0] as string, 'https://synthetic.invalid');
  expect(url.searchParams.get('bankRecap')).toBe(syncedAt);
  expect(url.searchParams.get('bankSource')).toBe(account.sourceId);
});
