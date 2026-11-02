// @vitest-environment jsdom
import { createTestDatabase, schema, type OpenedDatabase } from '@budget/db';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { ToastProvider } from '@budget/ui';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createLedgerApi } from '../../../server/src/api';
import { seedBasics } from '../../../../packages/db/src/repos/test-helpers';
import { ContactSettingsPage } from './contact-settings';

vi.mock('../shell/redesign-flag', () => ({ REDESIGN_ENABLED: true }));
const databases: OpenedDatabase[] = [];
const clients: QueryClient[] = [];
const descriptors = ['showModal', 'close'].map(
  (name) => [name, Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, name)] as const,
);
beforeEach(() => {
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
      this.dispatchEvent(new Event('close'));
    },
  });
});
afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
  for (const database of databases.splice(0)) database.close();
  for (const [name, descriptor] of descriptors) {
    if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
  }
  vi.unstubAllGlobals();
});

async function mount({ empty = false, failRead = false } = {}) {
  const opened = createTestDatabase();
  databases.push(opened);
  if (!empty) seedBasics(opened.db);
  const api = createLedgerApi({
    db: opened.db,
    today: () => '2026-10-15',
    stepUp: async (_c, next) => next(),
  });
  const call = (path: string, method = 'GET', data?: unknown) =>
    api.request(path, {
      method,
      ...(data === undefined
        ? {}
        : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) }),
    });
  let bookingId: string | undefined;
  if (!empty) {
    expect((await call('/contacts', 'POST', { name: 'Synthetic zero' })).status).toBe(201);
    const booking = await call('/bookings', 'POST', {
      type: 'booking',
      accountId: 'giro',
      date: '2026-09-01',
      amountCents: -2300,
      splits: [{ categoryId: 'auslagen', contactId: 'k1', amountCents: -2300 }],
    });
    expect(booking.status).toBe(201);
    bookingId = ((await booking.json()) as { bookings: { id: string }[] }).bookings[0]!.id;
    expect(
      (
        await call('/contacts/k1/settlements', 'POST', {
          accountId: 'giro',
          date: '2026-09-02',
          amountCents: 2300,
        })
      ).ok,
    ).toBe(true);
    expect(await (await call('/contacts?history=0')).json()).toEqual({
      asOf: '2026-10-15',
      currency: 'EUR',
      contacts: [],
      totals: { balanceCents: 0, payableCents: 0, receivableCents: 0 },
    });
  }
  const writes: string[] = [];
  const reads: string[] = [];
  let readFailure = failRead;
  let rejectWrite = false;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (method === 'GET') reads.push(path);
      if (method !== 'GET') writes.push(`${method} ${path}`);
      if ((readFailure && path === '/api/lookups') || (rejectWrite && method === 'PATCH')) {
        return Response.json({ error: 'server_error' }, { status: 503 });
      }
      return api.request(path.replace(/^\/api/, ''), init);
    }),
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  clients.push(client);
  const root = createRootRoute({ validateSearch: (search: Record<string, unknown>) => search });
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({
        getParentRoute: () => root,
        path: '/einstellungen/kontakte',
        component: ContactSettingsPage,
      }),
      createRoute({
        getParentRoute: () => root,
        path: '/konten/kontakte/$id',
        component: () => <h1>Synthetic existing history destination</h1>,
      }),
      createRoute({
        getParentRoute: () => root,
        path: '/konten/kontakte',
        component: () => <h1>Synthetic existing contact overview</h1>,
      }),
      createRoute({
        getParentRoute: () => root,
        path: '/einstellungen',
        component: () => <h1>Synthetic Settings index</h1>,
      }),
    ]),
    history: createMemoryHistory({
      initialEntries: ['/einstellungen/kontakte?monat=2026-10&period=month#synthetic-source'],
    }),
  });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return {
    api,
    call,
    opened,
    router,
    writes,
    reads,
    bookingId,
    recover: () => {
      readFailure = false;
    },
    reject: (value: boolean) => {
      rejectWrite = value;
    },
  };
}

it('marks only the new Contacts entry current on its actual query/hash bookmark', async () => {
  await mount();
  await screen.findByRole('button', { name: 'Freund umbenennen' });
  const navigation = screen.getByRole('navigation', { name: 'Einstellungen' });
  const current = within(navigation)
    .getAllByRole('link')
    .filter((link) => link.getAttribute('aria-current') === 'page');
  expect(current).toHaveLength(1);
  expect(current[0]).toBe(within(navigation).getByRole('link', { name: /^Kontakte$/ }));
});

