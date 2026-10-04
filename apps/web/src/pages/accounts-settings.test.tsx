// @vitest-environment jsdom
import { ToastProvider } from '@budget/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccountRow } from '../ledger/types';
import { AccountsSettings } from './accounts-settings';

const account = (over: Partial<AccountRow>): AccountRow => ({
  id: 'a',
  name: 'Konto',
  type: 'checking',
  role: 'budget',
  onBudget: true,
  currency: 'EUR',
  institutionId: null,
  openingBalanceCents: 0,
  openingDate: '2026-01-01',
  creditLimitCents: null,
  overdraftLimitCents: null,
  interestRateBp: null,
  termEnd: null,
  monthlyFeeCents: null,
  interestKind: null,
  installmentCents: null,
  termStart: null,
  originalAmountCents: null,
  sortOrder: 1,
  closedAt: null,
  note: null,
  balanceCents: 0,
  clearedCents: 0,
  unclearedCents: 0,
  scheduledCents: 0,
  holdingsCents: 0,
  valueEurCents: 0,
  missingFxCurrencies: [],
  missingPriceSecurityIds: [],
  bookingCount: 0,
  pendingCount: 0,
  lastReconciledOn: null,
  ...over,
});

const ACCOUNTS: AccountRow[] = [
  account({ id: 'giro', name: 'Giro Muster', sortOrder: 1 }),
  account({ id: 'spar', name: 'Tagesgeld Muster', type: 'savings', sortOrder: 2 }),
  account({
    id: 'kredit',
    name: 'Kredit Muster',
    type: 'loan',
    role: 'debt',
    onBudget: false,
    sortOrder: 3,
    interestRateBp: 632,
    interestKind: 'fixed',
    installmentCents: 41_200,
    termStart: '2024-01-01',
    termEnd: '2034-01-01',
    originalAmountCents: 2_000_000,
  }),
  account({ id: 'alt', name: 'Altes Konto', sortOrder: 4, closedAt: '2026-05-01T00:00:00.000Z' }),
];

interface Call {
  method: string;
  path: string;
  body: unknown;
}
let calls: Call[];
let closeBlocked: boolean;

beforeEach(() => {
  calls = [];
  closeBlocked = false;
  HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
  // jsdom has no CSS.escape (the reorder controls look their buttons up with it).
  vi.stubGlobal('CSS', { escape: (value: string) => value });
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      const body = init.body ? (JSON.parse(String(init.body)) as unknown) : undefined;
      calls.push({ method, path, body });
      const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
      if (method === 'GET' && path.startsWith('/api/accounts'))
        return json({
          asOf: '2026-10-03',
          accounts: ACCOUNTS,
          netWorthEurCents: 0,
          missingFxCurrencies: [],
          missingPriceSecurityIds: [],
        });
      if (path.endsWith('/close') && closeBlocked && !(body as { force: boolean }).force)
        return json({ error: 'account_not_empty', message: 'Only an empty account closes' }, 409);
      return json({ account: ACCOUNTS[0], order: [], groupId: 'grp' });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function page() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <AccountsSettings />
      </ToastProvider>
    </QueryClientProvider>,
  );
}
const writes = () => calls.filter((c) => c.method !== 'GET');

