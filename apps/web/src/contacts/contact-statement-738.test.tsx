// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider, setAmountsHidden } from '@budget/ui';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ContactStatementPage } from './contacts-page';

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useSearch: () => ({ verlauf: 1 }),
  useParams: () => ({ id: 'contact-alpha' }),
  useLocation: () => ({ pathname: '/konten/kontakte/contact-alpha', searchStr: '?verlauf=1' }),
  useLinkProps: ({
    to,
    search,
    activeOptions: _active,
    activeProps: _activeProps,
    inactiveProps: _inactiveProps,
    ...props
  }: {
    to: string;
    search?: Record<string, string>;
    activeOptions?: unknown;
    activeProps?: unknown;
    inactiveProps?: unknown;
  }) => {
    void _active;
    void _activeProps;
    void _inactiveProps;
    return { href: `${to}${search ? `?${new URLSearchParams(search)}` : ''}`, ...props };
  },
}));
// The adapter must pass the freshly read origin, not reconstruct a contact-only booking.
// Actual editor Save/Undo and gift conversion are covered by real API/native tests.
vi.mock('../ledger/booking-panel', () => ({
  BookingPanel: ({
    state,
    onClose,
  }: {
    state: { booking: { id: string; date: string; accountId: string; amountCents: number } } | null;
    onClose: () => void;
  }) =>
    state ? (
      <div role="dialog" aria-label="Ursprung">
        {state.booking.id} · {state.booking.date} · {state.booking.accountId} ·{' '}
        {state.booking.amountCents}
        <button onClick={onClose}>Ursprung schließen</button>
      </div>
    ) : null,
}));

const movement = (splitId: string, date: string, amountCents: number, memo: string) => ({
  splitId,
  bookingId: `booking-${splitId}`,
  date,
  amountCents,
  memo,
});
const closedOutlay = movement('closed-outlay', '2026-08-01', -1000, 'Frühere Auslage');
const closedReceipt = movement('closed-receipt', '2026-08-02', 1000, 'Früher bezahlt');
const older = movement('older', '2026-09-01', -3000, 'Ältere Auslage');
const olderReceipt = movement('older-receipt', '2026-09-02', 1000, 'Ältere Teilzahlung');
const current = movement('current', '2026-10-01', -4000, 'Synthetische Auslage');
const receipt = movement('receipt', '2026-10-02', 1500, 'Synthetische Teilzahlung');
const statement = {
  contact: { id: 'contact-alpha', name: 'Contact Alpha' },
  asOf: '2026-10-20',
  balanceCents: 4500,
  creditCents: 0,
  movements: [closedOutlay, closedReceipt, older, olderReceipt, current, receipt],
  outlays: [
    { ...closedOutlay, remainingCents: 0 },
    { ...older, remainingCents: 2000 },
    { ...current, remainingCents: 2500 },
  ],
  receipts: [
    {
      receiptSplitId: closedReceipt.splitId,
      allocations: [{ outlaySplitId: closedOutlay.splitId, amountCents: 1000 }],
      creditCents: 0,
      recorded: true,
    },
    {
      receiptSplitId: olderReceipt.splitId,
      allocations: [{ outlaySplitId: older.splitId, amountCents: 1000 }],
      creditCents: 0,
      recorded: true,
    },
    {
      receiptSplitId: receipt.splitId,
      allocations: [{ outlaySplitId: current.splitId, amountCents: 1500 }],
      creditCents: 0,
      recorded: true,
    },
  ],
  closedThroughSplitId: closedReceipt.splitId,
};
let calls: Array<{ method: string; path: string }>;
let amount: number;
let sourceGate: Promise<void> | undefined;
let sourceError: boolean;
let responseStatement: typeof statement;
beforeEach(() => {
  calls = [];
  amount = -5500;
  sourceGate = undefined;
  sourceError = false;
  responseStatement = structuredClone(statement);
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const path = new URL(String(input), 'http://localhost').pathname;
      calls.push({ method: init?.method ?? 'GET', path });
      if (path === '/api/auth/status' && (init?.method ?? 'GET') === 'GET')
        return Response.json({
          setupRequired: false,
          authenticated: true,
          stepUpValidUntil: null,
          viaRecovery: false,
        });
      if (path.startsWith('/api/bookings/')) {
        await sourceGate;
        if (sourceError)
          return Response.json(
            { error: 'not_found', message: 'Buchung nicht gefunden.' },
            { status: 404 },
          );
        return Response.json({
          booking: {
            id: path.split('/').at(-1),
            date: '2026-10-01',
            accountId: 'synthetic-bank',
            amountCents: amount,
          },
        });
      }
      if (path === '/api/contacts/contact-alpha' && (init?.method ?? 'GET') === 'GET')
        return Response.json(responseStatement);
      return Response.json({ error: 'unexpected_fixture_request' }, { status: 404 });
    }),
  );
});
afterEach(() => {
  const actualCalls = [...calls];
  cleanup();
  setAmountsHidden(false);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  expect(actualCalls.filter((call) => call.method !== 'GET')).toEqual([]);
  expect(
    actualCalls.filter(
      (call) =>
        call.path !== '/api/contacts/contact-alpha' &&
        call.path !== '/api/auth/status' &&
        !statement.movements.some((m) => call.path === `/api/bookings/${m.bookingId}`),
    ),
  ).toEqual([]);
});
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <ContactStatementPage />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return client;
}
const EXPECTED_COPY = [
  'Contact Alpha',
  'Zahlungen im Oktober 2026',
  '01.10.2026 · Synthetische Auslage · Auslage · +40,00 € · offen 25,00 €',
  '02.10.2026 · Synthetische Teilzahlung · Rückzahlung · −15,00 €',
  'Gesamtsaldo bis 20.10.2026: Schuldet dir 45,00 €',
].join('\n');

