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
  let blocked: ((path: string) => boolean) | undefined;
  let release!: (response: Response) => void;
  const refusals: Array<{ status: number; message: string }> = [];
  const writes: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (path: string, init?: RequestInit) => {
    if (init?.method && init.method !== 'GET') writes.push(`${init.method} ${path}`);
    if (blocked?.(path))
      return new Promise<Response>((done) => { release = done; });
    const response = await api.request(path.replace(/^\/api/, ''), init);
    if (init?.method === 'PATCH' && path === `/api/bookings/${older.id}`)
      refusals.push({ status: response.status, message: (await response.clone().json()).message });
    return response;
  }));
  const rendered = render(<QueryClientProvider client={client}><ToastProvider>{page === 'list' ? <ContactsPage /> : <ContactStatementPage />}</ToastProvider></QueryClientProvider>);
  await screen.findByRole('button', { name: 'Freund umbenennen' });
  return { ...rendered, api, older, client, refusals, writes,
    block: (match = (path: string) => path === '/api/contacts/k1' || path.startsWith('/api/contacts?history=')) => { blocked = match; },
    release: (response: Response) => { blocked = undefined; release(response); },
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

it.each(['parent', 'target', 'accounts'] as const)('retains receipt inputs but withholds source previews and submission through %s read failure and recovery', async (source) => {
  const view = await mount('statement');
  fireEvent.click(screen.getByRole('button', { name: 'Rückzahlung buchen' }));
  const receipt = view.container.querySelector<HTMLFormElement>('.contacts-receipt')!;
  fireEvent.change(within(receipt).getByLabelText('Datum'), { target: { value: '2026-10-20' } });
  const amount = within(receipt).getByRole('textbox', { name: 'Rückzahlung' });
  fireEvent.change(amount, { target: { value: '10,00' } });
  const allocation = await within(receipt).findByRole('textbox', { name: /Auslage 1.*offen 20,00/ });
  fireEvent.change(allocation, { target: { value: '10,00' } });
  allocation.focus();
  const save = within(receipt).getByRole('button', { name: 'Rückzahlung speichern' });
  await waitFor(() => expect((save as HTMLButtonElement).disabled).toBe(false));
  expect(receipt.textContent).toContain('Guthaben aus dieser Rückzahlung:');
  const key = source === 'parent' ? view.key : source === 'target' ? [...LEDGER_KEY, 'contact', 'k1', '2026-10-20'] : [...LEDGER_KEY, 'accounts'];
  view.block(source === 'parent' ? undefined : source === 'target' ? (path) => path === '/api/contacts/k1?asOf=2026-10-20' : (path) => path === '/api/accounts');
  act(() => { void view.client.invalidateQueries({ queryKey: key, exact: true }); });
  await waitFor(() => expect((save as HTMLButtonElement).disabled).toBe(true));
  expect(receipt.textContent).not.toContain('offen 20,00');
  expect(receipt.textContent).not.toContain('Guthaben aus dieser Rückzahlung:');
  expect(receipt.contains(allocation)).toBe(true);
  expect((allocation as HTMLInputElement).value).toBe('10,00');
  expect(document.activeElement).toBe(allocation);
  fireEvent.submit(receipt);
  expect(view.writes).toEqual([]);
  await act(async () => { view.release(new Response(JSON.stringify({ error: 'unavailable' }), { status: 503 })); });
  await waitFor(() => expect(view.client.getQueryState(key)?.status).toBe('error'));
  expect((save as HTMLButtonElement).disabled).toBe(true);
  expect(receipt.textContent).not.toContain('offen 20,00');
  expect(receipt.textContent).not.toContain('Guthaben aus dieser Rückzahlung:');
  fireEvent.submit(receipt);
  expect(view.writes).toEqual([]);
  await act(async () => { await view.client.refetchQueries({ queryKey: key, exact: true }); });
  await waitFor(() => expect((save as HTMLButtonElement).disabled).toBe(false));
  expect(receipt.contains(allocation)).toBe(true);
  expect((allocation as HTMLInputElement).value).toBe('10,00');
  expect((amount as HTMLInputElement).value).toBe('10,00');
  expect(document.activeElement).toBe(allocation);
  fireEvent.click(save);
  await screen.findByRole('button', { name: 'Rückgängig' });
  expect((await (await view.api.request('/contacts/k1')).json()).balanceCents).toBe(1000);
  fireEvent.click(screen.getByRole('button', { name: 'Rückgängig' }));
  await waitFor(async () => expect((await (await view.api.request('/contacts/k1')).json()).balanceCents).toBe(2000));
  expect(view.writes).toEqual(['POST /api/contacts/k1/settlements', 'POST /api/undo']);
});

it.each([['list', 'parent'], ['statement', 'parent'], ['statement', 'accounts'], ['statement', 'lookups']] as const)('keeps %s write-off draft but withholds stale maximum/remaining and Save through %s read failure', async (page, source) => {
  const view = await mount(page);
  fireEvent.click(screen.getByRole('button', { name: 'Weitere Aktionen: Freund' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Ausgleichen ohne Geldbewegung' }));
  const dialog = await screen.findByRole('dialog', { name: 'Kontakt ausgleichen' });
  const amount = within(dialog).getByLabelText('Betrag');
  fireEvent.change(amount, { target: { value: '5,00' } });
  fireEvent.change(within(dialog).getByLabelText('Datum'), { target: { value: '20.10.2026' } });
  const category = within(dialog).getByRole('combobox', { name: 'Kategorie' });
  await within(dialog).findByRole('option', { name: 'Reise' });
  fireEvent.change(category, { target: { value: 'reise' } });
  const note = within(dialog).getByRole('textbox', { name: 'Notiz' });
  fireEvent.change(note, { target: { value: 'Bereiter Entwurf' } });
  note.focus();
  const save = within(dialog).getByRole('button', { name: 'Ausgleich speichern' });
  await waitFor(() => expect((save as HTMLButtonElement).disabled).toBe(false));
  expect(dialog.textContent).toContain('15,00 €');
  fireEvent.change(amount, { target: { value: '25,00' } });
  expect(dialog.textContent).toContain('höchstens 20,00 €');
  const key = source === 'parent' ? view.key : source === 'accounts' ? [...LEDGER_KEY, 'accounts'] : ['ledger-lookups'];
  view.block(source === 'parent' ? undefined : source === 'accounts' ? (path) => path === '/api/accounts' : (path) => path.startsWith('/api/lookups'));
  act(() => { void view.client.invalidateQueries({ queryKey: key, exact: true }); });
  await waitFor(() => expect((save as HTMLButtonElement).disabled).toBe(true));
  expect(dialog.textContent).not.toContain('15,00 €');
  expect(dialog.textContent).not.toContain('werden als Ausgabe gebucht');
  expect(dialog.textContent).not.toContain('höchstens 20,00 €');
  expect(within(dialog).getByLabelText('Betrag')).toBe(amount);
  expect((amount as HTMLInputElement).value).toBe('25,00');
  expect((category as HTMLSelectElement).value).toBe('reise');
  expect(document.activeElement).toBe(note);
  fireEvent.submit(dialog.querySelector('form')!);
  expect(view.writes).toEqual([]);
  await act(async () => { view.release(new Response(JSON.stringify({ error: 'unavailable' }), { status: 503 })); });
  await waitFor(() => expect(view.client.getQueryState(key)?.status).toBe('error'));
  expect((save as HTMLButtonElement).disabled).toBe(true);
  expect(dialog.textContent).not.toContain('15,00 €');
  expect(dialog.textContent).not.toContain('höchstens 20,00 €');
  fireEvent.submit(dialog.querySelector('form')!);
  expect(view.writes).toEqual([]);
  await act(async () => { await view.client.refetchQueries({ queryKey: key, exact: true }); });
  await waitFor(() => expect(dialog.textContent).toContain('höchstens 20,00 €'));
  expect(within(dialog).getByLabelText('Betrag')).toBe(amount);
  expect((amount as HTMLInputElement).value).toBe('25,00');
  expect((note as HTMLInputElement).value).toBe('Bereiter Entwurf');
  expect((category as HTMLSelectElement).value).toBe('reise');
  expect(document.activeElement).toBe(note);
  fireEvent.change(amount, { target: { value: '5,00' } });
  await waitFor(() => expect((save as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(save);
  await screen.findByRole('button', { name: 'Rückgängig' });
  expect((await (await view.api.request('/contacts/k1')).json()).balanceCents).toBe(1500);
  fireEvent.click(screen.getByRole('button', { name: 'Rückgängig' }));
  await waitFor(async () => expect((await (await view.api.request('/contacts/k1')).json()).balanceCents).toBe(2000));
  expect(view.writes).toEqual(['POST /api/contacts/k1/write-offs', 'POST /api/undo']);
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