describe('Einstellungen › Konten', () => {
  it('lists the accounts grouped like the sidebar, closed ones apart, with loan terms', async () => {
    page();
    await screen.findByText('Giro Muster');
    expect(screen.getByRole('heading', { name: /Budget-Konten/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Kredite/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Geschlossene Konten/ })).toBeTruthy();
    const loans = screen.getByRole('heading', { name: /Kredite/ }).closest('section')!;
    expect(loans.textContent).toContain('6,32 % fix');
    expect(loans.textContent).toContain('Rate 412,00 €');
    const closed = screen.getByRole('heading', { name: /Geschlossene Konten/ }).closest('section')!;
    expect(within(closed).getByText('Altes Konto')).toBeTruthy();
  });

  it('saves only the changed loan terms in one PATCH', async () => {
    page();
    await userEvent.click(await screen.findByRole('button', { name: 'Kredit Muster bearbeiten' }));
    const installment = await screen.findByLabelText('Monatsrate');
    expect((installment as HTMLInputElement).value).toBe('412,00');
    expect((screen.getByLabelText('Zinsart') as HTMLSelectElement).value).toBe('fixed');
    expect((screen.getByLabelText('Zinssatz in Prozent') as HTMLInputElement).value).toBe('6,32');
    await userEvent.clear(installment);
    await userEvent.type(installment, '450');
    await userEvent.selectOptions(screen.getByLabelText('Zinsart'), 'variable');
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await screen.findByText('Konto „Kredit Muster“ gespeichert.');
    expect(writes()).toEqual([
      {
        method: 'PATCH',
        path: '/api/accounts/kredit',
        body: { interestKind: 'variable', installmentCents: 45_000 },
      },
    ]);
  });

  it('clears a term with an empty field and refuses a term end before its start', async () => {
    page();
    await userEvent.click(await screen.findByRole('button', { name: 'Kredit Muster bearbeiten' }));
    const end = await screen.findByLabelText('Laufzeit bis');
    await userEvent.clear(end);
    await userEvent.type(end, '2020-01-01');
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(await screen.findByText('Das Laufzeitende liegt vor dem Beginn.')).toBeTruthy();
    expect(writes()).toEqual([]);
    await userEvent.clear(end);
    await userEvent.clear(screen.getByLabelText('Monatsrate'));
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await screen.findByText('Konto „Kredit Muster“ gespeichert.');
    expect(writes()[0]!.body).toEqual({ termEnd: null, installmentCents: null });
  });

  it('renames and retypes with an explicit budget flag', async () => {
    page();
    await userEvent.click(await screen.findByRole('button', { name: 'Giro Muster bearbeiten' }));
    const name = await screen.findByLabelText('Name');
    await userEvent.clear(name);
    await userEvent.type(name, 'Konto neu');
    await userEvent.selectOptions(screen.getByLabelText('Kontotyp'), 'loan');
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await screen.findByText('Konto „Konto neu“ gespeichert.');
    expect(writes()[0]).toMatchObject({
      method: 'PATCH',
      path: '/api/accounts/giro',
      body: { name: 'Konto neu', type: 'loan', onBudget: false },
    });
  });

  it('closes an empty account, asks before forcing a non-empty one, and reopens', async () => {
    closeBlocked = true;
    page();
    await userEvent.click(await screen.findByRole('button', { name: 'Giro Muster bearbeiten' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Konto schließen' }));
    expect(await screen.findByText(/Trotzdem schließen\?/)).toBeTruthy();
    expect(writes().map((w) => [w.path, w.body])).toEqual([
      ['/api/accounts/giro/close', { force: false }],
    ]);
    await userEvent.click(screen.getByRole('button', { name: 'Trotzdem schließen' }));
    await screen.findByText('Konto „Giro Muster“ geschlossen.');
    expect(writes().map((w) => [w.path, w.body])).toEqual([
      ['/api/accounts/giro/close', { force: false }],
      ['/api/accounts/giro/close', { force: true }],
    ]);
    await userEvent.click(screen.getByRole('button', { name: 'Altes Konto wieder öffnen' }));
    await screen.findByText('Konto „Altes Konto“ wieder geöffnet.');
    expect(writes().at(-1)).toMatchObject({ method: 'POST', path: '/api/accounts/alt/reopen' });
  });

  it('moves an account within its group as one order write', async () => {
    page();
    await userEvent.click(await screen.findByRole('button', { name: 'Giro Muster nach unten' }));
    await screen.findByText('Reihenfolge der Konten gespeichert.');
    expect(writes()[0]).toMatchObject({
      method: 'PATCH',
      path: '/api/accounts/order',
      body: { ids: ['spar', 'giro', 'kredit', 'alt'] },
    });
  });
});
