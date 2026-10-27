// @vitest-environment jsdom
import { DEFAULT_EXPLORER_QUERY, type ExplorerViewsState } from '@budget/domain';
import { setAmountsHidden } from '@budget/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { SavedExplorerLinks } from './saved-explorer-links';
import { SAVED_EXPLORER_KEY, savedExplorerEntryQuery } from './explorer-view-api';

vi.mock('../shell/app-link', () => ({
  AppLink: ({ to, search, children }: { to: string; search?: Record<string, string>; children: ReactNode }) => <a href={`${to}${search ? `?${new URLSearchParams(search)}` : ''}`}>{children}</a>,
}));
const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.splice(0).forEach((client) => client.clear()); act(() => setAmountsHidden(false)); localStorage.clear(); vi.unstubAllGlobals(); });
const state = (name: string): ExplorerViewsState => ({ schemaVersion: 1, revision: 'head', unavailable: false, views: [{ id: 'saved-id', name, query: DEFAULT_EXPLORER_QUERY }] });
it('hides earlier cached chips during the fresh server read and links only by ID without promoting local data', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client);
  client.setQueryData(SAVED_EXPLORER_KEY, state('Earlier cached name'));
  let resolve!: (response: Response) => void;
  const fetch = vi.fn(() => new Promise<Response>((done) => { resolve = done; }));
  vi.stubGlobal('fetch', fetch);
  localStorage.setItem('budget-explorer-views', '[{"name":"local private","query":{}}]');
  render(<QueryClientProvider client={client}><SavedExplorerLinks /></QueryClientProvider>);
  expect(screen.queryByRole('link', { name: 'Earlier cached name' })).toBeNull();
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  await act(async () => resolve(Response.json(state('Synthetic 123,45 €'))));
  const chip = await screen.findByRole('link', { name: 'Synthetic 123,45 €' });
  expect(chip.getAttribute('href')).toBe('/reports/explorer?ansicht=saved-id');
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0]).toEqual(['/api/reports/saved-queries', expect.objectContaining({ method: 'GET' })]);
  expect(localStorage.getItem('budget-explorer-views')).toBe('[{"name":"local private","query":{}}]');
  act(() => setAmountsHidden(true));
  expect(chip.textContent).not.toContain('123,45');
  expect(chip.getAttribute('href')).toBe('/reports/explorer?ansicht=saved-id');
});
it('each saved entry/generation reads the server rather than the cached hub query and disables absent IDs', async () => {
  const client = new QueryClient(); clients.push(client);
  client.setQueryData(SAVED_EXPLORER_KEY, state('stale'));
  vi.stubGlobal('fetch', vi.fn(async () => Response.json(state('fresh'))));
  const first = savedExplorerEntryQuery('saved-id', 'mount:0');
  const next = savedExplorerEntryQuery('saved-id', 'mount:2');
  expect(first.queryKey).not.toEqual(next.queryKey);
  expect(first.gcTime).toBe(0);
  expect(first.retry).toBe(false);
  expect(savedExplorerEntryQuery(undefined, 'mount:0').enabled).toBe(false);
  expect((await client.fetchQuery(first)).views[0]?.name).toBe('fresh');
  expect((await client.fetchQuery(next)).views[0]?.name).toBe('fresh');
});
