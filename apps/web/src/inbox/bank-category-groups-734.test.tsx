// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@budget/ui';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Lookups } from '../ledger/types';
import { BankCandidate } from './bank-candidate';

const clients: QueryClient[] = [];
const unexpected: string[] = [];
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
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  vi.unstubAllGlobals();
  expect(unexpected.splice(0)).toEqual([]);
});
const lookups = {
  groups: [
    { id: 'g-b', name: 'Gruppe B', sortOrder: 2 },
    { id: 'g-a', name: 'Gruppe A', sortOrder: 1 },
  ],
  categories: [
    { id: 'cat-b', name: 'Muster', groupId: 'g-b', sortOrder: 1, kind: 'expense', class: null },
    { id: 'cat-a', name: 'Muster', groupId: 'g-a', sortOrder: 1, kind: 'expense', class: null },
    { id: 'advance', name: 'Auslagen', groupId: 'g-a', sortOrder: 2, kind: 'advance', class: null },
    { id: 'income', name: 'Einnahme', groupId: 'g-b', sortOrder: 2, kind: 'income', class: null },
    { id: 'unassigned', name: 'Ohne', groupId: null, sortOrder: 1, kind: 'expense', class: null },
    {
      id: 'orphan',
      name: 'Verwaist',
      groupId: 'missing',
      sortOrder: 2,
      kind: 'expense',
      class: null,
    },
    {
      id: 'card',
      name: 'Kartenzahlung',
      groupId: 'g-a',
      sortOrder: 3,
      kind: 'card_payment',
      class: null,
    },
  ],
  projects: [],
  incomeTypes: [],
  contacts: [],
  institutions: [],
} satisfies Lookups;

it('groups the unchanged eligible IDs and confirms only the explicitly chosen duplicate-name category', async () => {
  const writes: Array<{ path: string; body: unknown }> = [];
  const onConfirmed = vi.fn();
  vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      'http://localhost',
    );
    const method = init?.method ?? 'GET';
    if (method === 'GET' && url.pathname === '/api/lookups') return Response.json(lookups);
    if (method === 'GET' && url.pathname === '/api/payees') return Response.json({ payees: [] });
    if (method === 'GET' && url.pathname === '/api/bank-sync/candidates/candidate-734/matches')
      return Response.json({ merge: [], transfers: [] });
    if (method === 'GET' && url.pathname === '/api/assignment-rules/candidates/candidate-734')
      return Response.json({
        suggestions: [],
        cleanup: { cleaned: 'Shop Muster', payeeId: null },
        candidateRevision: 'revision-734',
      });
    if (
      method === 'POST' &&
      url.pathname === '/api/bank-sync/candidates/candidate-734/confirm' &&
      writes.length === 0
    ) {
      writes.push({ path: url.pathname, body: JSON.parse(String(init?.body)) });
      return Response.json({ groupId: 'group-734', bookingId: 'booking-734' });
    }
    unexpected.push(`${method} ${url.pathname}`);
    throw new Error('Unexpected synthetic transport');
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <BankCandidate id="candidate-734" onConfirmed={onConfirmed} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Übernehmen', exact: true }));
  const select = await screen.findByRole('combobox', { name: 'Kategorie' });
  await waitFor(() => expect(within(select).getAllByRole('option')).toHaveLength(7));
  expect(Array.from(select.querySelectorAll('optgroup')).map((g) => g.label)).toEqual([
    'Gruppe A',
    'Gruppe B',
    'Ohne Gruppe',
  ]);
  expect(
    within(select)
      .getAllByRole('option')
      .map((o) => o.getAttribute('value')),
  ).toEqual(['', 'cat-a', 'advance', 'cat-b', 'income', 'unassigned', 'orphan']);
  expect(
    Array.from(select.querySelectorAll('optgroup')).map((g) =>
      Array.from(g.querySelectorAll('option')).map((o) => o.value),
    ),
  ).toEqual([
    ['cat-a', 'advance'],
    ['cat-b', 'income'],
    ['unassigned', 'orphan'],
  ]);
  await user.selectOptions(select, 'cat-b');
  if (!(select instanceof HTMLSelectElement))
    throw new TypeError('Expected native category select');
  expect(select.value).toBe('cat-b');
  expect(writes).toEqual([]);
  await user.click(screen.getByRole('button', { name: 'Abbrechen', exact: true }));
  expect(screen.queryByRole('dialog', { name: 'Buchung übernehmen' })).toBeNull();
  expect(writes).toEqual([]);
  await user.click(screen.getByRole('button', { name: 'Übernehmen', exact: true }));
  expect((screen.getByRole('combobox', { name: 'Kategorie' }) as HTMLSelectElement).value).toBe(
    'cat-b',
  );
  await user.click(screen.getByRole('button', { name: 'Als Buchung bestätigen' }));
  await waitFor(() => expect(onConfirmed).toHaveBeenCalledWith('booking-734'));
  expect(writes).toEqual([
    {
      path: '/api/bank-sync/candidates/candidate-734/confirm',
      body: {
        categoryId: 'cat-b',
        candidateRevision: 'revision-734',
        actions: { categoryId: 'cat-b', payeeId: null },
      },
    },
  ]);
});
