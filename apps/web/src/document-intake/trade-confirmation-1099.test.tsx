// @vitest-environment jsdom
// Lazy chunk resolved from the module cache, so the dialog opens within the test's wait.
import './document-upload-flow';
import type { ReactNode } from 'react';
import type * as Router from '@tanstack/react-router';
import type { TradeConfirmationIntake } from '@budget/domain';
import { ToastProvider } from '@budget/ui';
import { cleanup, configure, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DocumentUploadButton, type Classification } from './document-upload';

// The upload flow is a lazy chunk: allow its first render more than the default second.
configure({ asyncUtilTimeout: 5000 });

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
    settlementHint: '1234',
    open: [],
    unchecked: false,
    ...proposal,
  },
  securityId: SECURITY,
  importKey: 'wpa:1a2b-3c4d',
  duplicate: null,
  probableDuplicate: null,
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
let byName: Record<string, Classification> = {};
let plans: unknown[];
let writes: { path: string; body: Record<string, unknown> }[];
let depotReference: string | null = null;
let tradeReply: { status: number; body: Record<string, unknown> };
beforeEach(() => {
  plans = [];
  byName = {};
  writes = [];
  depotReference = null;
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
    if (path === '/api/document-intake/classify') {
      // Batch uploads (#1130): the answer may depend on the file name.
      const sent = (init?.body as FormData | undefined)?.get('file');
      const name = sent instanceof File ? sent.name : '';
      return Response.json(byName[name] ?? result);
    }
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
            referenceAccountId: depotReference,
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
    await screen.findByLabelText('Dokument auswählen'),
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
  const read = within(await screen.findByRole('region', { name: 'Gelesene Angaben' }));
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
  const read = within(await screen.findByRole('region', { name: 'Gelesene Angaben' }));
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

it('offers no counter booking by default and writes none', async () => {
  const user = await upload(intake());
  await user.click(screen.getByRole('button', { name: 'Weiter' }));
  const dialog = await form();
  await within(dialog).findByLabelText('Stück');
  expect(value(dialog, /^Verrechnungskonto/)).toBe('');
  expect(
    within(dialog).getByText(
      'Ohne Auswahl entsteht nur der Handel, das Verrechnungskonto bleibt unverändert.',
    ),
  ).toBeTruthy();
  expect(within(dialog).getByText(/Konto mit Endung 1234/)).toBeTruthy();
  await user.click(within(dialog).getByRole('button', { name: 'Handel erfassen' }));
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0]!.body).not.toHaveProperty('settlementAccountId');
});

it('sends the chosen settlement account and names the transfer before confirming', async () => {
  tradeReply = { status: 201, body: { ...tradeReply.body, transferId: 'synthetic-transfer' } };
  const user = await upload(intake());
  await user.click(screen.getByRole('button', { name: 'Weiter' }));
  const dialog = await form();
  await within(dialog).findByLabelText('Stück');
  await user.selectOptions(within(dialog).getByLabelText(/^Verrechnungskonto/), 'synthetic-giro');
  expect(
    within(dialog).getByText(/Umbuchung über 101,00 € von Muster Giro; Rückgängig nimmt Handel/),
  ).toBeTruthy();
  expect(writes).toEqual([]);
  await user.click(within(dialog).getByRole('button', { name: 'Handel erfassen' }));
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0]!.body).toMatchObject({
    importKey: 'wpa:1a2b-3c4d',
    settlementAccountId: 'synthetic-giro',
  });
});

it('preselects the Verrechnungskonto stored on the depot and points a sale to it', async () => {
  depotReference = 'synthetic-giro';
  const user = await upload(
    intake({ source: 'sell', kind: 'sell', amountCents: 50_000, feeCents: 100, taxCents: 0 }),
  );
  await user.click(screen.getByRole('button', { name: 'Weiter' }));
  const dialog = await form();
  await within(dialog).findByLabelText('Stück');
  expect(value(dialog, /^Verrechnungskonto/)).toBe('synthetic-giro');
  expect(within(dialog).getByText(/Umbuchung über 499,00 € auf Muster Giro/)).toBeTruthy();
});

it('sends the settlement account with a savings plan confirmation', async () => {
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
  await user.selectOptions(within(dialog).getByLabelText(/^Verrechnungskonto/), 'synthetic-giro');
  await user.click(within(dialog).getByRole('button', { name: 'Ausführung bestätigen' }));
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0]!.body).toMatchObject({
    importKey: 'wpa:1a2b-3c4d',
    settlementAccountId: 'synthetic-giro',
  });
});

it('warns about a probable duplicate and books only after an explicit confirmation', async () => {
  const user = await upload(
    intake(
      {},
      {
        probableDuplicate: { tradeId: 'synthetic-trade', securityId: SECURITY, date: '2026-11-09' },
      },
    ),
  );
  const read = within(await screen.findByRole('region', { name: 'Gelesene Angaben' }));
  expect(read.getByRole('alert').textContent).toContain('Möglicherweise schon erfasst');
  // The upload still offers "Weiter": it is a warning, not a block.
  await user.click(screen.getByRole('button', { name: 'Weiter' }));
  const dialog = await form();
  await within(dialog).findByLabelText('Stück');
  const submit = within(dialog).getByRole('button', {
    name: 'Handel erfassen',
  }) as HTMLButtonElement;
  expect(submit.disabled).toBe(true);
  await user.click(submit);
  expect(writes).toEqual([]);
  await user.click(within(dialog).getByLabelText('Trotzdem als weiteren Handel erfassen'));
  expect(submit.disabled).toBe(false);
  await user.click(submit);
  await waitFor(() => expect(writes).toHaveLength(1));
});

it('keeps a trade confirmation entry independent of the other files of a batch', async () => {
  byName = {
    'receipt.pdf': {
      type: 'receipt',
      confidence: 'unknown',
      hints: { mime: 'application/pdf' },
      needsPassword: false,
    },
  };
  result = classified(intake());
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <DocumentUploadButton />
      </ToastProvider>
    </QueryClientProvider>,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Dokument hochladen' }));
  await user.upload(await screen.findByLabelText('Dokument auswählen'), [
    new File(['%PDF-1.7'], 'abrechnung.pdf', { type: 'application/pdf' }),
    new File(['%PDF-1.7'], 'receipt.pdf', { type: 'application/pdf' }),
  ]);
  const trade = await screen.findByRole('region', { name: 'abrechnung.pdf' });
  const other = await screen.findByRole('region', { name: 'receipt.pdf' });
  await within(trade).findByText('Erkannt: Wertpapierabrechnung');
  await within(other).findByText(/Erkannt: Beleg/);
  // The proposal renders inside its own entry only.
  expect(within(trade).getByRole('region', { name: 'Gelesene Angaben' })).toBeTruthy();
  expect(within(other).queryByRole('region', { name: 'Gelesene Angaben' })).toBeNull();
  await user.click(within(trade).getByRole('button', { name: 'Weiter' }));
  const dialog = await form();
  await within(dialog).findByLabelText('Stück');
  expect(writes).toEqual([]);
  // Saving finishes only the trade entry; the receipt entry stays.
  await user.click(within(dialog).getByRole('button', { name: 'Handel erfassen' }));
  await waitFor(() => expect(writes).toHaveLength(1));
  await within(trade).findByText(
    'Handel aus der Abrechnung erfasst. Er steht im Handelsverlauf des Instruments.',
  );
  expect(screen.getByRole('region', { name: 'receipt.pdf' })).toBeTruthy();
});
