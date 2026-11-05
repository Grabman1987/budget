// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider, setAmountsHidden } from '@budget/ui';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SpritmonitorReview, SpritmonitorSourceSection } from './spritmonitor-source';
import type { FuelStatus } from './spritmonitor-api';
import type { ListedBooking } from '../ledger/types';
import { InboxWorkflow } from '../inbox/inbox-page';
import type { InboxStored } from '../inbox/api';

const flags = vi.hoisted(() => ({ REDESIGN_ENABLED: false }));
vi.mock('../shell/redesign-flag', () => flags);
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useSearch: () => ({}),
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/konten/pruefen', href: '/konten/pruefen', hash: '' }),
}));

vi.mock('../shell/app-link', () => ({
  AppLink: ({
    to,
    children,
    ...rest
  }: {
    to: string;
    children: React.ReactNode;
    search?: unknown;
    hash?: string;
  }) => {
    const { search, hash, ...props } = rest;
    void search;
    return (
      <a href={to + (hash ? '#' + hash : '')} {...props}>
        {children}
      </a>
    );
  },
}));
vi.mock('../ledger/booking-panel', () => ({
  BookingPanel: ({ state }: { state: { mode: string; booking: ListedBooking } | null }) =>
    state ? (
      <div role="dialog" aria-label="Buchung bearbeiten">
        Normale Buchung {state.booking.id} auf {state.booking.accountName}
      </div>
    ) : null,
}));

const source = {
  sourceId: 'spritmonitor:123:456:1',
  date: '2026-11-04',
  stationName: 'Tankstelle Muster',
  location: null,
  note: null,
  status: 'importable' as const,
  currency: 'EUR' as const,
  amountCents: -7255,
};
const row = {
  key: 'spritmonitor.row.' + 'a'.repeat(40),
  source,
  originalSource: source,
  bookingId: null,
  status: 'review' as const,
  reason: 'bootstrap',
  candidates: ['existing'],
  reviewFingerprint: 'b'.repeat(64),
  canResolve: true,
  canBook: true,
};
const booking = {
  id: 'existing',
  date: '2026-11-04',
  accountId: 'other',
  accountName: 'Giro Muster',
  amountCents: -7000,
  currency: 'EUR',
  payeeName: 'Tankstelle Muster',
  memo: null,
  transferId: null,
} as ListedBooking;
let data: FuelStatus;
let calls: { method: string; path: string; body: Record<string, unknown> | null }[];
let fail = false;
let stale = false;
let client: QueryClient;
const base = (): FuelStatus => ({
  configured: true,
  running: false,
  state: { bootstrapThrough: '2026-11-05', lastSuccess: '2026-11-05T12:00:00Z' },
  lastResult: null,
  destination: { accountId: 'card', accountName: 'Karte Muster', categoryName: 'Kraftstoff' },
  rows: [structuredClone(row)],
});
function mount(node: React.ReactNode) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>{node}</ToastProvider>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  flags.REDESIGN_ENABLED = false;
  data = base();
  calls = [];
  fail = false;
  stale = false;
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = String(url),
        method = init?.method ?? 'GET';
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
      calls.push({ method, path, body });
      if (path === '/api/sources/spritmonitor' && method === 'GET') {
        if (fail) return Response.json({ error: 'offline' }, { status: 503 });
        return Response.json(data);
      }
      if (path.startsWith('/api/bookings?'))
        return Response.json({ items: [booking], nextCursor: null, total: 1 });
      if (path.startsWith('/api/bookings/')) return Response.json({ booking });
      if (path.endsWith('/refresh'))
        return Response.json({ imported: 0, review: 1, linked: 0, groupId: null });
      if (path.endsWith('/resolve')) {
        if (stale) {
          data.rows[0]!.reviewFingerprint = 'c'.repeat(64);
          return Response.json(
            {
              error: 'spritmonitor_conflict',
              message: 'Daten haben sich geändert. Erneut abrufen.',
            },
            { status: 409 },
          );
        }
        data.rows[0]!.status =
          body?.action === 'book' ? 'booked' : body?.action === 'link' ? 'linked' : 'ignored';
        data.rows[0]!.canResolve = false;
        data.rows[0]!.canBook = false;
        data.rows[0]!.bookingId =
          body?.action === 'link' ? 'existing' : body?.action === 'book' ? 'created' : null;
        return Response.json({ groupId: 'synthetic-group', bookingId: data.rows[0]!.bookingId });
      }
      if (path === '/api/undo') return Response.json({ groupId: 'synthetic-redo' });
      throw new Error('Unexpected synthetic request ' + path);
    }),
  );
});
afterEach(() => {
  client?.clear();
  setAmountsHidden(false);
  vi.unstubAllGlobals();
});

