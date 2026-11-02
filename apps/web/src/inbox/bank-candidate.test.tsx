// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@budget/ui';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BankCandidate } from './bank-candidate';

const flags = vi.hoisted(() => ({ REDESIGN_ENABLED: false }));
vi.mock('../shell/redesign-flag', () => flags);

beforeEach(() => {
  flags.REDESIGN_ENABLED = false;
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
  fireEvent.click(screen.getAllByRole('button', { name: 'Übernehmen' })[0]!);
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
  fireEvent.click(screen.getAllByRole('button', { name: 'Übernehmen' })[0]!);
  await waitFor(() => expect(screen.getByText('Shop A zuordnen')).toBeTruthy());
  expect(seen.filter(Boolean)).toEqual([]);
  release();
  await waitFor(() => expect(seen).toContain('merge'));
  expect(seen).not.toContain('rule');
  client.clear();
});

it.each([
  ['unique rule', 1, false, true],
  ['ambiguous rules', 2, false, false],
  ['possible transfer', 1, true, false],
] as const)(
  'prepares safe shortcut metadata only after complete checks: %s (#842)',
  async (_name, ruleCount, transfer, expected) => {
    flags.REDESIGN_ENABLED = true;
    vi.stubGlobal('fetch', async (input: string) =>
      Response.json(
        input.includes('/matches')
          ? {
              merge: [],
              link: [],
              transfers: transfer
                ? [
                    {
                      id: 'transfer-1',
                      date: '2026-09-17',
                      accountName: 'Synthetic other',
                      memo: null,
                      amountCents: 1201,
                    },
                  ]
                : [],
            }
          : input.includes('/candidates/')
            ? {
                suggestions: Array.from({ length: ruleCount }, (_, index) => ({
                  id: `rule-${index}`,
                  name: `Synthetic rule ${index}`,
                  revision: 'b'.repeat(64),
                  automatic: true,
                  unavailable: null,
                  actions: { categoryId: 'category-1' },
                })),
                cleanup: { cleaned: 'Synthetic shop', payeeId: null },
                candidateRevision: 'a'.repeat(64),
              }
            : { categories: [], incomeTypes: [], payees: [], accounts: [] },
      ),
    );
    const prepared = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <BankCandidate id="safe-candidate" onPrepared={prepared} />
        </ToastProvider>
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Übernehmen' }));
    await waitFor(() =>
      expect(prepared.mock.calls.some(([suggestion]) => suggestion?.action === 'rule')).toBe(true),
    );
    expect(prepared.mock.calls.at(-1)?.[0].bulkSafe).toBe(expected);
    client.clear();
  },
);
