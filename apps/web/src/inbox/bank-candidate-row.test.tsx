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
let visible: (entries: { isIntersecting: boolean }[]) => void;
beforeEach(() => {
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: typeof visible) {
        visible = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
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
              candidate: {
                accountId: 'account',
                amountCents: -1201,
                date: '2026-09-17',
                currency: 'EUR',
              },
              candidateRevision: 'synthetic-revision',
              cleanup: { payeeId: 'payee', payeeName: 'Synthetic recipient' },
              suggestions,
              existingTransfer: null,
            }
          : path.endsWith('/payees')
            ? {
                payees: [
                  { id: 'payee', name: 'Synthetic recipient', defaultCategoryId },
                  { id: 'other-payee', name: 'Other recipient', defaultCategoryId: null },
                ],
              }
            : path.includes('/bookings?')
              ? { items: recent }
              : path.endsWith('/accounts')
                ? { accounts: [{ id: 'account', name: 'Synthetic account' }] }
                : {
                    categories: [
                      {
                        id: 'other-category',
                        name: 'Other category',
                        kind: 'expense',
                        class: 'need',
                        groupId: 'group',
                        sortOrder: 1,
                      },
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
        candidateRevision: 'synthetic-revision',
        actions: { categoryId: 'category', payeeId: 'payee' },
      },
    ]),
  );
});

it('adopts a transfer rule after a recipient choice without sending an incompatible payee', async () => {
  suggestions = [
    {
      id: 'rule',
      name: 'Synthetic transfer',
      revision: 'rule-revision',
      automatic: true,
      unavailable: false,
      actions: { transferAccountId: 'account' },
    },
  ];
  const confirmed = vi.fn();
  show(vi.fn(), confirmed);
  fireEvent.focus(screen.getByTestId('inbox-row'));
  await screen.findByRole('button', { name: /^Gegenkonto bearbeiten/ });
  fireEvent.click(screen.getByRole('button', { name: /^Empfänger bearbeiten/ }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Empfänger' }), {
    target: { value: 'payee' },
  });
  fireEvent.click(screen.getByRole('button', { name: /^Vorschlag bearbeiten/ }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Vorschlag' }), {
    target: { value: 'rule' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Übernehmen' }));
  await waitFor(() =>
    expect(writes).toEqual([
      {
        categoryId: null,
        candidateRevision: 'synthetic-revision',
        ruleId: 'rule',
        revision: 'rule-revision',
      },
    ]),
  );
  expect(confirmed).not.toHaveBeenCalled();
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
const show = (onPrepared = vi.fn(), onConfirmed = vi.fn(), entry = item) =>
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <table>
          <tbody>
            <BankCandidateRow
              item={entry}
              selected={false}
              onSelect={undefined}
              onPrepared={onPrepared}
              onConfirmed={onConfirmed}
              onResolve={() => undefined}
              busy={false}
            />
          </tbody>
        </table>
      </ToastProvider>
    </QueryClientProvider>,
  );

it('loads on visibility without hover, keeps suggestions local, and confirms the chosen cents/payee/category', async () => {
  show();
  expect(paths).toEqual([]);
  act(() => visible([{ isIntersecting: true }]));
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

it.each(['cell', 'form'])(
  'uses list preparation without per-row reads until the user opens the %s',
  async (editor) => {
    suggestions = [
      {
        id: 'rule',
        name: 'Synthetic rule',
        revision: 'rule-revision',
        automatic: true,
        unavailable: false,
        actions: { categoryId: 'category' },
      },
    ];
    const assignment = await (
      await fetch('/assignment-rules/candidates/synthetic-candidate')
    ).json();
    paths = [];
    const prepared = vi.fn();
    show(prepared, vi.fn(), {
      ...item,
      bankCandidate: {
        ...item.bankCandidate!,
        preparation: {
          assignment,
          matches: {
            merge: [],
            link: [],
            transfers: [],
            preferredBookingId: null,
            alternativeCount: 0,
          },
        },
      },
    });
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: 'Übernehmen' }) as HTMLButtonElement).disabled,
      ).toBe(false),
    );
    fireEvent.pointerEnter(screen.getByTestId('inbox-row'));
    fireEvent.focus(screen.getByTestId('inbox-row'));
    await act(async () => undefined);
    expect(paths.some((path) => /\/matches|\/assignment-rules\/candidates\//.test(path))).toBe(
      false,
    );
    expect(prepared.mock.lastCall).toEqual([
      item.id,
      expect.objectContaining({ action: 'rule', ruleId: 'rule', bulkSafe: true }),
    ]);
    expect(writes).toEqual([]);
    fireEvent.click(
      screen.getByRole('button', {
        name: editor === 'cell' ? /^Vorschlag bearbeiten/ : 'Prüfen',
      }),
    );
    await waitFor(() => {
      expect(paths.some((path) => path.endsWith('/matches'))).toBe(true);
      expect(paths.some((path) => path.includes('/assignment-rules/candidates/'))).toBe(true);
    });
    expect(writes).toEqual([]);
  },
);

it('does not fetch payee history for mounted prepared rows with no rule or default category', async () => {
  defaultCategoryId = null;
  const assignment = await (await fetch('/assignment-rules/candidates/synthetic-candidate')).json();
  paths = [];
  show(vi.fn(), vi.fn(), {
    ...item,
    bankCandidate: {
      ...item.bankCandidate!,
      preparation: {
        assignment,
        matches: {
          merge: [],
          link: [],
          transfers: [],
          preferredBookingId: null,
          alternativeCount: 0,
        },
      },
    },
  });
  await screen.findByText('Kategorie fehlt.');
  expect(
    paths.some((path) => /\/matches|\/assignment-rules\/candidates\/|\/bookings\?/.test(path)),
  ).toBe(false);
  expect(writes).toEqual([]);
});

it('retains a recipient chosen while fresh editor queries are still loading', async () => {
  const assignment = await (await fetch('/assignment-rules/candidates/synthetic-candidate')).json();
  show(vi.fn(), vi.fn(), {
    ...item,
    bankCandidate: {
      ...item.bankCandidate!,
      preparation: {
        assignment,
        matches: {
          merge: [],
          link: [],
          transfers: [],
          preferredBookingId: null,
          alternativeCount: 0,
        },
      },
    },
  });
  await screen.findByRole('button', { name: 'Empfänger bearbeiten: Synthetic recipient' });
  fireEvent.click(screen.getByRole('button', { name: /^Empfänger bearbeiten/ }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Empfänger' }), {
    target: { value: 'other-payee' },
  });
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /^Empfänger bearbeiten/ }).textContent).toContain(
      'Other recipient',
    );
  });
  expect(writes).toEqual([]);
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

