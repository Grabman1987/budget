// @vitest-environment jsdom
import { parseStatementText, type StatementAutomationConfig, type StatementAutomationOutcome, type StatementIntakeView } from '@budget/domain';
import { setAmountsHidden, ToastProvider } from '@budget/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AccountRow } from '../ledger/types';
import { AccountStatementIntake } from './statement-review-726';

const CARD = '74100000-0000-4000-8000-000000000301';
const ID = '74100000-0000-4000-8000-000000000302';
const REV = '74100000-0000-4000-8000-000000000303';
const RECEIPT = '74100000-0000-4000-8000-000000000304';
const TOKEN = 'c'.repeat(64), SHA = 'a'.repeat(64), PATH = '/api/statement-intake';
const clients: QueryClient[] = [];
const account: AccountRow = {
  id: CARD, name: 'Musterkarte', type: 'credit_card', role: 'debt', onBudget: true,
  currency: 'EUR', institutionId: null, openingBalanceCents: 0, openingDate: '2030-12-01',
  creditLimitCents: null, overdraftLimitCents: null, interestRateBp: null, termEnd: null,
  monthlyFeeCents: null, interestKind: null, installmentCents: null, termStart: null,
  originalAmountCents: null, sortOrder: 1, closedAt: null, note: null, balanceCents: -17000,
  clearedCents: 0, unclearedCents: -17000, scheduledCents: 0, holdingsCents: null,
  valueEurCents: -17000, missingFxCurrencies: [], missingPriceSecurityIds: [],
  bookingCount: 2, pendingCount: 2, lastReconciledOn: null,
};
const intake = (): StatementIntakeView => ({
  id: ID, accountId: CARD, receiptId: RECEIPT, sha256: SHA, revision: REV, status: 'pending',
  proposal: parseStatementText('Rechnungsnummer SYNTHETIC-741\nRechnungsdatum 04.01.2031\nAbrechnungsbetrag 170,00 EUR\nEinzugsdatum 12.01.2031', SHA),
  reviewed: null, createdAt: '2031-01-10T12:00:00Z', updatedAt: '2031-01-10T12:00:00Z', deletedAt: null,
});
const config = (): StatementAutomationConfig => ({
  accountId: CARD, enabled: false, revision: REV, mappingKey: 'synthetic-mapping',
  mappedCards: [], scheduledPayment: null,
});
const outcome = (status: StatementAutomationOutcome['status'] = 'saved'): StatementAutomationOutcome => ({
  intakeId: ID, runId: 'synthetic-run', groupId: null, status, created: 1, matched: 0,
  credits: 0, receiptLinks: 3, pending: [], reasons: [], suggestedCardTokens: [TOKEN],
  suggestedCardHints: [{ token: TOKEN, hint: '****1111' }],
  items: [{ bookingId: 'synthetic-expense', accountId: CARD, role: 'created' },
    { bookingId: 'synthetic-transfer', accountId: CARD, role: 'settlement' }],
});
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'content-type': 'application/json' },
});
type Call = { method: string; path: string; body: unknown };
function transport(result = outcome(), options: { existing?: boolean; saveConflict?: boolean } = {}) {
  const calls: Call[] = [], view = intake();
  let current = config();
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost'), method = init?.method ?? 'GET';
    const body: unknown = init?.body instanceof FormData ? init.body : init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, path: url.pathname, body });
    if (url.pathname === '/api/accounts') return json({ accounts: [account], asOf: '2031-01-10',
      netWorthEurCents: -17000, missingFxCurrencies: [], missingPriceSecurityIds: [] });
    if (url.pathname === '/api/expected') return json({ payments: [] });
    if (url.pathname === '/api/statement-settlements') return json({ config: null, settlements: [], bonuses: [] });
    if (url.pathname === PATH + '/automation/config') {
      if (method === 'PUT') {
        if (options.saveConflict) return json({ error: 'conflict', message: 'Zuordnung wurde geändert. Bitte neu laden.' }, 409);
        const input = body as { enabled: boolean; mappedCards: StatementAutomationConfig['mappedCards']; scheduledPayment: StatementAutomationConfig['scheduledPayment'] };
        current = { ...current, ...input };
        return json({ config: current, groupId: 'synthetic-config-group' });
      }
      return json({ config: current });
    }
    if (url.pathname === PATH && method === 'GET') return json({ intakes: options.existing === false ? [] : [view] });
    if (url.pathname === PATH + '/upload') return json({ intake: view, duplicate: false, groupId: null, automation: result }, 201);
    if (url.pathname === `${PATH}/${ID}/automation`) return json({ automation: result });
    if (url.pathname === `${PATH}/${ID}/automate`) return json({ intake: view, groupId: null, automation: result });
    if (url.pathname === `${PATH}/${ID}`) return json({ intake: view });
    return json({ error: 'unexpected', message: 'Unexpected synthetic endpoint' }, 500);
  });
  return calls;
}
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  const root = createRootRoute({ component: Outlet });
  const route = createRoute({ getParentRoute: () => root, path: '/konten/$id',
    component: () => <AccountStatementIntake accountId={CARD} /> });
  const router = createRouter({ routeTree: root.addChildren([route]),
    history: createMemoryHistory({ initialEntries: [`/konten/${CARD}`] }) });
  render(<QueryClientProvider client={client}><ToastProvider><RouterProvider router={router} /></ToastProvider></QueryClientProvider>);
}
async function chooser() {
  const button = await screen.findByRole('button', { name: 'Abrechnung hochladen' });
  await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false));
  await userEvent.click(button);
  return screen.getByLabelText('Abrechnungs-PDF auswählen');
}
async function openExisting() {
  await chooser();
  await userEvent.click(await screen.findByText('Abrechnungen · 1'));
  await userEvent.click(await screen.findByRole('button', { name: /SYNTHETIC-741/ }));
  await screen.findByRole('dialog', { name: 'Abrechnung prüfen' });
  await screen.findByRole('region', { name: 'Automatisches Verarbeitungsergebnis' });
}
beforeEach(() => {
  vi.stubGlobal('matchMedia', (media: string) => ({ matches: false, media, onchange: null,
    addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn() }));
  vi.spyOn(window, 'confirm').mockReturnValue(false);
  if (!HTMLDialogElement.prototype.showModal) HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  if (!HTMLDialogElement.prototype.close) HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(() => {
  cleanup(); clients.splice(0).forEach((c) => c.clear()); setAmountsHidden(false);
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});

it('explicitly requests eligible automation for the selected account without sending a parsed financial plan', async () => {
  const calls = transport(outcome(), { existing: false }); mount();
  const picker = await chooser();
  await userEvent.upload(picker, new File(['%PDF- synthetic transport fixture'], 'synthetic-741.pdf', { type: 'application/pdf' }));
  await screen.findByRole('region', { name: 'Automatisches Verarbeitungsergebnis' });
  const uploads = calls.filter((c) => c.method === 'POST');
  expect(uploads).toHaveLength(1);
  expect(uploads[0]!.path).toBe(PATH + '/upload');
  const body = uploads[0]!.body as FormData;
  expect([...body.keys()].sort()).toEqual(['accountId', 'automation', 'file']);
  expect(body.get('accountId')).toBe(CARD);
  expect(body.get('automation')).toBe('eligible');
  expect((body.get('file') as File).name).toBe('synthetic-741.pdf');
});

it('shows actual linked booking routes and distinguishes validation from bank confirmation', async () => {
  transport(); mount(); await openExisting();
  const result = screen.getByRole('region', { name: 'Automatisches Verarbeitungsergebnis' });
  expect(within(result).getByRole('link', { name: 'Neue Buchung' }).getAttribute('href'))
    .toBe(`/konten/buchungen?konto=${CARD}&buchung=synthetic-expense`);
  expect(within(result).getByRole('link', { name: 'Abrechnungsausgleich' }).getAttribute('href'))
    .toBe(`/konten/buchungen?konto=${CARD}&buchung=synthetic-transfer`);
  expect(within(result).getByText('Automatische Validierung ist keine Bestätigung einer tatsächlich ausgeführten Bankzahlung.')).toBeTruthy();
});

it.each(['unchanged', 'undone'] as const)('labels %s counts as historical and never promises a new posting', async (status) => {
  transport(outcome(status)); mount(); await openExisting();
  const result = screen.getByRole('region', { name: 'Automatisches Verarbeitungsergebnis' });
  expect(within(result).getByText(/Historisches Verarbeitungsergebnis/)).toBeTruthy();
  if (status === 'undone') {
    expect(within(result).queryAllByRole('link')).toHaveLength(0);
    expect(within(result).getByText(/Sie wird nicht erneut ausgeführt/)).toBeTruthy();
  } else expect(within(result).getByText(/keine automatische Aktion wiederholt/)).toBeTruthy();
});

it('leaves ambiguous parts visibly pending while retaining links to independently saved items', async () => {
  transport({ ...outcome('review'), pending: [{ rowKey: 'synthetic-row', line: 8, reason: 'multiple_existing_matches' }],
    reasons: ['previous_source_required'] });
  mount(); await openExisting();
  const result = screen.getByRole('region', { name: 'Automatisches Verarbeitungsergebnis' });
  expect(within(result).getByText('Teilweise oder noch nicht verarbeitet: Bitte prüfen.')).toBeTruthy();
  expect(within(result).getByText('Die vorherige Abrechnung wird für Jahr und Saldo benötigt.')).toBeTruthy();
  expect(within(result).getByText('Dieser Teil ist nicht eindeutig belegt und bleibt zur Prüfung offen.')).toBeTruthy();
  expect(within(result).getAllByRole('link')).toHaveLength(2);
});

it('requires explicit mapping and recurring choice, then submits the captured configuration revision', async () => {
  const calls = transport(); mount(); await openExisting();
  await userEvent.click(screen.getByText('Automatische Verarbeitung einrichten'));
  await userEvent.click(await screen.findByRole('button', { name: 'Einrichtung bearbeiten' }));
  await userEvent.click(screen.getByRole('checkbox', { name: 'Eindeutige neue Uploads automatisch verarbeiten' }));
  await userEvent.selectOptions(screen.getByLabelText('Bestehende wiederkehrende Abbuchung'), 'none');
  await userEvent.click(screen.getByRole('button', { name: 'Zuordnung hinzufügen' }));
  await userEvent.selectOptions(screen.getByLabelText('Erkannte Karte 1'), TOKEN);
  await userEvent.selectOptions(screen.getByLabelText('Zugehöriges Konto 1'), CARD);
  expect(screen.getByRole('button', { name: 'Gespeichertes PDF automatisch prüfen' }).hasAttribute('disabled')).toBe(true);
  await userEvent.click(screen.getByRole('button', { name: 'Einrichtung speichern' }));
  await waitFor(() => expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(1));
  expect(calls.find((c) => c.method === 'PUT')!.body).toEqual({ accountId: CARD, expectedRevision: REV,
    enabled: true, scheduledPayment: { mode: 'none' }, mappedCards: [{ token: TOKEN, accountId: CARD }] });
  expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);
});

it('preserves an unsaved configuration after a stale-save rejection and never auto-submits it again', async () => {
  const calls = transport(outcome(), { saveConflict: true }); mount(); await openExisting();
  await userEvent.click(screen.getByText('Automatische Verarbeitung einrichten'));
  await userEvent.click(await screen.findByRole('button', { name: 'Einrichtung bearbeiten' }));
  const enabled = screen.getByRole('checkbox', { name: 'Eindeutige neue Uploads automatisch verarbeiten' }) as HTMLInputElement;
  await userEvent.click(enabled);
  await userEvent.click(screen.getByRole('button', { name: 'Einrichtung speichern' }));
  await screen.findByText(/Zuordnung wurde geändert/);
  expect(enabled.checked).toBe(true);
  expect(screen.getByRole('button', { name: 'Gespeichertes PDF automatisch prüfen' }).hasAttribute('disabled')).toBe(true);
  expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(1);
  expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);
});
