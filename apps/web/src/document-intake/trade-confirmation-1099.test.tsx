// @vitest-environment jsdom
import type { ReactNode } from 'react';
import type * as Router from '@tanstack/react-router';
import type { TradeConfirmationIntake } from '@budget/domain';
import { ToastProvider } from '@budget/ui';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DocumentUploadButton, type Classification } from './document-upload';

// The trade form guards unsaved input through the router; no navigation happens in these tests.
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof Router>()),
  useBlocker: () => ({ status: 'idle', reset: () => {}, proceed: () => {} }),
}));
vi.mock('../budget/use-category-writes', () => ({
  useBudgetWrite: () => async (run: () => Promise<unknown>) => run().catch(() => undefined),
}));
vi.mock('../statement-intake/statement-review-726', () => ({ AccountStatementIntake: () => null }));
vi.mock('../reports/payslip-panel', () => ({ PayslipUploadDialog: () => null }));

// Synthetic data only.
const ISIN = 'IE00SYNTH008';
const DEPOT = 'synthetic-depot',
  SECURITY = 'synthetic-fund';
const intake = (
  proposal: Partial<TradeConfirmationIntake['proposal']> = {},
  rest: Partial<TradeConfirmationIntake> = {},
): TradeConfirmationIntake => ({
  proposal: {
    reference: 'wpa:1a2b-3c4d',
    source: 'buy',
    kind: 'buy',
    instrument: { name: 'Synthetic Index Fund (Acc)', isin: ISIN },
    date: '2026-11-09',
    unitsE8: 33_944_300,
    amountCents: 10_000,
    feeCents: 100,
    taxCents: 0,
    currency: 'EUR',
    open: [],
    unchecked: false,
    ...proposal,
  },
  securityId: SECURITY,
  importKey: 'wpa:1a2b-3c4d',
  duplicate: null,
  ...rest,
});
const classified = (trade: TradeConfirmationIntake): Classification => ({
  type: 'trade_confirmation',
  confidence: 'certain',
  hints: { mime: 'application/pdf' },
  needsPassword: false,
  trade,
});

let result: Classification;
let plans: unknown[];
let writes: { path: string; body: Record<string, unknown> }[];
let tradeReply: { status: number; body: Record<string, unknown> };
beforeEach(() => {
  plans = [];
  writes = [];
  tradeReply = {
    status: 201,
    body: {
      trade: { id: 'synthetic-trade', securityId: SECURITY },
      groupId: 'synthetic-group',
      bookingId: 'synthetic-booking',
      duplicate: false,
    },
  };
  // jsdom has no showModal and no matchMedia (desktop layout).
  HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
    const path = new URL(url, 'http://localhost').pathname;
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
    if (path === '/api/document-intake/classify') return Response.json(result);
    if (path === '/api/accounts')
      return Response.json({
        asOf: '2026-11-12',
        accounts: [
          { id: 'synthetic-giro', name: 'Muster Giro', role: 'budget', currency: 'EUR' },
          {
            id: DEPOT,
            name: 'Muster Depot',
            role: 'investment',
            currency: 'EUR',
            closedAt: null,
            institutionId: null,
          },
        ],
      });
    if (path === '/api/securities')
      return Response.json({
        securities: [{ id: SECURITY, name: 'Synthetic Index Fund', currency: 'EUR', isin: ISIN }],
      });
    if (path === '/api/savings-plans/execution-proposals')
      return Response.json({ proposals: plans });
    if (method === 'POST' && (path === '/api/trades' || path.endsWith('/confirm-execution'))) {
      const raw = init?.body ?? (input instanceof Request ? await input.text() : '{}');
      writes.push({ path, body: JSON.parse(String(raw)) as Record<string, unknown> });
      return Response.json(tradeReply.body, { status: tradeReply.status });
    }
    // Lookups and anything else the form reads but these tests do not assert on.
    return Response.json({ institutions: [] });
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function upload(trade: TradeConfirmationIntake) {
  result = classified(trade);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrap = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
  render(<DocumentUploadButton />, { wrapper: wrap });
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Dokument hochladen' }));
  await user.upload(
    screen.getByLabelText('Dokument auswählen'),
    new File(['%PDF-1.7'], 'synthetic.pdf', { type: 'application/pdf' }),
  );
  await screen.findByText('Erkannt: Wertpapierabrechnung');
  return user;
}
const form = () => screen.findByRole('dialog', { name: 'Handel erfassen' });
const value = (scope: HTMLElement, label: RegExp | string) =>
  (within(scope).getByLabelText(label) as HTMLInputElement | HTMLSelectElement).value;

it('shows the read values and opens a pre-filled trade the owner confirms', async () => {
  const user = await upload(intake());
  const read = within(screen.getByRole('region', { name: 'Gelesene Angaben' }));
  expect(read.getByText(`Synthetic Index Fund (Acc) · ISIN ${ISIN}`)).toBeTruthy();
  expect(read.getByText('0,339443')).toBeTruthy();
  expect(read.getByText('100,00 €')).toBeTruthy();
  expect(read.getByText('1,00 €')).toBeTruthy();
  expect(writes).toEqual([]);

  await user.click(screen.getByRole('button', { name: 'Weiter' }));
  const dialog = await form();
  await within(dialog).findByLabelText('Stück');
  expect(value(dialog, 'Handelsart')).toBe('buy');
  expect(value(dialog, 'Anlagekonto')).toBe(DEPOT);
  expect(value(dialog, 'Instrument')).toBe(SECURITY);
  // The date field shows its de-AT text.
  expect(value(dialog, 'Handelsdatum')).toBe('09.11.2026');
  expect(value(dialog, 'Stück')).toBe('0,339443');
  expect(value(dialog, /^Bruttobetrag/)).toBe('100,00');
  expect(value(dialog, /^Gebühren/)).toBe('1,00');
  expect(within(dialog).queryByText(/Nicht sicher gelesen/)).toBeNull();
  // Nothing is written before the confirmation.
  expect(writes).toEqual([]);

  await user.click(within(dialog).getByRole('button', { name: 'Handel erfassen' }));
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0]).toEqual({
    path: '/api/trades',
    body: {
      accountId: DEPOT,
      securityId: SECURITY,
      date: '2026-11-09',
      kind: 'buy',
      unitsE8: 33_944_300,
      amountCents: 10_000,
      feeCents: 100,
      taxCents: 0,
      note: null,
      importKey: 'wpa:1a2b-3c4d',
    },
  });
});