it('prepares a safe rule for bulk confirmation without hover or focus', async () => {
  suggestions = [
    {
      id: 'rule',
      name: 'Synthetic rule',
      revision: 'rule-revision',
      automatic: true,
      unavailable: false,
      actions: { categoryId: 'category' },
    },
  ];
  const prepared = vi.fn();
  show(prepared);
  act(() => visible([{ isIntersecting: false }]));
  expect(paths).toEqual([]);
  act(() => visible([{ isIntersecting: true }]));
  await waitFor(() =>
    expect(prepared.mock.lastCall).toEqual([
      item.id,
      expect.objectContaining({ action: 'rule', ruleId: 'rule', bulkSafe: true }),
    ]),
  );
  expect((screen.getByRole('button', { name: 'Übernehmen' }) as HTMLButtonElement).disabled).toBe(
    false,
  );
});

it('keeps a chosen category when choosing a recipient and manual suggestion', async () => {
  show();
  fireEvent.focus(screen.getByTestId('inbox-row'));
  await screen.findByRole('button', { name: 'Kategorie bearbeiten: Synthetic category' });
  fireEvent.click(screen.getByRole('button', { name: /^Kategorie bearbeiten/ }));
  fireEvent.click(screen.getByRole('combobox', { name: 'Kategorie' }));
  fireEvent.click(await screen.findByRole('option', { name: /Synthetic category/ }));
  fireEvent.click(screen.getByRole('button', { name: /^Empfänger bearbeiten/ }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Empfänger' }), {
    target: { value: 'payee' },
  });
  fireEvent.click(screen.getByRole('button', { name: /^Vorschlag bearbeiten/ }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Vorschlag' }), {
    target: { value: 'manual' },
  });
  expect(screen.getByRole('button', { name: /^Kategorie bearbeiten/ }).className).toContain(
    'is-safe',
  );
  expect(screen.getByRole('button', { name: /^Empfänger bearbeiten/ }).className).toContain(
    'is-safe',
  );
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

it('adopts and marks a rule’s values only when that rule is explicitly chosen', async () => {
  suggestions = [
    {
      id: 'rule',
      name: 'Synthetic rule',
      revision: 'rule-revision',
      automatic: true,
      unavailable: false,
      actions: { payeeId: 'other-payee', categoryId: 'other-category' },
    },
  ];
  show();
  fireEvent.focus(screen.getByTestId('inbox-row'));
  await screen.findByRole('button', { name: 'Kategorie bearbeiten: Other category' });
  fireEvent.click(screen.getByRole('button', { name: /^Kategorie bearbeiten/ }));
  fireEvent.click(screen.getByRole('combobox', { name: 'Kategorie' }));
  fireEvent.click(await screen.findByRole('option', { name: 'Synthetic category' }));
  fireEvent.click(screen.getByRole('button', { name: /^Empfänger bearbeiten/ }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Empfänger' }), {
    target: { value: 'payee' },
  });
  fireEvent.click(screen.getByRole('button', { name: /^Vorschlag bearbeiten/ }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Vorschlag' }), {
    target: { value: 'rule' },
  });
  expect(
    screen.getByRole('button', { name: 'Kategorie bearbeiten: Other category' }).className,
  ).toContain('is-safe');
  expect(
    screen.getByRole('button', { name: 'Empfänger bearbeiten: Other recipient' }).className,
  ).toContain('is-safe');
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

it('does not mark a payee default as chosen when a rule without category is selected', async () => {
  suggestions = [
    {
      id: 'rule',
      name: 'Synthetic rule',
      revision: 'rule-revision',
      automatic: false,
      unavailable: false,
      actions: { payeeId: 'payee' },
    },
  ];
  show();
  fireEvent.focus(screen.getByTestId('inbox-row'));
  await screen.findByText('Regelvorschlag bitte im Formular prüfen.');
  fireEvent.click(screen.getByRole('button', { name: /^Vorschlag bearbeiten/ }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Vorschlag' }), {
    target: { value: 'rule' },
  });
  expect(screen.getByRole('button', { name: /^Kategorie bearbeiten/ }).className).not.toContain(
    'is-safe',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Übernehmen' }));
  await waitFor(() =>
    expect(writes).toEqual([
      {
        categoryId: null,
        candidateRevision: 'synthetic-revision',
        actions: { payeeId: 'payee', categoryId: 'category' },
      },
    ]),
  );
});

it.each([
  [{ transferAccountId: 'account' }, false],
  [{ categoryId: 'category' }, true],
  [{ splits: [{ categoryId: 'category', amountCents: -1201 }] }, true],
])('offers learning only for category or split confirmation (%j)', async (actions, learns) => {
  defaultCategoryId = null;
  suggestions = [
    {
      id: 'rule',
      name: 'Synthetic rule',
      revision: 'rule-revision',
      automatic: true,
      unavailable: false,
      actions,
    },
  ];
  const confirmed = vi.fn();
  show(vi.fn(), confirmed);
  fireEvent.focus(screen.getByTestId('inbox-row'));
  await waitFor(() =>
    expect((screen.getByRole('button', { name: 'Übernehmen' }) as HTMLButtonElement).disabled).toBe(
      false,
    ),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Übernehmen' }));
  await waitFor(() => expect(writes).toHaveLength(1));
  if (learns) await waitFor(() => expect(confirmed).toHaveBeenCalledWith('synthetic-booking'));
  else expect(confirmed).not.toHaveBeenCalled();
});

it.each([
  [{ splits: [{ categoryId: 'category', amountCents: -1201 }] }, 'Aufteilung laut Regel'],
  [{ incomeTypeId: 'synthetic-income' }, 'Einkommen laut Regel'],
])('shows the selected rule target instead of a payee default (%j)', async (actions, label) => {
  suggestions = [
    {
      id: 'rule',
      name: 'Synthetic rule',
      revision: 'rule-revision',
      automatic: false,
      unavailable: false,
      actions,
    },
  ];
  show();
  fireEvent.focus(screen.getByTestId('inbox-row'));
  await screen.findByText('Regelvorschlag bitte im Formular prüfen.');
  fireEvent.click(screen.getByRole('button', { name: /^Vorschlag bearbeiten/ }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Vorschlag' }), {
    target: { value: 'rule' },
  });
  expect(
    screen.getByRole('button', { name: `Kategorie bearbeiten: ${label}` }).className,
  ).toContain('is-safe');
});
