// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setAmountsHidden, ToastProvider } from '@budget/ui';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ContactStatementPage, ContactsPage } from './contacts-page';

let searchStr = '?verlauf=1';
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useSearch: () => ({}),
  useParams: () => ({ id: 'synthetic-contact' }),
  useLocation: () => ({ pathname: '/konten/kontakte', searchStr }),
  useLinkProps: ({
    to,
    search,
    activeOptions: _activeOptions,
    ...props
  }: {
    to: string;
    search?: Record<string, string>;
    activeOptions?: unknown;
  }) => {
    void _activeOptions;
    return { href: `${to}${search ? `?${new URLSearchParams(search)}` : ''}`, ...props };
  },
}));
afterEach(() => {
  setAmountsHidden(false);
  searchStr = '?verlauf=1';
});
beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
});

const wrap = (node: React.ReactNode) => (
  <QueryClientProvider client={new QueryClient()}>
    <ToastProvider>{node}</ToastProvider>
  </QueryClientProvider>
);
const stubContacts = (contacts: unknown[]) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ contacts }))),
  );
const MIXED = [
  { id: 'plus', name: 'Kontakt Plus', balanceCents: 4500, creditCents: 0 },
  { id: 'minus', name: 'Kontakt Minus', balanceCents: -1200, creditCents: 1200 },
  { id: 'zero', name: 'Kontakt Null', balanceCents: 0, creditCents: 0 },
];

it('shows the balance in words and role colour per sign, without a minus sign', async () => {
  stubContacts(MIXED);
  render(wrap(<ContactsPage />));
  const plus = await screen.findByRole('link', { name: /Saldo Kontakt Plus/ }, { timeout: 10000 });
  expect(plus.textContent).toBe('Schuldet dir 45,00 €');
  expect(plus.classList.contains('is-plus')).toBe(true);
  const minus = screen.getByRole('link', { name: /Saldo Kontakt Minus/ });
  expect(minus.textContent).toBe('Du schuldest 12,00 €');
  expect(minus.classList.contains('is-minus')).toBe(true);
  const zero = screen.getByRole('link', { name: /Saldo Kontakt Null/ });
  expect(zero.textContent).toBe('Ausgeglichen');
  expect(zero.classList.contains('is-zero')).toBe(true);
  expect(screen.getByRole('table').textContent).not.toContain('−');
});

it('opens the same detail from the balance as from the name', async () => {
  stubContacts(MIXED);
  render(wrap(<ContactsPage />));
  const name = await screen.findByRole('link', { name: 'Kontakt Plus' }, { timeout: 10000 });
  const balance = screen.getByRole('link', { name: /Saldo Kontakt Plus/ });
  expect(balance.getAttribute('href')).toBe(name.getAttribute('href'));
  expect(name.getAttribute('href')).toBe('/konten/kontakte/plus?verlauf=1');
});

