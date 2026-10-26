// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@budget/ui';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BankCandidate } from './bank-candidate';

beforeEach(() => {
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: false,
    media,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});
afterEach(() => vi.unstubAllGlobals());
it('keeps 65 candidates unopened without row requests and loads checks only on opening', async () => {
  const paths: string[] = [];
  vi.stubGlobal('fetch', async (url: string) => {
    paths.push(String(url));
    return new Response(
      JSON.stringify(
        String(url).includes('/matches')
          ? { merge: [], link: [], transfers: [] }
          : String(url).includes('/candidates/')
            ? {
                suggestions: [],
                cleanup: { cleaned: 'Shop A', payeeId: null },
                candidateRevision: 'a'.repeat(64),
              }
            : { categories: [], incomeTypes: [], payees: [] },
      ),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        {Array.from({ length: 65 }, (_, i) => (
          <BankCandidate key={i} id={`synthetic-${i}`} />
        ))}
      </ToastProvider>
    </QueryClientProvider>,
  );
  expect(screen.queryByRole('button', { name: 'Als Buchung bestätigen' })).toBeNull();
  expect(paths.length).toBeLessThan(10);
  fireEvent.click(screen.getAllByRole('button', { name: 'Übernehmen', exact: true })[0]!);
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Als Buchung bestätigen' })).toBeTruthy(),
  );
  await waitFor(() => expect(paths.filter((p) => p.includes('synthetic-0'))).toHaveLength(2));
  expect(paths.some((p) => p.includes('synthetic-1/'))).toBe(false);
  client.clear();
});

it('prepares no suggestion while the match check is still loading, then prefers the merge', async () => {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => (release = resolve));
  vi.stubGlobal('fetch', async (url: string) => {
    const path = String(url);
    if (path.includes('/matches')) await gate;
    const body = path.includes('/matches')
      ? {
          merge: [
            {
              id: 'own-1',
              date: '2026-10-01',
              accountName: 'Giro',
              memo: null,
              amountCents: -1201,
            },
          ],
          link: [],
          transfers: [],
        }
      : path.includes('/candidates/')
        ? {
            suggestions: [
              {
                id: 'rule-1',
                name: 'Shop A zuordnen',
                revision: 'b'.repeat(64),
                automatic: true,
                unavailable: null,
                actions: { categoryId: 'essen' },
              },
            ],
            cleanup: { cleaned: 'Shop A', payeeId: null },
            candidateRevision: 'a'.repeat(64),
          }
        : { categories: [], incomeTypes: [], payees: [], accounts: [] };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
  const seen: (string | undefined)[] = [];
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <BankCandidate
          id="synthetic-0"
          onPrepared={(suggestion) => seen.push(suggestion?.action)}
        />
      </ToastProvider>
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getAllByRole('button', { name: 'Übernehmen', exact: true })[0]!);
  await waitFor(() => expect(screen.getByText('Shop A zuordnen')).toBeTruthy());
  expect(seen.filter(Boolean)).toEqual([]);
  release();
  await waitFor(() => expect(seen).toContain('merge'));
  expect(seen).not.toContain('rule');
  client.clear();
});
