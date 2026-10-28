// @vitest-environment jsdom
import { createTestDatabase, createGoal, setAssigned, schema, type OpenedDatabase } from '@budget/db';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@budget/ui';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createLedgerApi } from '../../../server/src/api';
import { seedBasics, testCtx } from '../../../../packages/db/src/repos/test-helpers';
import { goalsProgressReportQuery } from '../pages/goals-progress-report';
import { GoalsPage } from './goals-page';

vi.mock('../pages/placeholder-page', () => ({ PageFrame: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
vi.mock('@tanstack/react-router', () => ({
  useSearch: () => ({ monat: '2026-09' }), useNavigate: () => vi.fn(),
  useLinkProps: ({ to, search }: { to: string; search?: Record<string, string> }) => ({ href: `${to}${search ? `?${new URLSearchParams(search)}` : ''}` }),
}));
const clients: QueryClient[] = [];
const databases: OpenedDatabase[] = [];
const dialogMethods = ['showModal', 'close'].map((name) => [name, Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, name)] as const);
beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value(this: HTMLDialogElement) { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value(this: HTMLDialogElement) { this.open = false; this.dispatchEvent(new Event('close')); } });
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

function mount(mode: 'valid' | 'duplicate' | 'mixed' | 'missing' | 'foreign' = 'valid') {
  const opened = createTestDatabase();
  databases.push(opened);
  seedBasics(opened.db);
  createGoal(opened.db, { name: 'Reiseziel A', targetCents: 300000, targetDate: '2027-07-31', categoryId: 'reise' }, testCtx, '2026-06', '2026-06-01');
  setAssigned(opened.db, 'reise', '2026-06', 10000, testCtx);
  for (const month of ['2026-07', '2026-08', '2026-09']) setAssigned(opened.db, 'reise', month, 25000, testCtx);
  if (mode === 'duplicate' || mode === 'mixed') createGoal(opened.db, { name: 'Reiseziel B', targetCents: 300000, categoryId: 'reise' }, testCtx, '2026-06', '2026-06-01');
  if (mode === 'mixed') {
    createGoal(opened.db, { name: 'Belegtes Ziel', targetCents: 100000, categoryId: 'miete' }, testCtx, '2026-06', '2026-06-01');
    setAssigned(opened.db, 'miete', '2026-09', 10000, testCtx);
  }
  if (mode === 'foreign') {
    opened.sqlite.prepare('UPDATE savings_goal SET category_id = NULL, account_id = ?').run('usd');
  }
  const app = createLedgerApi({ db: opened.db, today: () => '2026-09-17', stepUp: async (_c, next) => next() });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  clients.push(client);
  let release: ((response: Response) => void) | undefined;
  let blocked = false;
  const fetcher = vi.fn(async (path: string, init?: RequestInit) => {
    expect(init?.method ?? 'GET').toBe('GET');
    const response = await app.request(path.replace(/^\/api/, ''), init);
    if (mode === 'missing' && path === '/api/categories') {
      const data = await response.json();
      return Response.json({ ...data, categories: data.categories.filter((row: { id: string }) => row.id !== 'reise') });
    }
    if (blocked && path.startsWith('/api/accounts?asOf=')) return new Promise<Response>((done) => { release = done; });
    return response;
  });
  vi.stubGlobal('fetch', fetcher);
  const rendered = render(<QueryClientProvider client={client}><ToastProvider><GoalsPage /></ToastProvider></QueryClientProvider>);
  return { client, opened, fetcher, ...rendered, block: () => { blocked = true; }, settle: (response: Response) => { blocked = false; release!(response); } };
}

it.each(['duplicate', 'missing', 'foreign'] as const)('withholds unproven %s source money on the actual Plan list', async (mode) => {
  const { container, opened } = mount(mode);
  await screen.findByRole('link', { name: 'Reiseziel A', exact: true });
  const rows = container.querySelectorAll('[data-goal-unknown]');
  expect(rows).toHaveLength(mode === 'duplicate' ? 2 : 1);
  expect(container.querySelector('.goals-summary')?.textContent).toContain('Keine eindeutig belegten Zielstände');
  expect(container.querySelector('.ptable-wrap')?.textContent).not.toContain('850,00');
  expect(container.querySelector('.ptable-wrap')?.textContent).not.toContain('1.700,00');
  expect(container.querySelector('.ptable-wrap')?.textContent).not.toContain('€');
  expect(container.querySelector('.goal-line, .pbar, .goal-future-projection')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Rate zuweisen', exact: true })).toBeNull();
  expect(screen.getByRole('link', { name: 'Reiseziel A', exact: true }).getAttribute('href')).toMatch(/^\/plan\/sparziele\/.*\?monat=2026-09$/);
  expect(rows[0]?.textContent).toContain(mode === 'duplicate' ? 'Mehrere Sparziele' : mode === 'missing' ? 'fehlt oder wurde gelöscht' : 'nicht als EUR belegt');
  expect(opened.db.select().from(schema.savingsGoal).all()).toHaveLength(mode === 'duplicate' ? 2 : 1);
});

it('counts only a proven source in mixed list totals while retaining both uncertain goals', async () => {
  const { container } = mount('mixed');
  await screen.findByRole('link', { name: 'Belegtes Ziel', exact: true });
  expect(container.querySelectorAll('[data-goal-unknown]')).toHaveLength(2);
  expect(screen.getByTestId('goals-summary').textContent).toBe('1 von 1 im Plan · 2 ungeklärt');
  expect(container.querySelector('.pgroup .col-saved')?.textContent).toBe('100,00 €');
  expect(container.querySelector('.ptable-wrap')?.textContent).not.toContain('1.800,00');
  expect(container.querySelector('.ptable-wrap')?.textContent).not.toContain('850,00');
});

it('retains a real goal editor draft while required metadata refresh, failure and retry hide cached money', async () => {
  const { container, client, block, settle } = mount();
  await waitFor(() => expect(container.querySelector('.col-saved')?.textContent).toContain('850,00'));
  const create = screen.getByRole('button', { name: 'Neues Sparziel', exact: true });
  fireEvent.click(create);
  const input = screen.getByRole('textbox', { name: 'Name', exact: true });
  fireEvent.change(input, { target: { value: 'Entwurf bleibt' } });
  block();
  act(() => { void client.invalidateQueries({ queryKey: goalsProgressReportQuery('2026-09').queryKey }); });
  await waitFor(() => expect(container.querySelector('.ptable-wrap')).toBeNull());
  expect(screen.queryByTestId('goals-summary')).toBeNull();
  expect(screen.getByRole('textbox', { name: 'Name', exact: true })).toBe(input);
  expect((input as HTMLInputElement).value).toBe('Entwurf bleibt');
  await act(async () => { settle(new Response(JSON.stringify({ error: 'unavailable' }), { status: 503 })); });
  await screen.findByRole('alert');
  expect(container.querySelector('.ptable-wrap')).toBeNull();
  expect((input as HTMLInputElement).value).toBe('Entwurf bleibt');
  // A metadata retry can complete while the real modal stays open; no background click is invented.
  await act(async () => { await client.refetchQueries({ queryKey: goalsProgressReportQuery('2026-09').queryKey }); });
  await waitFor(() => expect(container.querySelector('.col-saved')?.textContent).toContain('850,00'));
  expect(screen.getByRole('textbox', { name: 'Name', exact: true })).toBe(input);
  expect((input as HTMLInputElement).value).toBe('Entwurf bleibt');
});