it('offers the settle action only in the ⋯ menu and not for a settled contact', async () => {
  stubContacts(MIXED);
  render(wrap(<ContactsPage />));
  await screen.findByRole('link', { name: 'Kontakt Plus' }, { timeout: 10000 });
  expect(screen.queryByRole('button', { name: 'Ausgleichen' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Weitere Aktionen: Kontakt Plus' })).toBeDefined();
  expect(screen.getByRole('button', { name: 'Weitere Aktionen: Kontakt Minus' })).toBeDefined();
  expect(screen.queryByRole('button', { name: 'Weitere Aktionen: Kontakt Null' })).toBeNull();
  const trigger = screen.getByRole('button', { name: 'Weitere Aktionen: Kontakt Plus' });
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
  await userEvent.click(trigger);
  expect(trigger.getAttribute('aria-expanded')).toBe('true');
  const menu = screen.getByRole('menu', { name: 'Aktionen: Kontakt Plus' });
  expect(
    within(menu).getByRole('menuitem', { name: 'Ausgleichen ohne Geldbewegung' }),
  ).toBeDefined();
  await userEvent.keyboard('{Escape}');
  expect(screen.queryByRole('menu')).toBeNull();
  expect(document.activeElement).toBe(trigger);
});

it('switches between open contacts and all contacts', async () => {
  searchStr = '';
  stubContacts([MIXED[0]]);
  render(wrap(<ContactsPage />));
  await screen.findByRole('link', { name: 'Kontakt Plus' }, { timeout: 10000 });
  const group = screen.getByRole('group', { name: 'Kontakte anzeigen' });
  expect(within(group).getByRole('button', { name: 'Offen' }).getAttribute('aria-pressed')).toBe(
    'true',
  );
  expect(within(group).getByRole('button', { name: 'Alle' }).getAttribute('aria-pressed')).toBe(
    'false',
  );
  expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe('/api/contacts?history=0');
});

it('asks for all contacts when the Alle switch is set', async () => {
  stubContacts(MIXED);
  render(wrap(<ContactsPage />));
  await screen.findByRole('link', { name: 'Kontakt Null' }, { timeout: 10000 });
  const group = screen.getByRole('group', { name: 'Kontakte anzeigen' });
  expect(within(group).getByRole('button', { name: 'Alle' }).getAttribute('aria-pressed')).toBe(
    'true',
  );
  expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe('/api/contacts?history=1');
});

const statement = (balanceCents: number) => ({
  contact: { id: 'synthetic-contact', name: 'Kontakt Muster' },
  asOf: '2026-10-15',
  balanceCents,
  creditCents: 0,
  movements: [
    { splitId: 'outlay', bookingId: 'b1', date: '2026-10-01', amountCents: -3000, memo: null },
    { splitId: 'receipt', bookingId: 'b2', date: '2026-10-02', amountCents: 1000, memo: null },
  ],
  outlays: [{ splitId: 'outlay', date: '2026-10-01', memo: null, remainingCents: 2000 }],
  receipts: [
    {
      receiptSplitId: 'receipt',
      allocations: [{ outlaySplitId: 'outlay', amountCents: 1000 }],
      creditCents: 0,
      recorded: true,
    },
  ],
  closedThroughSplitId: null,
});
const stubStatement = (balanceCents: number) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(statement(balanceCents)))),
  );

it.each([
  [2000, 'Schuldet dir 20,00 €', 'is-plus'],
  [-2000, 'Du schuldest 20,00 €', 'is-minus'],
  [0, 'Ausgeglichen 0,00 €', 'is-zero'],
])('detail balance %i reads "%s" with role class %s', async (balance, text, tone) => {
  stubStatement(balance);
  render(wrap(<ContactStatementPage />));
  await screen.findByRole('heading', { name: 'Kontakt Muster' }, { timeout: 10000 });
  const line = document.querySelector('.contacts-balance') as HTMLElement;
  expect(line.textContent).toBe(text);
  expect(line.classList.contains(tone)).toBe(true);
});

it('detail has one title, one back route, the explanation behind the info button and Ausgleichen in the menu', async () => {
  stubStatement(2000);
  render(wrap(<ContactStatementPage />));
  await screen.findByRole('heading', { name: 'Kontakt Muster' }, { timeout: 10000 });
  expect(screen.getAllByRole('heading', { name: 'Kontakt Muster' })).toHaveLength(1);
  expect(screen.getAllByRole('link', { name: /^Zurück/ })).toHaveLength(1);
  expect(screen.queryByText(/Ein Ausgleich übernimmt Guthaben/)).toBeNull();
  const info = screen.getByRole('button', { name: 'Erläuterung zu Rückzahlung und Ausgleich' });
  await userEvent.click(info);
  expect(screen.getByText(/Ein Ausgleich übernimmt Guthaben/)).toBeDefined();
  expect(screen.queryByRole('button', { name: 'Ausgleichen' })).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Weitere Aktionen: Kontakt Muster' }));
  expect(screen.getByRole('menuitem', { name: 'Ausgleichen ohne Geldbewegung' })).toBeDefined();
});

it('detail offers no settle action at a zero balance', async () => {
  stubStatement(0);
  render(wrap(<ContactStatementPage />));
  await screen.findByRole('heading', { name: 'Kontakt Muster' }, { timeout: 10000 });
  expect(screen.queryByRole('button', { name: /Weitere Aktionen/ })).toBeNull();
  expect(screen.queryByRole('button', { name: /Ausgleichen/ })).toBeNull();
});

it('detail history is in the receivable view: Auslage plus, Rückzahlung minus', async () => {
  stubStatement(2000);
  render(wrap(<ContactStatementPage />));
  const table = await screen.findByRole(
    'table',
    { name: 'Kontaktbuchungen im aktuellen Monat' },
    { timeout: 10000 },
  );
  const rows = table.querySelectorAll('tbody tr');
  expect(rows[0]?.querySelector('.num')?.textContent).toBe('+30,00 €');
  expect(rows[1]?.querySelector('.num')?.textContent).toBe('−10,00 €');
});
