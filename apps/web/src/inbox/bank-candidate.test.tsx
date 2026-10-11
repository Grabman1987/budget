// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@budget/ui';
import { afterEach, expect, it, vi } from 'vitest';
import { BankCandidate } from './bank-candidate';

afterEach(() => vi.unstubAllGlobals());
it('keeps 65 candidates collapsed without row requests and loads checks only on expansion', async () => {
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
  const details = document.querySelector('details')!;
  details.open = true;
  fireEvent(details, new Event('toggle'));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Als Buchung bestätigen' })).toBeTruthy(),
  );
  await waitFor(() => expect(paths.filter((p) => p.includes('synthetic-0'))).toHaveLength(2));
  expect(paths.some((p) => p.includes('synthetic-1/'))).toBe(false);
  client.clear();
});