it('keeps every movement in its exact section and copies only the named month with signed amounts and scoped balance', async () => {
  const user = userEvent.setup();
  const clipboard = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
  mount();
  const currentTable = await screen.findByRole('table', {
    name: 'Kontaktbuchungen im aktuellen Monat',
  });
  expect(within(currentTable).getAllByRole('row')).toHaveLength(3);
  expect(within(currentTable).getByRole('columnheader', { name: 'Offen' })).toBeTruthy();
  expect(within(currentTable).getByRole('button', { name: /Synthetische Auslage/ })).toBeTruthy();
  expect(
    screen.getByRole('table', { name: 'Noch offene Auslagen aus früheren Monaten' }).textContent,
  ).toContain('Ältere Auslage');
  expect(
    screen.getByRole('table', { name: 'Kontaktbuchungen außerhalb des aktuellen Monats' })
      .textContent,
  ).not.toContain('Ältere Auslage');
  expect(
    screen.getByRole('table', { name: 'Kontaktbuchungen außerhalb des aktuellen Monats' })
      .textContent,
  ).toContain('Ältere Teilzahlung');
  expect(document.querySelector('details.contacts-closed-history')?.hasAttribute('open')).toBe(
    false,
  );
  await user.click(screen.getByRole('button', { name: 'Zahlungen im Oktober 2026 kopieren' }));
  expect(clipboard).toHaveBeenCalledExactlyOnceWith(EXPECTED_COPY);
  expect(screen.getByText('Abschnitt kopiert.').getAttribute('role')).toBe('status');
  expect(screen.getByRole('link', { name: 'Zurück zu Kontakte' }).getAttribute('href')).toBe(
    '/konten/kontakte?verlauf=1',
  );
});

it('copies masked money under privacy mode without retaining an unmasked fallback', async () => {
  const user = userEvent.setup();
  const clipboard = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
  setAmountsHidden(true);
  mount();
  await user.click(
    await screen.findByRole('button', { name: 'Zahlungen im Oktober 2026 kopieren' }),
  );
  expect(clipboard).toHaveBeenCalledExactlyOnceWith(
    [
      'Contact Alpha',
      'Zahlungen im Oktober 2026',
      '01.10.2026 · Synthetische Auslage · Auslage · ••• € · offen ••• €',
      '02.10.2026 · Synthetische Teilzahlung · Rückzahlung · ••• €',
      'Gesamtsaldo bis 20.10.2026: Schuldet dir ••• €',
    ].join('\n'),
  );
  expect(document.body.textContent).not.toContain('45,00');
});