it('leaves unread fields empty, names them and refuses to save a guess', async () => {
  const user = await upload(
    intake(
      { unitsE8: null, feeCents: null, taxCents: null, open: ['units', 'fee', 'tax'] },
      { securityId: null },
    ),
  );
  const read = within(screen.getByRole('region', { name: 'Gelesene Angaben' }));
  expect(read.getAllByText('nicht sicher gelesen')).toHaveLength(3);
  expect(read.getByText(/in der App nicht eindeutig angelegt/)).toBeTruthy();

  await user.click(screen.getByRole('button', { name: 'Weiter' }));
  const dialog = await form();
  await within(dialog).findByLabelText('Stück');
  expect(value(dialog, 'Stück')).toBe('');
  expect(value(dialog, /^Gebühren/)).toBe('');
  expect(value(dialog, /^Einbehaltene Steuer/)).toBe('');
  expect(value(dialog, 'Instrument')).toBe('');
  expect(value(dialog, /^Bruttobetrag/)).toBe('100,00');
  expect(
    within(dialog).getByText(
      `Nicht sicher gelesen und deshalb leer, bitte selbst eintragen: Instrument (ISIN ${ISIN} ist nicht eindeutig angelegt), Stück, Gebühren, Einbehaltene Steuer.`,
    ),
  ).toBeTruthy();

  await user.selectOptions(within(dialog).getByLabelText('Instrument'), SECURITY);
  await user.type(within(dialog).getByLabelText('Stück'), '0,339443');
  await user.click(within(dialog).getByRole('button', { name: 'Handel erfassen' }));
  // Fee and tax are still empty and required: the form does not submit, nothing is written.
  const fee = within(dialog).getByLabelText(/^Gebühren/) as HTMLInputElement;
  expect(fee.required && fee.validity.valueMissing).toBe(true);
  expect(writes).toEqual([]);
  expect(screen.queryByText('Handel erfasst.')).toBeNull();
});

it('reports a confirmation that is already recorded and offers no second trade', async () => {
  await upload(
    intake(
      {},
      { duplicate: { tradeId: 'synthetic-trade', securityId: SECURITY, date: '2026-11-09' } },
    ),
  );
  expect(screen.getByRole('alert').textContent).toContain(
    'Diese Abrechnung ist bereits als Handel vom 09.11.2026 erfasst.',
  );
  expect((screen.getByRole('button', { name: 'Weiter' }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.queryByRole('region', { name: 'Gelesene Angaben' })).toBeNull();
});

it('does not report success when the server answers that the key is already taken', async () => {
  tradeReply = { status: 200, body: { ...tradeReply.body, duplicate: true } };
  const user = await upload(intake());
  await user.click(screen.getByRole('button', { name: 'Weiter' }));
  const dialog = await form();
  await within(dialog).findByLabelText('Stück');
  await user.click(within(dialog).getByRole('button', { name: 'Handel erfassen' }));
  expect(
    await within(dialog).findByText(
      'Diese Abrechnung ist bereits als Handel erfasst. Es wurde nichts gespeichert.',
    ),
  ).toBeTruthy();
  expect(screen.queryByText('Handel erfasst.')).toBeNull();
});

it('confirms a savings plan execution against its open plan month', async () => {
  plans = [
    {
      type: 'savings',
      id: 'savings:synthetic-plan:2026-11',
      kind: 'revision',
      urgent: false,
      planId: 'synthetic-plan',
      month: '2026-11',
      securityId: SECURITY,
      accountId: DEPOT,
      securityName: 'Synthetic Index Fund',
      accountName: 'Muster Depot',
      sourceAccountName: null,
      currency: 'EUR',
      date: '2026-11-10',
      amountCents: 10_000,
    },
  ];
  const user = await upload(intake({ source: 'savings_plan', feeCents: 0 }));
  await user.click(screen.getByRole('button', { name: 'Weiter' }));
  const dialog = await screen.findByRole('dialog', { name: 'Sparplanausführung bestätigen' });
  await within(dialog).findByLabelText('Stück');
  // The printed execution day and quantity replace the planned values.
  expect(value(dialog, 'Handelsdatum')).toBe('09.11.2026');
  expect(value(dialog, 'Stück')).toBe('0,339443');
  await user.click(within(dialog).getByRole('button', { name: 'Ausführung bestätigen' }));
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0]!.path).toBe('/api/savings-plans/synthetic-plan/confirm-execution');
  expect(writes[0]!.body).toMatchObject({
    month: '2026-11',
    date: '2026-11-09',
    unitsE8: 33_944_300,
    amountCents: 10_000,
    feeCents: 0,
  });
});

it('records a savings plan execution as a plain trade when no open plan month fits', async () => {
  const user = await upload(intake({ source: 'savings_plan' }));
  await user.click(screen.getByRole('button', { name: 'Weiter' }));
  const dialog = await form();
  expect(
    await within(dialog).findByText(/Keine eindeutig passende offene Sparplanausführung gefunden/),
  ).toBeTruthy();
});