it('shows zero and retained contact identities without financial report reads; opening/cancelling keeps bookings, audit and source history intact', async () => {
  const view = await mount();
  const before = await (await view.call(`/bookings/${view.bookingId}`)).json();
  const audit = view.opened.db.select().from(schema.auditLog).all().length;
  await screen.findByRole('button', { name: 'Freund umbenennen' });
  expect(screen.getByText('Synthetic zero', { exact: true })).toBeTruthy();
  expect(screen.getByText('k1', { exact: true })).toBeTruthy();
  expect(screen.queryByRole('columnheader', { name: 'Saldo' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Freund umbenennen' }));
  const dialog = (await screen.findByRole('dialog', {
    name: 'Kontakt umbenennen',
  })) as HTMLDialogElement;
  await userEvent.setup().type(within(dialog).getByRole('textbox', { name: 'Name' }), ' unsaved');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Abbrechen' }));
  await waitFor(() => expect(dialog.open).toBe(false));
  expect(view.writes).toEqual([]);
  expect(view.reads.filter((path) => path.startsWith('/api/contacts'))).toEqual([]);
  expect(view.opened.db.select().from(schema.auditLog).all()).toHaveLength(audit);
  expect(await (await view.call(`/bookings/${view.bookingId}`)).json()).toEqual(before);
  fireEvent.click(screen.getByRole('link', { name: 'Verlauf öffnen Freund' }));
  await screen.findByRole('heading', { name: 'Synthetic existing history destination' });
  expect(view.router.state.location.search).toMatchObject({
    monat: '2026-10',
    period: 'month',
    verlauf: 1,
  });
  view.router.history.back();
  await screen.findByRole('button', { name: 'Freund umbenennen' });
  expect(view.router.state.location.hash).toBe('synthetic-source');
});

it('reuses trimmed create/name writes and audited Undo while preserving existing booking identity, cents, status and history', async () => {
  const view = await mount();
  const before = await (await view.call(`/bookings/${view.bookingId}`)).json();
  fireEvent.click(await screen.findByRole('button', { name: 'Neuer Kontakt' }));
  const create = await screen.findByRole('dialog', { name: 'Neuer Kontakt' });
  await userEvent
    .setup()
    .type(within(create).getByRole('textbox', { name: 'Name' }), '  Synthetic created  ');
  fireEvent.click(within(create).getByRole('button', { name: 'Kontakt anlegen' }));
  await screen.findByRole('button', { name: 'Synthetic created umbenennen' });
  expect(view.writes).toEqual(['POST /api/contacts']);
  fireEvent.click(screen.getByRole('button', { name: 'Freund umbenennen' }));
  const rename = await screen.findByRole('dialog', { name: 'Kontakt umbenennen' });
  const name = within(rename).getByRole('textbox', { name: 'Name' });
  fireEvent.change(name, { target: { value: '  Synthetic renamed  ' } });
  fireEvent.click(within(rename).getByRole('button', { name: 'Speichern' }));
  await screen.findByRole('button', { name: 'Synthetic renamed umbenennen' });
  expect(view.writes).toEqual(['POST /api/contacts', 'PATCH /api/contacts/k1']);
  expect(await (await view.call(`/bookings/${view.bookingId}`)).json()).toEqual(before);
  const toast = screen.getByText('Kontakt umbenannt.').closest('.toast')!;
  fireEvent.click(within(toast as HTMLElement).getByRole('button', { name: 'Rückgängig' }));
  await screen.findByRole('button', { name: 'Freund umbenennen' });
  expect(view.writes.at(-1)).toBe('POST /api/undo');
  expect(await (await view.call(`/bookings/${view.bookingId}`)).json()).toEqual(before);
});

it('distinguishes empty from failed metadata, offers existing retry, and retains a rejected rename draft', async () => {
  const empty = await mount({ empty: true, failRead: true });
  await screen.findByText(/Auf dem Server ist ein Fehler aufgetreten/);
  expect(screen.queryByText('Noch keine Kontakte angelegt.')).toBeNull();
  empty.recover();
  fireEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
  await screen.findByText('Noch keine Kontakte angelegt.');
  expect(empty.writes).toEqual([]);
  cleanup();
  const view = await mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Freund umbenennen' }));
  const dialog = (await screen.findByRole('dialog', {
    name: 'Kontakt umbenennen',
  })) as HTMLDialogElement;
  const input = within(dialog).getByRole('textbox', { name: 'Name' });
  fireEvent.change(input, { target: { value: 'Synthetic kept draft' } });
  view.reject(true);
  fireEvent.click(within(dialog).getByRole('button', { name: 'Speichern' }));
  await screen.findByText(/Auf dem Server ist ein Fehler aufgetreten/);
  expect((input as HTMLInputElement).value).toBe('Synthetic kept draft');
  expect(dialog.open).toBe(true);
  view.reject(false);
  fireEvent.click(within(dialog).getByRole('button', { name: 'Speichern' }));
  await screen.findByRole('button', { name: 'Synthetic kept draft umbenennen' });
});