it('masks money embedded in descriptions as well as copied numeric columns', async () => {
  const user = userEvent.setup();
  const clipboard = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
  responseStatement.movements[4]!.memo = 'Synthetische Auslage 40,00 €';
  setAmountsHidden(true);
  mount();
  await user.click(
    await screen.findByRole('button', { name: 'Zahlungen im Oktober 2026 kopieren' }),
  );
  expect(clipboard).toHaveBeenCalledOnce();
  expect(clipboard.mock.calls[0]![0]).toContain('Synthetische Auslage ••• €');
  expect(clipboard.mock.calls[0]![0]).not.toContain('40,00');
  expect(document.body.textContent).not.toContain('40,00');
  expect(
    screen
      .getByRole('button', { name: /Ursprungsbuchung öffnen.*Synthetische Auslage/ })
      .getAttribute('aria-label'),
  ).not.toContain('40,00');
});

it('offers selectable plain text after clipboard denial and updates it when privacy changes', async () => {
  const user = userEvent.setup();
  vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));
  mount();
  await user.click(
    await screen.findByRole('button', { name: 'Zahlungen im Oktober 2026 kopieren' }),
  );
  const fallback = (await screen.findByRole('textbox', {
    name: 'Text zum Kopieren',
  })) as HTMLTextAreaElement;
  expect(fallback.readOnly).toBe(true);
  expect(fallback.value).toBe(EXPECTED_COPY);
  expect(
    screen.getByText('Kopieren nicht möglich. Text bitte manuell kopieren.').getAttribute('role'),
  ).toBe('status');
  act(() => setAmountsHidden(true));
  expect(fallback.value).not.toContain('40,00');
  expect(fallback.value).toContain('••• €');
});

it('waits for a fresh origin GET on each open, retains the actual whole booking and cancels without a write', async () => {
  const user = userEvent.setup();
  mount();
  let resolve!: () => void;
  sourceGate = new Promise<void>((done) => {
    resolve = done;
  });
  await user.click(
    await screen.findByRole('button', { name: /Ursprungsbuchung öffnen.*Synthetische Auslage/ }),
  );
  expect(screen.queryByRole('dialog')).toBeNull();
  await act(async () => {
    resolve();
    await sourceGate;
  });
  expect((await screen.findByRole('dialog')).textContent).toContain(
    'booking-current · 2026-10-01 · synthetic-bank · -5500',
  );
  await user.click(screen.getByRole('button', { name: 'Ursprung schließen' }));
  amount = -6500;
  sourceGate = new Promise<void>((done) => {
    resolve = done;
  });
  await user.click(
    screen.getByRole('button', { name: /Ursprungsbuchung öffnen.*Synthetische Auslage/ }),
  );
  expect(screen.queryByRole('dialog')).toBeNull();
  await act(async () => {
    resolve();
    await sourceGate;
  });
  await waitFor(() => expect(screen.getByRole('dialog').textContent).toContain('-6500'));
  expect(calls.filter((call) => call.path === '/api/bookings/booking-current')).toHaveLength(2);
});

it('keeps a failed source read out of the editor and offers retry without writing', async () => {
  const user = userEvent.setup();
  sourceError = true;
  mount();
  await user.click(
    await screen.findByRole('button', { name: /Ursprungsbuchung öffnen.*Ältere Auslage/ }),
  );
  expect((await screen.findByRole('alert')).textContent).toContain('Buchung nicht gefunden.');
  expect(screen.queryByRole('dialog')).toBeNull();
  sourceError = false;
  await user.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
  expect((await screen.findByRole('dialog')).textContent).toContain('booking-older');
});
