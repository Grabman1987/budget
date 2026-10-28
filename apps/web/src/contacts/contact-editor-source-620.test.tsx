// @vitest-environment jsdom
import { createTestDatabase, type OpenedDatabase } from '@budget/db';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@budget/ui';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createLedgerApi } from '../../../server/src/api';
import { seedBasics } from '../../../../packages/db/src/repos/test-helpers';
import { LEDGER_KEY } from '../ledger/queries';
import { ContactStatementPage, ContactsPage } from './contacts-page';

vi.mock('../pages/placeholder-page', () => ({
  PageFrame: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock('@tanstack/react-router', () => ({
  useParams: () => ({ id: 'k1' }),
  useSearch: () => ({ verlauf: 1 }),
  useLocation: () => ({ pathname: '/konten/kontakte/k1', searchStr: '?verlauf=1' }),
  useNavigate: () => vi.fn(),
  useLinkProps: ({ to, search }: { to: string; search?: Record<string, string> }) => ({
    href: `${to}${search ? `?${new URLSearchParams(search)}` : ''}`,
  }),
}));
const databases: OpenedDatabase[] = [];
const clients: QueryClient[] = [];
const dialogMethods = ['showModal', 'close'].map(
  (name) => [name, Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, name)] as const,
);
beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value(this: HTMLDialogElement) { this.open = true; },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value(this: HTMLDialogElement) { this.open = false; this.dispatchEvent(new Event('close')); },
  });
});
afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
  for (const database of databases.splice(0)) database.close();
  for (const [name, descriptor] of dialogMethods) {
    if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
  }
  vi.unstubAllGlobals();
});

async function mount(page: 'list' | 'statement') {
  const opened = createTestDatabase();
  databases.push(opened);
  seedBasics(opened.db);
  const api = createLedgerApi({ db: opened.db, today: () => '2026-10-20', stepUp: async (_c, next) => next() });
  const post = (path: string, body: unknown) => api.request(path, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const created = await post('/bookings', {
    accountId: 'giro', date: '2026-09-01', amountCents: -3000,
    splits: [{ categoryId: 'auslagen', contactId: 'k1', amountCents: -3000, memo: 'Ältere offene Auslage' }],
  });
  expect(created.status).toBe(201);
  const older = (await created.json()).bookings[0];
  const settled = await post('/contacts/k1/settlements', { accountId: 'giro', date: '2026-09-02', amountCents: 1000 });
  expect(settled.ok).toBe(true);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  clients.push(client);
  let blocked = false;
  let release!: (response: Response) => void;
  const refusals: Array<{ status: number; message: string }> = [];
  vi.stubGlobal('fetch', vi.fn(async (path: string, init?: RequestInit) => {
    if (blocked && (path === '/api/contacts/k1' || path.startsWith('/api/contacts?history=')))
      return new Promise<Response>((done) => { release = done; });
    const response = await api.request(path.replace(/^\/api/, ''), init);
    if (init?.method === 'PATCH' && path === `/api/bookings/${older.id}`)
      refusals.push({ status: response.status, message: (await response.clone().json()).message });
    return response;
  }));
  const rendered = render(<QueryClientProvider client={client}><ToastProvider>{page === 'list' ? <ContactsPage /> : <ContactStatementPage />}</ToastProvider></QueryClientProvider>);
  await screen.findByRole('button', { name: 'Freund umbenennen' });
  return { ...rendered, api, older, client, refusals,
    block: () => { blocked = true; },
    release: (response: Response) => { blocked = false; release(response); },
    key: [...LEDGER_KEY, page === 'list' ? 'contacts' : 'contact', page === 'list' ? true : 'k1'],
  };
}

it('retains the real booking draft and localized allocation refusal while refreshed statement money is withheld', async () => {
  const view = await mount('statement');
  const original = (await (await view.api.request(`/bookings/${view.older.id}`)).json()).booking;
  fireEvent.click(screen.getByRole('button', { name: /Ursprungsbuchung öffnen.*Ältere offene Auslage/ }));
  const dialog = await screen.findByRole('dialog', { name: 'Buchung bearbeiten' });
  const category = await within(dialog).findByRole('combobox', { name: 'Kategorie' });
  const user = userEvent.setup();
  await user.clear(category);
  await user.type(category, 'Reise');
  await user.click(await within(dialog).findByRole('option', { name: /Reise/ }));
  category.focus();
  view.block();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Speichern' }));
  await waitFor(() => expect(view.refusals).toEqual([{
    status: 422,
    message: 'Undo the related contact settlement before changing its receipt or allocated outlay',
  }]));
  const refusal = 'Diese Buchung ist bereits einer Rückzahlung zugeordnet. Mache zuerst die zugehörige Rückzahlung rückgängig, bevor du Betrag oder Zuordnung änderst.';
  await waitFor(() => expect(view.container.querySelector('.contacts-balance')).toBeNull());
  expect(view.container.querySelector('.contact-movements')).toBeNull();
  await waitFor(() => expect(within(dialog).getByRole('alert').textContent).toBe(refusal));
  expect(within(dialog).getByRole('combobox', { name: 'Kategorie' })).toBe(category);
  expect((category as HTMLInputElement).value).toBe('Reise');
  expect(document.activeElement).toBe(category);
  await act(async () => { view.release(new Response(JSON.stringify({ error: 'unavailable', message: 'Synthetische Lesepause' }), { status: 503 })); });
  await screen.findByRole('button', { name: 'Erneut versuchen' });
  expect(view.container.querySelector('.contacts-balance')).toBeNull();
  expect(within(dialog).getByRole('alert').textContent).toBe(refusal);
  fireEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
  await waitFor(() => expect(view.container.querySelector('.contacts-balance')?.textContent).toBe('Schuldet dir 20,00 €'));
  expect(within(dialog).getByRole('combobox', { name: 'Kategorie' })).toBe(category);
  expect((category as HTMLInputElement).value).toBe('Reise');
  expect(within(dialog).getByRole('alert').textContent).toBe(refusal);
  expect((await (await view.api.request(`/bookings/${view.older.id}`)).json()).booking).toEqual(original);
});

it.each(['list', 'statement'] as const)('keeps the %s rename dialog draft and focus across pending and failed reads', async (page) => {
  const view = await mount(page);
  fireEvent.click(screen.getByRole('button', { name: 'Freund umbenennen' }));
  const dialog = await screen.findByRole('dialog', { name: 'Kontakt umbenennen' });
  const input = within(dialog).getByRole('textbox', { name: 'Name' });
  fireEvent.change(input, { target: { value: 'Freund Entwurf' } });
  input.focus();
  view.block();
  act(() => { void view.client.invalidateQueries({ queryKey: view.key }); });
  await waitFor(() => expect(view.container.querySelector('table.contacts-table')).toBeNull());
  expect(view.container.querySelector('.contacts-balance')).toBeNull();
  expect(within(dialog).getByRole('textbox', { name: 'Name' })).toBe(input);
  expect((input as HTMLInputElement).value).toBe('Freund Entwurf');
  expect(document.activeElement).toBe(input);
  await act(async () => { view.release(new Response(JSON.stringify({ error: 'unavailable', message: 'Synthetische Lesepause' }), { status: 503 })); });
  await screen.findByRole('button', { name: 'Erneut versuchen' });
  expect(view.container.querySelector('table.contacts-table')).toBeNull();
  expect(within(dialog).getByRole('textbox', { name: 'Name' })).toBe(input);
  expect((input as HTMLInputElement).value).toBe('Freund Entwurf');
  expect(document.activeElement).toBe(input);
});
