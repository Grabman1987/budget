// @vitest-environment jsdom
import { type StatementFacts, type StatementField, type StatementIntakeView } from '@budget/domain';
import { setAmountsHidden, ToastProvider } from '@budget/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AccountRow } from '../ledger/types';
import { AccountStatementIntake } from './statement-review-726';

const A = '72600000-0000-4000-8000-000000000001';
const B = '72600000-0000-4000-8000-000000000002';
const ID = '72600000-0000-4000-8000-000000000003';
const RECEIPT = '72600000-0000-4000-8000-000000000004';
const HASH = 'a'.repeat(64),
  REV = '72600000-0000-4000-8000-000000000005';
const PATH = '/api/statement-intake';
const clients: QueryClient[] = [];
const account = (id: string): AccountRow => ({
  id,
  name: 'Konto Muster',
  type: 'credit_card',
  role: 'debt',
  onBudget: true,
  currency: 'EUR',
  institutionId: null,
  openingBalanceCents: -13_000,
  openingDate: '2026-10-01',
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
  balanceCents: -13_000,
  clearedCents: -13_000,
  unclearedCents: 0,
  scheduledCents: 0,
  holdingsCents: null,
  valueEurCents: -13_000,
  missingFxCurrencies: [],
  missingPriceSecurityIds: [],
  bookingCount: 0,
  pendingCount: 0,
  lastReconciledOn: null,
});
const field = <T extends string | number>(value: T | null): StatementField<T> => ({
  value,
  candidates: value === null ? [] : [value],
  origin: value === null ? 'unavailable' : 'printed',
  evidence: {
    page: null,
    line: value === null ? null : 2,
    label: value === null ? null : 'synthetic_label',
  },
});
function intake(): StatementIntakeView {
  return {
    id: ID,
    accountId: A,
    receiptId: RECEIPT,
    sha256: HASH,
    status: 'pending',
    revision: REV,
    proposal: {
      schemaVersion: 1,
      parserVersion: 1,
      sha256: HASH,
      extraction: 'parsed',
      fields: {
        reference: field('SYN-726'),
        issueDate: field('2026-10-01'),
        periodFrom: field('2026-09-01'),
        periodTo: field('2026-09-30'),
        payableCents: field(12_000),
        currency: field('EUR'),
        debitDate: field<string>(null),
        accountHint: field<string>(null),
      },
      warnings: ['debit_date_required'],
      relatedIntakeIds: [],
    },
    reviewed: null,
    createdAt: '2026-10-20T10:00:00Z',
    updatedAt: '2026-10-20T10:00:00Z',
    deletedAt: null,
  };
}
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
type Call = { method: string; path: string; body: unknown };
function transport(reply: (url: URL, init?: RequestInit) => Response | Promise<Response>) {
  const calls: Call[] = [];
  vi.stubGlobal('fetch', async (path: string, init?: RequestInit) => {
    const url = new URL(String(path), 'http://localhost');
    calls.push({
      method: init?.method ?? 'GET',
      path: url.pathname + url.search,
      body:
        init?.body instanceof FormData
          ? init.body
          : init?.body
            ? (JSON.parse(String(init.body)) as unknown)
            : undefined,
    });
    if (url.pathname === '/api/accounts') return json({ accounts: [account(A), account(B)] });
    return reply(url, init);
  });
  return calls;
}
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  const root = createRootRoute({ component: Outlet });
  const route = createRoute({
    getParentRoute: () => root,
    path: '/konten/$id',
    component: () => {
      const { id } = route.useParams();
      return <AccountStatementIntake accountId={id} />;
    },
  });
  const router = createRouter({
    routeTree: root.addChildren([route]),
    history: createMemoryHistory({ initialEntries: [`/konten/${A}`] }),
  });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { router, client };
}
const file = () =>
  new File(['%PDF-1.7 synthetic statement only'], 'synthetic-726.pdf', { type: 'application/pdf' });
