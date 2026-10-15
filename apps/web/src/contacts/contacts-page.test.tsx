// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setAmountsHidden, ToastProvider } from '@budget/ui';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ContactStatementPage, ContactsPage } from './contacts-page';

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useSearch: () => ({}),
  useParams: () => ({ id: 'synthetic-contact' }),
  useLocation: () => ({ pathname: '/konten/kontakte', searchStr: '?verlauf=1' }),
  Link: ({
    to,
    search,
    children,
    activeOptions: _activeOptions,
    ...props
  }: {
    to: string;
    search?: Record<string, string>;
    children: React.ReactNode;
    activeOptions?: unknown;
  }) => {
    void _activeOptions;
    return (
      <a href={`${to}${search ? `?${new URLSearchParams(search)}` : ''}`} {...props}>
        {children}
      </a>
    );
  },
}));
afterEach(() => setAmountsHidden(false));
beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            contacts: [
              {
                id: 'synthetic-contact',
                name: 'Kontakt Beispiel',
                balanceCents: 0,
                creditCents: 0,
              },
            ],
          }),
        ),
    ),
  );
});
it('links retained contact history to its statement page with the overview context', async () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <ContactsPage />
      </ToastProvider>
    </QueryClientProvider>,
  );
  const link = await screen.findByRole('link', { name: 'Kontakt Beispiel' }, { timeout: 10000 });
  expect(link.getAttribute('href')).toBe('/konten/kontakte/synthetic-contact?verlauf=1');
  expect(screen.getByRole('link', { name: /Saldo Kontakt Beispiel/ }).getAttribute('href')).toBe(
    '/konten/kontakte/synthetic-contact?verlauf=1',
  );
  expect((screen.getByLabelText('Auch ausgeglichene Kontakte') as HTMLInputElement).checked).toBe(
    true,
  );
  expect(screen.getByRole('button', { name: 'Kontakt Beispiel umbenennen' })).toBeDefined();
});

it('keeps the balance link accessible while hiding its amount under privacy mode', async () => {
  setAmountsHidden(true);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <ContactsPage />
      </ToastProvider>
    </QueryClientProvider>,
  );
  const link = await screen.findByRole(
    'link',
    { name: /Saldo Kontakt Beispiel/ },
    { timeout: 10000 },
  );
  expect(link.getAttribute('aria-label')).toBe('••• €, Saldo Kontakt Beispiel');
  expect(link.textContent).toBe('••• €');
});

it('keeps current-month movements out of history when no recorded closure exists', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            contact: { id: 'synthetic-contact', name: 'Kontakt Beispiel' },
            asOf: '2026-10-15',
            balanceCents: 2000,
            creditCents: 0,
            movements: [
              {
                splitId: 'outlay',
                bookingId: 'outlay-booking',
                date: '2026-10-01',
                amountCents: -3000,
                memo: null,
              },
              {
                splitId: 'receipt',
                bookingId: 'receipt-booking',
                date: '2026-10-02',
                amountCents: 1000,
                memo: null,
              },
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
          }),
        ),
    ),
  );
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <ContactStatementPage />
      </ToastProvider>
    </QueryClientProvider>,
  );
  const monthTable = await screen.findByRole('table', {
    name: 'Kontaktbuchungen im aktuellen Monat',
  });
  expect(monthTable.querySelectorAll('tbody tr')).toHaveLength(2);
  expect(screen.getByText('Noch keine ältere oder spätere Kontaktbewegung.')).toBeDefined();
  expect(screen.queryByText('Zuordnung nicht protokolliert')).toBeNull();
});
