// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@budget/ui';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BankCandidateRow } from './bank-candidate-row';
import type { InboxStored } from './api';

vi.mock('../budget/use-category-writes', () => ({
  useBudgetWrite: () => (run: () => Promise<unknown>) => run(),
}));
const item: InboxStored = {
  type: 'stored',
  id: 'synthetic-candidate',
  kind: 'import',
  title: 'Bankumsatz prüfen',
  detail: null,
  refType: 'bank-sync-candidate',
  refId: 'synthetic-candidate',
  urgent: false,
  createdAt: '2026-09-17T12:00:00Z',
  bankCandidate: {
    date: '2026-09-17',
    amountCents: -1201,
    currency: 'EUR',
    memo: 'Synthetic candidate',
    payeeName: null,
    accountName: 'Synthetic account',
  },
};
let client: QueryClient;
let matches: { id: string; date?: string; accountName?: string; amountCents?: number }[];
let paths: string[];
let writes: unknown[];
let suggestions: object[];
let transfers: object[];
let defaultCategoryId: string | null;
let hiddenAt: string | null;
let recent: object[];
beforeEach(() => {
  matches = [];
  paths = [];
  writes = [];
  suggestions = [];
  transfers = [];
  recent = [];
  defaultCategoryId = 'category';
  hiddenAt = null;
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  vi.stubGlobal('fetch', async (url: string, options?: RequestInit) => {
    const path = String(url);
    paths.push(path);
    const response = /\/(confirm|merge|transfer)$/.test(path)
      ? (writes.push(JSON.parse(String(options?.body))),
        { groupId: 'synthetic-group', bookingId: 'synthetic-booking' })
      : path.endsWith('/matches')
        ? { merge: matches, link: [], transfers }
        : path.includes('/assignment-rules/candidates/')
          ? {
              candidate: { accountId: 'account', amountCents: -1201, date: '2026-09-17' },
              candidateRevision: 'synthetic-revision',
              cleanup: { payeeId: 'payee', payeeName: 'Synthetic recipient' },
              suggestions,
              existingTransfer: null,
            }
          : path.endsWith('/payees')
            ? {
                payees: [{ id: 'payee', name: 'Synthetic recipient', defaultCategoryId }],
              }
            : path.includes('/bookings?')
              ? { items: recent }
              : path.endsWith('/accounts')
                ? { accounts: [{ id: 'account', name: 'Synthetic account' }] }
                : {
                    categories: [
                      {
                        id: 'category',
                        name: 'Synthetic category',
                        kind: 'expense',
                        class: 'need',
                        groupId: 'group',
                        sortOrder: 0,
                        hiddenAt,
                      },
                    ],
                    groups: [{ id: 'group', name: 'Synthetic group', sortOrder: 0 }],
                  };
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
});

it('explicitly fixes an unchanged suggested recipient and a nonautomatic rule', async () => {
  suggestions = [
    {
      id: 'rule',
      name: 'Synthetic rule',
      revision: 'rule-revision',
      automatic: false,
      unavailable: false,
      actions: { categoryId: 'category' },
    },
  ];
  show();
  fireEvent.focus(screen.getByTestId('inbox-row'));
  await screen.findByText('Regelvorschlag bitte im Formular prüfen.');
  fireEvent.click(screen.getByRole('button', { name: /^Empfänger bearbeiten/ }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Empfänger' }), {
    target: { value: 'payee' },
  });
  expect(screen.getByRole('button', { name: /^Empfänger bearbeiten/ }).className).toContain(
    'is-safe',
  );
  fireEvent.click(screen.getByRole('button', { name: /^Vorschlag bearbeiten/ }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Vorschlag' }), {
    target: { value: 'rule' },
  });
  expect(screen.getByRole('button', { name: /^Vorschlag bearbeiten/ }).className).toContain(
    'is-safe',
  );
  expect((screen.getByRole('button', { name: 'Übernehmen' }) as HTMLButtonElement).disabled).toBe(
    false,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Übernehmen' }));
  await waitFor(() =>
    expect(writes).toEqual([
      {
        categoryId: null,
        ruleId: 'rule',
        revision: 'rule-revision',
        candidateRevision: 'synthetic-revision',
      },
    ]),
  );
});

it('requires an explicit unique transfer choice and uses the existing transfer writer', async () => {
  transfers = [{ id: 'counterpart', accountName: 'Synthetic savings', date: '2026-09-17' }];
  show();
  fireEvent.focus(screen.getByTestId('inbox-row'));
  await screen.findByText('Gegenbuchung unter Vorschlag wählen.');
  fireEvent.click(screen.getByRole('button', { name: /^Vorschlag bearbeiten/ }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Vorschlag' }), {
    target: { value: 'transfer:counterpart' },
  });
  expect(screen.getByRole('button', { name: /^Gegenkonto bearbeiten/ }).textContent).toContain(
    'Synthetic savings',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Übernehmen' }));
  await waitFor(() => expect(writes).toEqual([{ bookingId: 'counterpart' }]));
  expect(paths.some((path) => path.endsWith('/synthetic-candidate/transfer'))).toBe(true);
});

it('offers the single category from the latest booking as an uncommitted suggestion', async () => {
  defaultCategoryId = null;
  recent = [{ splits: [{ categoryId: 'category' }] }];
  show();
  fireEvent.focus(screen.getByTestId('inbox-row'));
  await waitFor(() =>
    expect((screen.getByRole('button', { name: 'Übernehmen' }) as HTMLButtonElement).disabled).toBe(
      false,
    ),
  );
  expect(screen.getByRole('button', { name: /^Kategorie bearbeiten/ }).textContent).toContain(
    'Synthetic category',
  );
  expect(screen.getByRole('button', { name: /^Kategorie bearbeiten/ }).className).not.toContain(
    'is-safe',
  );
  expect(writes).toEqual([]);
});

it('does not offer archived categories or accept an archived default', async () => {
  hiddenAt = '2026-09-01T00:00:00Z';
  show();
  fireEvent.focus(screen.getByTestId('inbox-row'));
  await screen.findByText('Kategorie fehlt.');
  expect((screen.getByRole('button', { name: 'Übernehmen' }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  fireEvent.click(screen.getByRole('button', { name: /^Kategorie bearbeiten/ }));
  expect(screen.queryByRole('option', { name: /Synthetic category/ })).toBeNull();
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.unstubAllGlobals();
});
const show = (onPrepared = vi.fn()) =>
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <table>
          <tbody>
            <BankCandidateRow
              item={item}
              selected={false}
              onSelect={undefined}
              onPrepared={onPrepared}
              onConfirmed={() => undefined}
              onResolve={() => undefined}
              busy={false}
            />
          </tbody>
        </table>
      </ToastProvider>
    </QueryClientProvider>,
  );

it('loads only on interaction, keeps suggestions local, and confirms the chosen cents/payee/category', async () => {
  show();
  expect(paths).toEqual([]);
  fireEvent.focus(screen.getByTestId('inbox-row'));
  await waitFor(() =>
    expect((screen.getByRole('button', { name: 'Übernehmen' }) as HTMLButtonElement).disabled).toBe(
      false,
    ),
  );
  expect(screen.getByRole('button', { name: /^Kategorie bearbeiten/ }).className).not.toContain(
    'is-safe',
  );
  fireEvent.click(screen.getByRole('button', { name: /^Kategorie bearbeiten/ }));
  fireEvent.keyDown(screen.getByRole('combobox', { name: 'Kategorie' }), {
    key: 'Escape',
  });
  expect(screen.queryByRole('combobox', { name: 'Kategorie' })).toBeNull();
  expect(writes).toEqual([]);
  fireEvent.click(screen.getByRole('button', { name: 'Übernehmen' }));
  await waitFor(() =>
    expect(writes).toEqual([
      {
        categoryId: 'category',
        candidateRevision: 'synthetic-revision',
        actions: { categoryId: 'category', payeeId: 'payee' },
      },
    ]),
  );
});

it('keeps a complete row blocked when multiple possible counterparts exist', async () => {
  matches = [{ id: 'synthetic-counterpart' }, { id: 'synthetic-other' }];
  show();
  fireEvent.focus(screen.getByTestId('inbox-row'));
  await screen.findByText('Mehrere mögliche Gegenbuchungen. Bitte im Formular prüfen.');
  expect((screen.getByRole('button', { name: 'Übernehmen' }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  expect(screen.getByRole('button', { name: /^Vorschlag bearbeiten/ }).className).toContain(
    'is-missing',
  );
  expect(writes).toEqual([]);
});

it('retains full-form merge preparation for selected bulk actions after refetch and close', async () => {
  matches = [
    {
      id: 'synthetic-merge',
      date: '2026-09-17',
      accountName: 'Synthetic account',
      amountCents: -1201,
    },
  ];
  const prepared = vi.fn();
  show(prepared);
  fireEvent.focus(screen.getByTestId('inbox-row'));
  fireEvent.click(screen.getByRole('button', { name: 'Prüfen' }));
  await screen.findByRole('button', { name: /Mit Buchung .* zusammenführen/ });
  await act(() => client.invalidateQueries({ queryKey: ['ledger'] }));
  fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));
  await waitFor(() =>
    expect(prepared.mock.lastCall).toEqual([
      'synthetic-candidate',
      expect.objectContaining({
        action: 'merge',
        bookingId: 'synthetic-merge',
        candidateRevision: 'synthetic-revision',
      }),
    ]),
  );
});