describe('Spritmonitor connection and review UI', () => {
  it.each([false, true])(
    'shows missing setup without credential fields (compact=%s)',
    async (compact) => {
      data.configured = false;
      data.destination = null;
      data.rows = [];
      mount(<SpritmonitorSourceSection compact={compact} />);
      if (compact) fireEvent.click(await screen.findByRole('button', { name: 'Prüfen' }));
      await screen.findByText(/Die Verbindung wird am Server eingerichtet/);
      expect(screen.queryByRole('textbox')).toBeNull();
      expect(
        (screen.getByRole('button', { name: 'Jetzt abrufen' }) as HTMLButtonElement).disabled,
      ).toBe(true);
    },
  );
  it('shows open review counts and refreshes explicitly without resolving any fueling', async () => {
    mount(<SpritmonitorSourceSection />);
    await screen.findByText(/Status: 1 Tankung zu prüfen/);
    fireEvent.click(screen.getByRole('button', { name: 'Jetzt abrufen' }));
    await screen.findByText('0 vorgemerkt · 1 zu prüfen · 0 verknüpft');
    expect(calls.filter((c) => c.method === 'POST')).toEqual([
      { method: 'POST', path: '/api/sources/spritmonitor/refresh', body: {} },
    ]);
    expect(
      screen.getByRole('link', { name: 'Offene Tankungen in Prüfen' }).getAttribute('href'),
    ).toBe('/konten/pruefen');
  });
  it.each(['running', 'current', 'failed'] as const)('shows the %s source state', async (state) => {
    data.rows = [];
    data.state!.lastSuccess = new Date().toISOString();
    if (state === 'running') data.running = true;
    if (state === 'failed')
      data.lastResult = { lastAttempt: new Date().toISOString(), lastSuccess: null, failed: true };
    mount(<SpritmonitorSourceSection />);
    const label =
      state === 'running'
        ? 'Abruf l\u00e4uft'
        : state === 'current'
          ? 'Aktuell'
          : 'Abruf fehlgeschlagen';
    await screen.findByText(new RegExp('Status: ' + label));
    if (state === 'running')
      expect(
        (screen.getByRole('button', { name: 'Ruft ab \u2026' }) as HTMLButtonElement).disabled,
      ).toBe(true);
    if (state === 'failed') expect(screen.getByRole('alert')).toBeTruthy();
  });
  it('keeps historical review lazy until its source disclosure is opened', async () => {
    mount(<SpritmonitorSourceSection />);
    const summary = await screen.findByText(/Tankstelle Muster.*Zu prüfen/);
    expect(calls.some((c) => c.path.startsWith('/api/bookings'))).toBe(false);
    const details = summary.closest('details')!;
    details.open = true;
    fireEvent(details, new Event('toggle'));
    await screen.findByLabelText('Vorhandene Buchung verknüpfen');
    expect(calls.some((c) => c.path.startsWith('/api/bookings?'))).toBe(true);
  });
  it('links an existing different net amount using the current review token and offers native Undo', async () => {
    mount(<SpritmonitorReview rowKey={row.key} />);
    const select = await screen.findByLabelText('Vorhandene Buchung verknüpfen');
    await screen.findByRole('option', { name: /Giro Muster.*70,00/ });
    fireEvent.change(select, { target: { value: 'existing' } });
    fireEvent.click(screen.getByRole('button', { name: 'Mit Buchung verknüpfen' }));
    await screen.findByRole('button', { name: 'Rückgängig' });
    expect(calls.filter((c) => c.path.endsWith('/resolve'))).toEqual([
      {
        method: 'POST',
        path: '/api/sources/spritmonitor/resolve',
        body: { key: row.key, fingerprint: 'b'.repeat(64), action: 'link', bookingId: 'existing' },
      },
    ]);
    expect(booking.amountCents).toBe(-7000);
    fireEvent.click(screen.getByRole('button', { name: 'Rückgängig' }));
    await waitFor(() =>
      expect(
        calls.some((c) => c.path === '/api/undo' && c.body?.groupId === 'synthetic-group'),
      ).toBe(true),
    );
  });
  it.each(['book', 'ignore'] as const)(
    'explicitly resolves historical review with %s and its current token',
    async (action) => {
      mount(<SpritmonitorReview rowKey={row.key} />);
      await screen.findByRole('option', { name: /Giro Muster/ });
      const button = screen.getByRole('button', {
        name: action === 'book' ? 'Als neue Tankung buchen' : 'Tankung ignorieren',
      });
      expect(screen.getByText(/Neue Buchung:.*Karte Muster.*Kraftstoff/)).toBeTruthy();
      fireEvent.click(button);
      await waitFor(() =>
        expect(calls.find((c) => c.path.endsWith('/resolve'))?.body).toMatchObject({
          key: row.key,
          fingerprint: 'b'.repeat(64),
          action,
        }),
      );
    },
  );
  it('opens an imported fueling in the existing normal booking editor and offers no rebook action', async () => {
    data.rows[0] = {
      ...data.rows[0]!,
      bookingId: 'existing',
      status: 'booked',
      canBook: false,
      canResolve: false,
    };
    mount(<SpritmonitorReview rowKey={row.key} />);
    await screen.findByText(/Erfasst:.*Giro Muster.*70,00/);
    fireEvent.click(screen.getByRole('button', { name: 'Buchung bearbeiten' }));
    await screen.findByRole('dialog', { name: 'Buchung bearbeiten' });
    expect(screen.getByText('Normale Buchung existing auf Giro Muster')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Als neue Tankung buchen' })).toBeNull();
    expect(calls.every((c) => c.method === 'GET')).toBe(true);
  });
  it('reports stale review rejection, refreshes the current source and does not retry a money write', async () => {
    stale = true;
    mount(<SpritmonitorReview rowKey={row.key} />);
    await screen.findByRole('option', { name: /Giro Muster/ });
    fireEvent.click(screen.getByRole('button', { name: 'Als neue Tankung buchen' }));
    await waitFor(() => expect(calls.filter((c) => c.path.endsWith('/resolve'))).toHaveLength(1));
    await waitFor(() =>
      expect(calls.filter((c) => c.path === '/api/sources/spritmonitor')).toHaveLength(2),
    );
    expect(data.rows[0]!.reviewFingerprint).toBe('c'.repeat(64));
    expect(data.rows[0]!.status).toBe('review');
    expect(screen.getByText('Daten haben sich geändert. Erneut abrufen.')).toBeTruthy();
  });
  it('shows a source error with retry', async () => {
    fail = true;
    mount(<SpritmonitorSourceSection />);
    await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: 'Erneut versuchen' })).toBeTruthy();
    client.clear();
  });
  it.each([false, true])(
    'renders guarded Spritmonitor actions in the existing inbox detail (redesign=%s)',
    async (redesign) => {
      flags.REDESIGN_ENABLED = redesign;
      const entry: InboxStored = {
        type: 'stored',
        id: 'synthetic-inbox',
        kind: 'import',
        title: 'Spritmonitor: Tankung pr\u00fcfen',
        detail: 'Quelle abgleichen.',
        refType: 'spritmonitor',
        refId: row.key,
        urgent: false,
        createdAt: '2026-11-05T12:00:00Z',
      };
      mount(<InboxWorkflow detailEntry={entry} />);
      await screen.findByRole('option', { name: /Giro Muster/ });
      expect(screen.getByRole('button', { name: 'Als neue Tankung buchen' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Tankung ignorieren' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Als erledigt markieren' })).toBeNull();
      expect(calls.every((c) => c.method === 'GET')).toBe(true);
    },
  );
  it('respects amount privacy in source snapshots and candidate labels', async () => {
    setAmountsHidden(true);
    mount(<SpritmonitorReview rowKey={row.key} />);
    await screen.findByRole('option', { name: /Giro Muster/ });
    expect(screen.queryByText(/72,55|70,00/)).toBeNull();
    expect(screen.getAllByText(/•••/).length).toBeGreaterThan(0);
    await act(async () => undefined);
  });
});
