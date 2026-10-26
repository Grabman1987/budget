// @vitest-environment jsdom
import type { ReactNode } from 'react';
import type * as BudgetDomain from '@budget/domain';
import { ToastProvider, setAmountsHidden } from '@budget/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { accountsQuery, lookupsQuery, payeesQuery } from '../ledger/queries';
import type { AccountList, Lookups } from '../ledger/types';
import { expectedQuery, paymentDetailQuery, versionsQuery, type ExpectedPayment } from './api';
import { PaymentPanel } from './payment-panel';

vi.mock('@budget/domain', async (original) => ({
  ...(await original<typeof BudgetDomain>()),
  todayInVienna: () => '2026-09-17',
}));
vi.mock('../shell/app-link', () => ({
  AppLink: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

const clients: QueryClient[] = [];
const dialogDescriptors = new Map(
  ['showModal', 'close'].map((key) => [
    key,
    Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, key),
  ]),
);
beforeEach(() => {
  setAmountsHidden(false);
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.open = true;
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.open = false;
    },
  });
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  for (const [key, descriptor] of dialogDescriptors) {
    if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, key, descriptor);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, key);
  }
  vi.unstubAllGlobals();
});

function payment(): ExpectedPayment {
  return {
    id: 'synthetic-payment-607',
    name: 'Synthetic payment',
    kind: 'outflow',
    accountId: null,
    payeeId: null,
    contactId: null,
    categoryId: null,
    incomeTypeId: null,
    contactShareBp: 0,
    amountToleranceCents: 0,
    dateWindowDays: 3,
    rhythm: 'monthly',
    intervalWeeks: null,
    dueDay: 20,
    dueMonth: null,
    dateShift: 'none',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    note: null,
    deletedAt: null,
    version: {
      id: 'synthetic-version-607',
      validFrom: '2026-01-01',
      amountCents: 1234,
      amountMaxCents: null,
      currency: 'EUR',
    },
    amountCents: -1234,
    nextDueDate: '2026-09-20',
    monthlyEquivalentCents: -1234,
    yearlyEquivalentCents: -14808,
    lifecycle: {
      pauses: [],
      endedFrom: null,
      endEvidence: 'none',
      deletion: 'neverAssigned',
      reviewToken: 'reviewed-token-A',
    },
  };
}

function show(initial = payment(), creating = false) {
  let current = initial;
  const writes: Array<{ method: string; path: string; body: unknown }> = [];
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  clients.push(client);
  const detail = {
    paymentId: initial.id,
    asOf: '2026-09-17',
    history: [],
    future: [],
    sparseHistory: true,
    hasEarlierRecorded: false,
    hasFurtherFuture: false,
  };
  const versions = [{ ...initial.version!, expectedPaymentId: initial.id, note: null }];
  const accounts: AccountList = {
    asOf: '2026-09-17',
    accounts: [],
    netWorthEurCents: 0,
    missingFxCurrencies: [],
    missingPriceSecurityIds: [],
  };
  const lookups: Lookups = {
    groups: [],
    categories: [],
    projects: [],
    incomeTypes: [],
    contacts: [],
    institutions: [],
  };
  client.setQueryData(expectedQuery().queryKey, [current]);
  client.setQueryData(paymentDetailQuery(initial.id, '2026-09-17').queryKey, detail);
  client.setQueryData(versionsQuery(initial.id).queryKey, versions);
  client.setQueryData(accountsQuery().queryKey, accounts);
  client.setQueryData(lookupsQuery().queryKey, lookups);
  client.setQueryData(payeesQuery().queryKey, { payees: [] });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, init?: RequestInit) => {
      const reply = (value: unknown, status = 200) =>
        new Response(JSON.stringify(value), {
          status,
          headers: { 'content-type': 'application/json' },
        });
      if (init?.method !== 'GET') {
        writes.push({
          method: init?.method ?? '',
          path,
          body: JSON.parse(String(init?.body ?? '{}')),
        });
        // Real HTTP transport and error handling; the separate real-API suite proves CAS itself.
        if (path.endsWith('/pause') || path.endsWith('/end'))
          return reply(
            { error: 'conflict', message: 'Zahlung wurde geändert. Bitte neu prüfen.' },
            409,
          );
        if (init?.method === 'PATCH' && path === `/api/expected/${initial.id}`)
          return reply({ groupId: 'synthetic-group' });
        throw new Error(`Unexpected mutation: ${init?.method} ${path}`);
      }
      if (path === '/api/expected') return reply({ payments: [current] });
      if (path === `/api/expected/${initial.id}/detail`) return reply(detail);
      if (path === `/api/expected/${initial.id}/versions`) return reply({ versions });
      if (path === '/api/accounts') return reply(accounts);
      if (path === '/api/lookups') return reply(lookups);
      if (path === '/api/payees') return reply({ payees: [] });
      throw new Error(`Unexpected read: ${path}`);
    }),
  );
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <PaymentPanel
          state={creating ? { mode: 'create' } : { mode: 'view', id: initial.id }}
          onClose={() => {}}
        />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return {
    writes,
    async refetch(next: ExpectedPayment) {
      current = next;
      await act(async () => {
        await client.refetchQueries({ queryKey: expectedQuery().queryKey });
      });
    },
  };
}

