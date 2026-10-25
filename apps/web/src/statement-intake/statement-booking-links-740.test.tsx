// @vitest-environment jsdom
import type { StatementReceiptBooking, StatementReceiptLinksPage } from '@budget/domain';
import { ToastProvider, setAmountsHidden } from '@budget/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { StatementBookingLinks } from './statement-booking-links';

const source = {
  intakeId: 'intake',
  revision: '74000000-0000-4000-8000-000000000001',
  sha256: 'a'.repeat(64),
  accountId: 'giro',
  receiptId: 'original',
  currency: 'EUR',
  accountName: 'Synthetic account',
};
const row = (
  id: string,
  patch: Partial<StatementReceiptBooking> = {},
): StatementReceiptBooking => ({
  bookingId: id,
  bookingRevision: 'b'.repeat(64),
  accountId: 'giro',
  accountName: 'Synthetic account',
  date: '2026-09-17',
  description: `Purchase ${id}`,
  amountCents: -1251,
  currency: 'EUR',
  attached: false,
  managed: false,
  ...patch,
});
const page = (patch: Partial<StatementReceiptLinksPage> = {}): StatementReceiptLinksPage => ({
  source,
  linksRevision: 'c'.repeat(64),
  items: [row('first'), row('second', { amountCents: 501 })],
  attached: [],
  nextOffset: null,
  nextAttachedOffset: null,
  unavailableReason: null,
  ...patch,
});
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
const clients: QueryClient[] = [];
const onBusy = vi.fn(),
  onDirty = vi.fn();
