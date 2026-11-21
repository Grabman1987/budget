// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@budget/ui';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { LEDGER_KEY } from '../ledger/queries';
import { BankCandidate } from './bank-candidate';

vi.mock('../shell/redesign-flag', () => ({ REDESIGN_ENABLED: true }));
let client: QueryClient;
afterEach(() => {
  cleanup();
  client.clear();
  vi.unstubAllGlobals();
});

it('ON explains source, five-day suggestions and ambiguity without writing on selection', async () => {
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  const writes: string[] = [];
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    if ((init?.method ?? 'GET') !== 'GET') writes.push(input);
    if (input === '/api/lookups') return Response.json({ categories: [], groups: [] });
    if (input === '/api/payees') return Response.json({ payees: [] });
    if (input.endsWith('/matches'))
      return Response.json({
        merge: [
          {
            id: 'a',
            date: '2026-10-22',
            accountName: 'Konto A',
            memo: 'Muster A',
            amountCents: -1250,
          },
          {
            id: 'b',
            date: '2026-11-01',
            accountName: 'Konto A',
            memo: 'Muster B',
            amountCents: -1250,
          },
        ],
        transfers: [],
        preferredBookingId: 'b',
        alternativeCount: 1,
      });
    if (input === '/api/assignment-rules/candidates/synthetic-516')
      return Response.json({
        suggestions: [],
        cleanup: { cleaned: 'Muster', payeeId: null },
        candidateRevision: 'synthetic-revision',
      });
    throw new Error('Unexpected synthetic request');
  });
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <BankCandidate id="synthetic-516" />
      </ToastProvider>
    </QueryClientProvider>,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Übernehmen' }));
  const select = await screen.findByRole('combobox', {
    name: 'Passende Buchung',
  });
  expect(screen.getByText(/Quelle: Bankumsatz/).textContent).toContain(
    'höchstens fünf Kalendertagen',
  );
  expect(screen.getByText(/Quelle: Bankumsatz/).textContent).toContain(
    'Erst das Zusammenführen übernimmt die Bankreferenz.',
  );
  expect(screen.getByText(/Quelle: Bankumsatz/).textContent).toContain('1 Alternative');
  expect((select as HTMLSelectElement).value).toBe('b');
  await user.selectOptions(select, 'a');
  client.setQueryData([...LEDGER_KEY, 'bank-matches', 'synthetic-516'], {
    merge: [
      {
        id: 'b',
        date: '2026-11-01',
        accountName: 'Konto A',
        memo: 'Muster B',
        amountCents: -1250,
      },
    ],
    transfers: [],
    preferredBookingId: 'b',
    alternativeCount: 0,
  });
  await waitFor(() => {
    expect(screen.getByText(/Quelle: Bankumsatz/).textContent).toContain('0 Alternativen');
    expect((select as HTMLSelectElement).value).toBe('');
    expect(
      (screen.getByRole('button', { name: 'Buchung auswählen' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
  await user.click(screen.getByRole('button', { name: 'Abbrechen' }));
  expect(writes).toEqual([]);
});
