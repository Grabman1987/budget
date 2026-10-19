// @vitest-environment jsdom
import { ToastProvider } from '@budget/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { StrictMode, type ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { useExplorerViews } from './use-explorer-views';
import { EXPLORER_VIEWS_KEY } from './explorer-views';

const query = { dim: 'kategorie', cls: 'want', cols: 'quartal', period: '3J', meas: 'summe' };
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

it('recovers a concurrent revision conflict through the visible retry and preserves raw source until success', async () => {
  const raw = JSON.stringify([{ name: 'Lokal', query }]);
  localStorage.setItem(EXPLORER_VIEWS_KEY, raw);
  let reads = 0;
  const posted: unknown[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_path: string, init: RequestInit) => {
      if (init.method === 'GET') {
        reads++;
        return Response.json({
          schemaVersion: 1,
          revision: reads === 1 ? 'old-head' : 'new-head',
          unavailable: false,
          views: [],
        });
      }
      const body = JSON.parse(String(init.body));
      posted.push(body);
      if (body.revision !== 'new-head')
        return Response.json({ error: 'conflict', message: 'Concurrent change' }, { status: 409 });
      return Response.json({
        schemaVersion: 1,
        revision: 'ack',
        unavailable: false,
        groupId: 'migration-group',
        changed: true,
        views: [{ id: '11111111-1111-4111-8111-111111111111', name: 'Lokal', query }],
      });
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <StrictMode>
      <QueryClientProvider client={client}>
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
    </StrictMode>
  );
  const { result } = renderHook(useExplorerViews, { wrapper });
  await waitFor(() => expect(result.current.migrationError).toContain('Concurrent change'));
  expect(localStorage.getItem(EXPLORER_VIEWS_KEY)).toBe(raw);
  expect(posted).toHaveLength(1);
  await act(() => result.current.retryMigration());
  await waitFor(() => expect(result.current.views).toHaveLength(1));
  await waitFor(() => expect(result.current.busy).toBe(false));
  expect(posted).toEqual([
    { revision: 'old-head', kind: 'import', views: [{ name: 'Lokal', query }] },
    { revision: 'new-head', kind: 'import', views: [{ name: 'Lokal', query }] },
  ]);
  expect(localStorage.getItem(EXPLORER_VIEWS_KEY)).toBe(null);
  expect(result.current.migrationError).toBe('');
  client.clear();
});