const chooser = async () => {
  const opener = await screen.findByRole('button', { name: 'Abrechnung hochladen' });
  await waitFor(() => expect(opener.getAttribute('disabled')).toBeNull());
  await userEvent.click(opener);
  return screen.getByLabelText('Abrechnungs-PDF auswählen');
};
async function openExisting() {
  await chooser();
  const history = await screen.findByText('Abrechnungen · 1');
  await userEvent.click(history);
  await userEvent.click(await screen.findByRole('button', { name: /SYN-726/ }));
  await screen.findByRole('dialog', { name: 'Abrechnung prüfen' });
  await screen.findByLabelText('Abrechnungsbetrag');
}
beforeEach(() => {
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: false,
    media,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  vi.spyOn(window, 'confirm').mockReturnValue(false);
  if (!HTMLDialogElement.prototype.showModal)
    HTMLDialogElement.prototype.showModal = function () {
      this.setAttribute('open', '');
    };
  if (!HTMLDialogElement.prototype.close)
    HTMLDialogElement.prototype.close = function () {
      this.removeAttribute('open');
    };
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  setAmountsHidden(false);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('keeps an empty account compact and uploads exactly one document for its actual account UUID', async () => {
  const view = intake();
  const calls = transport((url) =>
    url.pathname === PATH + '/upload'
      ? json({ intake: view, duplicate: false, groupId: 'document-only' }, 201)
      : json({ intakes: [] }),
  );
  mount();
  await waitFor(() =>
    expect(calls.some((call) => call.path === `${PATH}?accountId=${A}`)).toBe(true),
  );
  expect(screen.queryByText(/Abrechnungen ·/)).toBeNull();
  const input = await chooser();
  await userEvent.upload(input, file());
  await screen.findByRole('dialog', { name: 'Abrechnung prüfen' });
  const uploads = calls.filter((call) => call.method === 'POST');
  expect(uploads).toHaveLength(1);
  expect(uploads[0]?.path).toBe(PATH + '/upload');
  expect(uploads[0]?.body).toBeInstanceOf(FormData);
  const body = uploads[0]!.body as FormData;
  expect([...body.keys()].sort()).toEqual(['accountId', 'file']);
  expect(body.get('accountId')).toBe(A);
  expect((body.get('file') as File).name).toBe('synthetic-726.pdf');
  expect(calls.every((call) => call.path === '/api/accounts' || call.path.startsWith(PATH))).toBe(
    true,
  );
});

it('leaves the debit date unknown until explicit entry and submits literal document facts without a payment', async () => {
  let view = intake();
  const facts: StatementFacts = {
    reference: 'SYN-726',
    issueDate: '2026-10-01',
    periodFrom: '2026-09-01',
    periodTo: '2026-09-30',
    payableCents: 12_000,
    currency: 'EUR',
    debitDate: '2026-10-05',
    accountHint: null,
  };
  const calls = transport((url, init) => {
    if (init?.method === 'PUT') {
      view = {
        ...view,
        status: 'reviewed',
        revision: 'next-revision',
        reviewed: {
          fields: {
            ...view.proposal.fields,
            debitDate: { ...field('2026-10-05'), origin: 'owner' },
          },
        },
      };
      return json({ intake: view, groupId: 'document-review-only' });
    }
    return json(url.pathname === PATH ? { intakes: [view] } : { intake: view });
  });
  mount();
  await openExisting();
  expect((screen.getByLabelText('Ausstellungsdatum') as HTMLInputElement).value).toBe('01.10.2026');
  const debit = screen.getByLabelText('Einzugsdatum') as HTMLInputElement;
  expect(debit.type).toBe('text');
  expect(debit.inputMode).toBe('text');
  expect(debit.placeholder).toBe('TT.MM.JJJJ');
  for (const name of ['Ausstellungsdatum', 'Zeitraum von', 'Zeitraum bis']) {
    expect((screen.getByLabelText(name) as HTMLInputElement).inputMode).toBe('text');
  }
  expect(debit.value).toBe('');
  expect(
    screen.getByRole('button', { name: 'Als geprüft speichern' }).getAttribute('disabled'),
  ).not.toBeNull();
  await userEvent.type(debit, '31.02.2026');
  expect(debit.value).toBe('31.02.2026');
  expect(
    screen.getByRole('button', { name: 'Als geprüft speichern' }).getAttribute('disabled'),
  ).not.toBeNull();
  expect(
    screen.getByRole('button', { name: 'Entwurf speichern' }).getAttribute('disabled'),
  ).not.toBeNull();
  expect(calls.filter((call) => call.method !== 'GET')).toEqual([]);
  await userEvent.clear(debit);
  await userEvent.type(debit, '05.10.');
  expect(debit.value).toBe('05.10.');
  expect(
    screen.getByRole('button', { name: 'Als geprüft speichern' }).getAttribute('disabled'),
  ).not.toBeNull();
  await userEvent.type(debit, '2026');
  await userEvent.click(screen.getByRole('button', { name: 'Als geprüft speichern' }));
  await waitFor(() =>
    expect(calls.filter((call) => call.method === 'PUT')).toEqual([
      {
        method: 'PUT',
        path: `${PATH}/${ID}/review`,
        body: { revision: REV, sha256: HASH, accountId: A, facts },
      },
    ]),
  );
  expect(calls.filter((call) => call.method !== 'GET')).toHaveLength(1);
  expect(calls.every((call) => call.path === '/api/accounts' || call.path.startsWith(PATH))).toBe(
    true,
  );
});

it('protects busy upload and dirty edits during close/account navigation without moving a draft to an equal-name account', async () => {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const view = intake();
  const calls = transport(async (url) => {
    if (url.pathname === PATH + '/upload') {
      await gate;
      return json({ intake: view, groupId: 'upload' });
    }
    return json({ intakes: [] });
  });
  const { router } = mount();
  await userEvent.upload(await chooser(), file());
  await userEvent.click(screen.getByRole('button', { name: 'Schließen' }));
  expect(screen.getByRole('dialog', { name: 'Abrechnung hochladen' })).toBeTruthy();
  await act(async () => {
    void router.navigate({ to: '/konten/$id', params: { id: B } });
  });
  expect(router.state.location.pathname).toBe(`/konten/${A}`);
  await act(async () => {
    release();
    await gate;
  });
  await screen.findByLabelText('Abrechnungsnummer');
  await userEvent.type(screen.getByLabelText('Abrechnungsnummer'), '-EDIT');
  await userEvent.click(screen.getByRole('button', { name: 'Schließen' }));
  expect(screen.getByRole('dialog', { name: 'Abrechnung prüfen' })).toBeTruthy();
  await act(async () => {
    void router.navigate({ to: '/konten/$id', params: { id: B } });
  });
  expect(router.state.location.pathname).toBe(`/konten/${A}`);
  vi.mocked(window.confirm).mockReturnValue(true);
  await act(async () => {
    void router.navigate({ to: '/konten/$id', params: { id: B } });
  });
  await waitFor(() => expect(router.state.location.pathname).toBe(`/konten/${B}`));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(calls.filter((call) => call.method !== 'GET')).toHaveLength(1);
});

it('retains a manual draft after stale CAS and only reloads after explicit discard', async () => {
  const view = intake();
  const calls = transport((url, init) =>
    init?.method === 'PUT'
      ? json({ error: 'conflict', message: 'synthetic stale revision' }, 409)
      : json(url.pathname === PATH ? { intakes: [view] } : { intake: view }),
  );
  mount();
  await openExisting();
  await userEvent.type(screen.getByLabelText('Einzugsdatum'), '05.10.2026');
  await userEvent.click(screen.getByRole('button', { name: 'Entwurf speichern' }));
  await screen.findByText(/Ihre Angaben bleiben erhalten/);
  expect((screen.getByLabelText('Einzugsdatum') as HTMLInputElement).value).toBe('05.10.2026');
  expect(
    screen.getByRole('button', { name: 'Entwurf speichern' }).getAttribute('disabled'),
  ).not.toBeNull();
  const reads = calls.filter((call) => call.path === `${PATH}/${ID}`).length;
  await userEvent.click(screen.getAllByRole('button', { name: 'Stand neu laden' })[0]!);
  expect(calls.filter((call) => call.path === `${PATH}/${ID}`)).toHaveLength(reads);
  expect((screen.getByLabelText('Einzugsdatum') as HTMLInputElement).value).toBe('05.10.2026');
  vi.mocked(window.confirm).mockReturnValue(true);
  await userEvent.click(screen.getAllByRole('button', { name: 'Stand neu laden' })[0]!);
  await waitFor(() =>
    expect((screen.getByLabelText('Einzugsdatum') as HTMLInputElement).value).toBe(''),
  );
  expect(calls.filter((call) => call.method !== 'GET')).toHaveLength(1);
});

it('keeps duplicate-account errors local, clears request passwords and never opens a foreign intake', async () => {
  const calls = transport((url) =>
    url.pathname === PATH + '/upload'
      ? json({ error: 'conflict', message: 'PDF already belongs to another account' }, 409)
      : json({ intakes: [] }),
  );
  mount();
  const input = await chooser();
  await userEvent.type(screen.getByLabelText('PDF-Passwort (optional)'), 'synthetic-password');
  await userEvent.upload(input, file());
  await screen.findByText(/Ihre Angaben bleiben erhalten/);
  expect(screen.queryByRole('dialog', { name: 'Abrechnung prüfen' })).toBeNull();
  expect((screen.getByLabelText('PDF-Passwort (optional)') as HTMLInputElement).value).toBe('');
  const upload = calls.find((call) => call.method === 'POST')!;
  expect((upload.body as FormData).get('accountId')).toBe(A);
  expect((upload.body as FormData).get('password')).toBe('synthetic-password');
  expect(calls.some((call) => call.path.includes(B))).toBe(false);
});

it('uses a read-only source download and masks displayed amounts while preserving editable cents', async () => {
  const view = intake();
  const calls = transport((url) =>
    json(url.pathname === PATH ? { intakes: [view] } : { intake: view }),
  );
  mount();
  await act(() => setAmountsHidden(true));
  await openExisting();
  const amount = screen.getByLabelText('Abrechnungsbetrag') as HTMLInputElement;
  expect(amount.type).toBe('password');
  expect(amount.value).toBe('120,00');
  const download = screen.getByRole('link', { name: 'Original-PDF herunterladen' });
  expect(download.getAttribute('href')).toBe(`/api/receipts/${RECEIPT}/download`);
  expect(screen.queryByText(/120,00\s*€/)).toBeNull();
  expect(calls.every((call) => call.method === 'GET')).toBe(true);
});

it('offers explicit same-account restoration for a deleted duplicate and never restores on upload alone', async () => {
  const deleted = { ...intake(), deletedAt: '2026-10-20T11:00:00Z' };
  let restored = false;
  const calls = transport((url) => {
    if (url.pathname === PATH + '/upload')
      return json(
        { error: 'statement_deleted', message: 'synthetic deleted duplicate', intake: deleted },
        409,
      );
    if (url.pathname === `${PATH}/${ID}/restore`) {
      restored = true;
      return json({
        intake: { ...deleted, deletedAt: null, revision: 'restored-revision' },
        groupId: 'document-restore-only',
      });
    }
    return json({ intakes: restored ? [{ ...deleted, deletedAt: null }] : [] });
  });
  mount();
  await userEvent.upload(await chooser(), file());
  await screen.findByRole('button', { name: 'Wiederherstellen' });
  expect(calls.filter((call) => call.method !== 'GET')).toHaveLength(1);
  expect(screen.queryByRole('link', { name: 'Original-PDF herunterladen' })).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Wiederherstellen' }));
  await screen.findByRole('link', { name: 'Original-PDF herunterladen' });
  expect(
    calls.filter((call) => call.method !== 'GET').map(({ method, path }) => ({ method, path })),
  ).toEqual([
    { method: 'POST', path: PATH + '/upload' },
    { method: 'POST', path: `${PATH}/${ID}/restore` },
  ]);
  expect(calls.find((call) => call.path === `${PATH}/${ID}/restore`)?.body).toEqual({
    revision: REV,
    sha256: HASH,
    accountId: A,
  });
});

it('retains a saved explicit zero draft while the unknown debit date stays null', async () => {
  const view = intake();
  const facts: StatementFacts = {
    reference: 'SYN-726',
    issueDate: '2026-10-01',
    periodFrom: '2026-09-01',
    periodTo: '2026-09-30',
    payableCents: 0,
    currency: 'EUR',
    debitDate: null,
    accountHint: null,
  };
  view.proposal.draft = facts;
  const calls = transport((url, init) =>
    init?.method === 'PUT'
      ? json({ intake: view, groupId: null })
      : json(url.pathname === PATH ? { intakes: [view] } : { intake: view }),
  );
  mount();
  await openExisting();
  expect((screen.getByLabelText('Abrechnungsbetrag') as HTMLInputElement).value).toBe('0,00');
  expect((screen.getByLabelText('Einzugsdatum') as HTMLInputElement).value).toBe('');
  expect(
    screen.getByRole('button', { name: 'Als geprüft speichern' }).getAttribute('disabled'),
  ).not.toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Entwurf speichern' }));
  await waitFor(() =>
    expect(calls.filter((call) => call.method === 'PUT')).toEqual([
      {
        method: 'PUT',
        path: `${PATH}/${ID}/review`,
        body: { revision: REV, sha256: HASH, accountId: A, facts, savePending: true },
      },
    ]),
  );
});

it('shows simultaneous original-PDF date and amount/currency conflicts without losing manual draft facts', async () => {
  let view = intake();
  const facts: StatementFacts = {
    reference: 'SYN-726',
    issueDate: '2026-10-01',
    periodFrom: '2026-09-01',
    periodTo: '2026-09-30',
    payableCents: 12_345,
    currency: 'EUR',
    debitDate: null,
    accountHint: null,
  };
  view.proposal.fields.payableCents = { ...field<number>(null), candidates: [12_000, 13_000] };
  view.proposal.fields.currency = {
    ...field<NonNullable<StatementFacts['currency']>>(null),
    candidates: ['EUR', 'USD'],
  };
  view.proposal.warnings = [
    'debit_date_required',
    'ambiguous_company_gross',
    'ambiguous_payableCents',
    'ambiguous_currency',
  ];
  view.proposal.draft = facts;
  const calls = transport((url, init) => {
    if (init?.method === 'PUT') {
      view = {
        ...view,
        revision: 'saved-draft-revision',
        proposal: { ...view.proposal, draft: { ...facts, payableCents: 12_500 } },
      };
      return json({ intake: view, groupId: 'document-draft-only' });
    }
    return json(url.pathname === PATH ? { intakes: [view] } : { intake: view });
  });
  mount();
  await openExisting();
  expect(screen.getByText(/Im PDF wurde kein eindeutiges Einzugsdatum erkannt/)).toBeTruthy();
  expect(
    screen.getByText(/Das PDF enthält unklare, widersprüchliche oder nicht unterstützte Angaben/),
  ).toBeTruthy();
  expect(screen.getByText(/Betragsangaben im PDF sind nicht eindeutig/)).toBeTruthy();
  expect(screen.getByText(/Währungsangaben im PDF sind nicht eindeutig/)).toBeTruthy();
  expect(
    screen.queryByText(/ambiguous_company_gross|ambiguous_payableCents|ambiguous_currency/),
  ).toBeNull();
  const amount = screen.getByLabelText('Abrechnungsbetrag') as HTMLInputElement;
  expect(amount.value).toBe('123,45');
  expect((screen.getByLabelText('Währung') as HTMLInputElement).value).toBe('EUR');
  await userEvent.clear(amount);
  await userEvent.type(amount, '125,00');
  await userEvent.click(screen.getByRole('button', { name: 'Entwurf speichern' }));
  await waitFor(() =>
    expect(calls.filter((call) => call.method !== 'GET')).toEqual([
      {
        method: 'PUT',
        path: `${PATH}/${ID}/review`,
        body: {
          revision: REV,
          sha256: HASH,
          accountId: A,
          facts: { ...facts, payableCents: 12_500 },
          savePending: true,
        },
      },
    ]),
  );
  await waitFor(() =>
    expect((screen.getByLabelText('Abrechnungsbetrag') as HTMLInputElement).value).toBe('125,00'),
  );
  expect((screen.getByLabelText('Einzugsdatum') as HTMLInputElement).value).toBe('');
  expect(screen.getByText(/Im PDF wurde kein eindeutiges Einzugsdatum erkannt/)).toBeTruthy();
  expect(
    screen.getByText(/Das PDF enthält unklare, widersprüchliche oder nicht unterstützte Angaben/),
  ).toBeTruthy();
});