let calls: { method: string; path: string; body: unknown }[];
function transport(reply: (url: URL, init: RequestInit) => Response | Promise<Response>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, init: RequestInit = {}) => {
      calls.push({
        path,
        method: init.method ?? 'GET',
        body: typeof init.body === 'string' ? JSON.parse(init.body) : null,
      });
      return reply(new URL(path, 'http://localhost'), init);
    }),
  );
}
async function mount(disabled = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <StatementBookingLinks
          intakeId="intake"
          accountId="giro"
          disabled={disabled}
          onBusy={onBusy}
          onDirty={onDirty}
        />
      </ToastProvider>
    </QueryClientProvider>,
  );
  await userEvent.click(screen.getByText('Vorhandene Buchungen mit diesem PDF verknüpfen'));
  await screen.findByRole('link', { name: 'Gespeichertes Original herunterladen' });
  return client;
}
beforeEach(() => {
  calls = [];
  onBusy.mockClear();
  onDirty.mockClear();
  vi.spyOn(window, 'confirm').mockReturnValue(false);
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  setAmountsHidden(false);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const select = (id: string) =>
  userEvent.click(screen.getByRole('checkbox', { name: new RegExp(`Anhängen:.*Purchase ${id}`) }));

it('preserves explicit IDs across search/pages and posts once with the frozen source and booking tokens', async () => {
  transport((url, init) =>
    init.method === 'POST'
      ? json({
          groupId: 'saved-group',
          changedCount: 2,
          attachedIds: ['first', 'third'],
          detachedIds: [],
        })
      : json(url.searchParams.get('q') ? page({ items: [row('third')] }) : page()),
  );
  await mount();
  await select('first');
  await userEvent.type(screen.getByLabelText('Vorhandene Buchung suchen'), 'third');
  await userEvent.click(screen.getByRole('button', { name: 'Suchen' }));
  await screen.findByRole('checkbox', { name: /Purchase third/ });
  await select('third');
  expect(
    within(screen.getByRole('region', { name: 'Auswahl vor dem Speichern' })).getAllByRole(
      'listitem',
    ),
  ).toHaveLength(2);
  await userEvent.click(screen.getByRole('button', { name: 'Verknüpfungen speichern' }));
  await screen.findByText(
    'Verknüpfungen gespeichert. Beträge und Buchungsdaten bleiben unverändert.',
  );
  const posts = calls.filter((call) => call.method === 'POST');
  expect(posts).toHaveLength(1);
  expect(posts[0]!.body).toEqual({
    sourceCas: { revision: source.revision, sha256: source.sha256, accountId: 'giro' },
    linksRevision: 'c'.repeat(64),
    attach: [
      { bookingId: 'first', bookingRevision: 'b'.repeat(64) },
      { bookingId: 'third', bookingRevision: 'b'.repeat(64) },
    ],
    detach: [],
  });
  expect(onDirty).toHaveBeenLastCalledWith(false);
  expect(onBusy.mock.calls).toEqual([[true], [false]]);
  expect(screen.getByRole('button', { name: 'Rückgängig' })).toBeTruthy();
});

it('retains a conflict draft until explicit successful reload and never resubmits automatically', async () => {
  transport((_url, init) =>
    init.method === 'POST'
      ? json({ error: 'conflict', message: 'Stand geändert.' }, 409)
      : json(page()),
  );
  await mount();
  await select('first');
  await userEvent.click(screen.getByRole('button', { name: 'Verknüpfungen speichern' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Ihre Auswahl bleibt erhalten');
  expect(
    (screen.getByRole('checkbox', { name: /Purchase first/ }) as HTMLInputElement).checked,
  ).toBe(true);
  await userEvent.click(screen.getByRole('button', { name: 'Stand neu laden' }));
  expect(window.confirm).toHaveBeenCalledOnce();
  expect(screen.getByRole('region', { name: 'Auswahl vor dem Speichern' })).toBeTruthy();
  vi.mocked(window.confirm).mockReturnValue(true);
  await userEvent.click(screen.getByRole('button', { name: 'Stand neu laden' }));
  await waitFor(() =>
    expect(screen.queryByRole('region', { name: 'Auswahl vor dem Speichern' })).toBeNull(),
  );
  expect(calls.filter((call) => call.method === 'POST')).toHaveLength(1);
});

it('locks selection/search/save/discard during a pending write and clears with a no-op without fake Undo', async () => {
  let finish!: (response: Response) => void;
  transport((_url, init) =>
    init.method === 'POST'
      ? new Promise<Response>((resolve) => {
          finish = resolve;
        })
      : json(page()),
  );
  await mount();
  await select('first');
  await userEvent.click(screen.getByRole('button', { name: 'Verknüpfungen speichern' }));
  for (const name of ['Verknüpfungen speichern', 'Auswahl verwerfen', 'Stand neu laden', 'Suchen'])
    expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByLabelText('Vorhandene Buchung suchen') as HTMLInputElement).disabled).toBe(
    true,
  );
  expect(screen.getAllByRole('checkbox').every((el) => (el as HTMLInputElement).disabled)).toBe(
    true,
  );
  await act(async () =>
    finish(json({ groupId: null, changedCount: 0, attachedIds: [], detachedIds: [] })),
  );
  await screen.findByText('Die ausgewählten Verknüpfungen waren bereits im gewünschten Stand.');
  expect(screen.queryByRole('button', { name: 'Rückgängig' })).toBeNull();
  expect(calls.filter((call) => call.method === 'POST')).toHaveLength(1);
  expect(onBusy).toHaveBeenLastCalledWith(false);
});

it('shows original and precise booking identities while protecting managed/foreign links and amount privacy', async () => {
  transport(() =>
    json(
      page({
        attached: [
          row('managed', { attached: true, managed: true }),
          row('foreign', { accountId: 'spar', attached: true }),
        ],
      }),
    ),
  );
  await mount();
  expect(
    screen.getByRole('link', { name: 'Gespeichertes Original herunterladen' }).getAttribute('href'),
  ).toBe('/api/receipts/original/download');
  for (const id of ['managed', 'foreign'])
    expect(
      (screen.getByRole('checkbox', { name: new RegExp(`Purchase ${id}`) }) as HTMLInputElement)
        .disabled,
    ).toBe(true);
  expect(screen.getAllByText(/Buchungs-ID:/)).toHaveLength(4);
  expect(screen.getAllByRole('link', { name: 'Buchung öffnen' })[0]!.getAttribute('href')).toBe(
    '/konten/buchungen?konto=giro&buchung=managed',
  );
  await select('first');
  await act(async () => setAmountsHidden(true));
  expect(document.body.textContent).not.toMatch(/12,51|5,01/);
  expect(calls.filter((call) => call.method === 'POST')).toHaveLength(0);
  await userEvent.click(screen.getByRole('button', { name: 'Auswahl verwerfen' }));
  expect(onDirty).toHaveBeenLastCalledWith(false);
});

it('refuses to add choices from a changed link revision while preserving earlier choices', async () => {
  transport((url) =>
    json(
      url.searchParams.get('q')
        ? page({ items: [row('third')], linksRevision: 'd'.repeat(64) })
        : page(),
    ),
  );
  await mount();
  await select('first');
  await userEvent.type(screen.getByLabelText('Vorhandene Buchung suchen'), 'third');
  await userEvent.click(screen.getByRole('button', { name: 'Suchen' }));
  await screen.findByRole('checkbox', { name: /Purchase third/ });
  await select('third');
  expect((await screen.findByRole('alert')).textContent).toContain('Stand hat sich geändert');
  expect(
    within(screen.getByRole('region', { name: 'Auswahl vor dem Speichern' })).getAllByRole(
      'listitem',
    ),
  ).toHaveLength(1);
  expect(calls.filter((call) => call.method === 'POST')).toHaveLength(0);
});

it('keeps selected booking identities when paging away and back', async () => {
  transport((url) =>
    json(
      url.searchParams.get('offset') === '25'
        ? page({ items: [row('third')] })
        : page({ nextOffset: 25 }),
    ),
  );
  await mount();
  await select('first');
  await userEvent.click(screen.getByRole('button', { name: 'Weitere Buchungen' }));
  await screen.findByRole('checkbox', { name: /Purchase third/ });
  await select('third');
  await userEvent.click(screen.getByRole('button', { name: 'Vorherige Buchungen' }));
  const first = await screen.findByRole('checkbox', { name: /Purchase first/ });
  expect((first as HTMLInputElement).checked).toBe(true);
  expect(
    within(screen.getByRole('region', { name: 'Auswahl vor dem Speichern' })).getAllByRole(
      'listitem',
    ),
  ).toHaveLength(2);
  expect(calls.filter((call) => call.method === 'POST')).toHaveLength(0);
});