it('keeps the existing inclusive end read-only and explains the protected action and Undo', () => {
  show();
  fireEvent.click(screen.getByRole('button', { name: 'Bearbeiten' }));
  const dialog = within(screen.getByRole('dialog', { name: 'Zahlung bearbeiten' }));
  const input = dialog.getByLabelText('Letzte Fälligkeit einschließlich') as HTMLInputElement;
  expect(input.readOnly).toBe(true);
  expect(input.value).toBe('31.12.2026');
  expect(dialog.getByText(/Zum Ändern die Aktion „Beenden ab“/).textContent).toContain(
    'Rückgängig',
  );
});

it('leaves the inclusive end editable when creating a new payment', () => {
  show(payment(), true);
  const input = screen.getByLabelText('Letzte Fälligkeit einschließlich') as HTMLInputElement;
  expect(input.readOnly).toBe(false);
  fireEvent.change(input, { target: { value: '31.12.2026' } });
  expect(input.value).toBe('31.12.2026');
});

for (const action of [
  {
    open: 'Pausieren bis',
    title: 'Zahlung pausieren',
    label: 'Pausieren bis einschließlich',
    submit: 'Pause speichern',
    endpoint: 'pause',
    field: 'throughDate',
  },
  {
    open: 'Beenden ab',
    title: 'Zahlung beenden',
    label: 'Beenden ab',
    submit: 'Beenden bestätigen',
    endpoint: 'end',
    field: 'fromDate',
  },
] as const) {
  it(`${action.endpoint} submits the captured review token after a real query refetch and retains the date on refusal`, async () => {
    const original = payment();
    const fixture = show(original);
    fireEvent.click(screen.getByRole('button', { name: action.open }));
    const dialog = within(screen.getByRole('dialog', { name: action.title }));
    const input = dialog.getByLabelText(action.label) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '30.11.2026' } });
    await fixture.refetch({
      ...original,
      dueDay: 25,
      lifecycle: { ...original.lifecycle!, reviewToken: 'changed-token-B' },
    });
    fireEvent.click(dialog.getByRole('button', { name: action.submit }));
    await waitFor(() =>
      expect(fixture.writes).toEqual([
        {
          method: 'POST',
          path: `/api/expected/${original.id}/${action.endpoint}`,
          body: { [action.field]: '2026-11-30', reviewToken: 'reviewed-token-A' },
        },
      ]),
    );
    await screen.findByText('Zahlung wurde geändert. Bitte neu prüfen.');
    expect(input.value).toBe('30.11.2026');
    expect(screen.getByRole('dialog', { name: action.title })).toBeTruthy();
  });
}

for (const deletion of ['everAssigned', 'unavailable'] as const) {
  it(`does not offer deletion for ${deletion}`, () => {
    const original = payment();
    show({ ...original, lifecycle: { ...original.lifecycle!, deletion } });
    expect(screen.queryByRole('button', { name: 'Löschen' })).toBeNull();
    expect(screen.getByText(/der Verlauf bleibt erhalten/)).toBeTruthy();
  });
}

it('disables lifecycle writes when no trustworthy review token is available', () => {
  const original = payment();
  const { writes } = show({
    ...original,
    lifecycle: { ...original.lifecycle!, reviewToken: null },
  });
  for (const name of ['Pausieren bis', 'Beenden ab', 'Löschen']) {
    const button = screen.getByRole('button', { name }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
  }
  expect(screen.getByText(/derzeit nicht sicher prüfbar/)).toBeTruthy();
  expect(writes).toEqual([]);
});

it('a rename after background refresh cannot accidentally rewrite the old source, start or end', async () => {
  const original = payment();
  const fixture = show(original);
  fireEvent.click(screen.getByRole('button', { name: 'Bearbeiten' }));
  const dialog = within(screen.getByRole('dialog', { name: 'Zahlung bearbeiten' }));
  fireEvent.change(dialog.getByLabelText('Name'), {
    target: { value: 'Renamed synthetic payment' },
  });
  await fixture.refetch({
    ...original,
    accountId: 'other-source',
    startDate: '2026-02-01',
    endDate: '2026-11-30',
  });
  fireEvent.click(dialog.getByRole('button', { name: 'Speichern' }));
  await waitFor(() =>
    expect(fixture.writes).toEqual([
      {
        method: 'PATCH',
        path: `/api/expected/${original.id}`,
        body: { name: 'Renamed synthetic payment' },
      },
    ]),
  );
  await waitFor(() =>
    expect(screen.queryByRole('dialog', { name: 'Zahlung bearbeiten' })).toBeNull(),
  );
});
