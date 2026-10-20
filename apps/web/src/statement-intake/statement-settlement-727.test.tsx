// @vitest-environment jsdom
import {
  type StatementSettlementState,
  type StatementSettlementAction,
  type StatementActionReceipt,
  type StatementOriginalCandidate,
  type StatementBonusEvidence,
  type StatementField,
  type StatementIntakeView,
} from '@budget/domain';
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
import { LEDGER_KEY } from '../ledger/queries';
import { AccountStatementIntake } from './statement-review-726';

const A = '72600000-0000-4000-8000-000000000001';
const B = '72600000-0000-4000-8000-000000000002';
const C = '72600000-0000-4000-8000-000000000006';
const ID = '72600000-0000-4000-8000-000000000003';
const ID_B = '72700000-0000-4000-8000-000000000020';
const RECEIPT_B = '72700000-0000-4000-8000-000000000021';
const REV_B = '72700000-0000-4000-8000-000000000022';
const HASH_B = 'b'.repeat(64);
const RECEIPT = '72600000-0000-4000-8000-000000000004';
const HASH = 'a'.repeat(64),
  REV = '72600000-0000-4000-8000-000000000005';
const PATH = '/api/statement-intake';
const clients: QueryClient[] = [];
const unexpected: Call[] = [];
let remainingWrites = 0;
let allowDocumentReopen = false;
const account = (id: string): AccountRow => ({
  id,
  name: 'Konto Muster',
  type: id === B ? 'checking' : 'credit_card',
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
  const view: StatementIntakeView = {
    id: ID,
    accountId: A,
    receiptId: RECEIPT,
    sha256: HASH,
    status: 'reviewed',
    revision: REV,
    proposal: {
      schemaVersion: 1,
      parserVersion: 1,
      sha256: HASH,
      extraction: 'parsed',
      fields: {
        reference: field('SYN-727'),
        issueDate: field('2026-10-01'),
        periodFrom: field('2026-09-01'),
        periodTo: field('2026-09-30'),
        payableCents: field(10_000),
        currency: field('EUR'),
        debitDate: field('2026-10-10'),
        accountHint: field<string>(null),
      },
      warnings: [],
      relatedIntakeIds: [],
    },
    reviewed: null,
    createdAt: '2026-10-20T10:00:00Z',
    updatedAt: '2026-10-20T10:00:00Z',
    deletedAt: null,
  };
  view.reviewed = { fields: view.proposal.fields };
  return view;
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
    const call: Call = {
      method: init?.method ?? 'GET',
      path: url.pathname + url.search,
      body:
        init?.body instanceof FormData
          ? init.body
          : init?.body
            ? (JSON.parse(String(init.body)) as unknown)
            : undefined,
    };
    calls.push(call);
    const keys = [...url.searchParams.keys()].sort().join(',');
    const candidate =
      url.pathname === '/api/statement-settlements/candidates' &&
      url.searchParams.get('cardAccountId') === A &&
      url.searchParams.get('limit') === '25' &&
      [...url.searchParams.keys()].every((key) =>
        [
          'cardAccountId',
          'kind',
          'limit',
          'bonusId',
          'settlementId',
          'beforeDate',
          'beforeId',
        ].includes(key),
      ) &&
      ((url.searchParams.get('kind') === 'original' &&
        !url.searchParams.has('settlementId') &&
        (!url.searchParams.has('bonusId') || url.searchParams.get('bonusId') === BONUS)) ||
        (url.searchParams.get('kind') === 'credit' &&
          url.searchParams.get('bonusId') === BONUS &&
          !url.searchParams.has('settlementId')) ||
        (url.searchParams.get('kind') === 'transfer' &&
          url.searchParams.get('settlementId') === SETTLEMENT &&
          !url.searchParams.has('bonusId')));
    const knownRead =
      new Set([
        '/api/accounts',
        `${PATH}?accountId=${A}`,
        `${PATH}/${ID}`,
        `${PATH}/${ID_B}`,
        `/api/statement-settlements?cardAccountId=${A}`,
        '/api/lookups',
      ]).has(call.path) ||
      candidate ||
      (url.pathname === '/api/expected/occurrences' &&
        keys === 'from,to' &&
        url.searchParams.get('from') === '2026-10-10' &&
        url.searchParams.get('to') === '2026-10-10');
    const knownWrite =
      call.method === 'POST' &&
      remainingWrites > 0 &&
      (call.path === '/api/statement-settlements/actions' ||
        (allowDocumentReopen && call.path === `${PATH}/${ID_B}/reopen`));
    if (!((call.method === 'GET' && knownRead) || knownWrite)) {
      unexpected.push(call);
      throw new Error(`Unexpected synthetic request: ${call.method} ${call.path}`);
    }
    if (knownWrite) remainingWrites--;
    if (url.pathname === '/api/accounts')
      return json({
        accounts: [
          account(A),
          account(B),
          { ...account(B), id: C, name: 'Anderes Muster Gegenkonto' },
        ],
      });
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

const writes: Call[] = [];
async function openReviewedSource(
  extra?: (url: URL, init?: RequestInit) => Response | Promise<Response> | undefined,
  view = intake(),
  expectedAmount = '100,00',
) {
  const calls = transport((url, init) => {
    const supplied = extra?.(url, init);
    if (supplied) return supplied;
    if ((init?.method ?? 'GET') !== 'GET') throw new Error('No mutation during entry review');
    if (url.pathname === PATH) return json({ intakes: [view] });
    if (url.pathname === `${PATH}/${ID}`) return json({ intake: view });
    if (url.pathname === '/api/statement-settlements')
      return json({ config: null, settlements: [], bonuses: [] });
    throw new Error(`Unexpected synthetic read: ${url.pathname}`);
  });
  const mounted = mount();
  const opener = await screen.findByRole('button', { name: 'Abrechnung hochladen' });
  await waitFor(() => expect(opener.getAttribute('disabled')).toBeNull());
  await userEvent.click(opener);
  await userEvent.click(await screen.findByText('Abrechnungen · 1'));
  await userEvent.click(await screen.findByRole('button', { name: /SYN-727/ }));
  await screen.findByRole('dialog', { name: 'Abrechnung prüfen' });
  const amount = await screen.findByLabelText('Abrechnungsbetrag');
  if (!(amount instanceof HTMLInputElement)) throw new TypeError('Expected amount input');
  expect(amount.value).toBe(expectedAmount);
  const date = screen.getByLabelText('Einzugsdatum');
  if (!(date instanceof HTMLInputElement)) throw new TypeError('Expected date input');
  expect(date.value).toBe('10.10.2026');
  expect(
    screen.getByRole('link', { name: 'Original-PDF herunterladen' }).getAttribute('href'),
  ).toBe(`/api/receipts/${RECEIPT}/download`);
  writes.push(...calls.filter((call) => call.method !== 'GET'));
  return { calls, router: mounted.router };
}
beforeEach(() => {
  remainingWrites = 0;
  allowDocumentReopen = false;
  setAmountsHidden(false);
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
  expect(writes.splice(0)).toEqual([]);
  expect(unexpected.splice(0)).toEqual([]);
});
it('opens a complete reviewed original without a monetary write', async () => {
  await openReviewedSource();
  expect(screen.getByText('Geprüft')).toBeTruthy();
});
it('offers a separate settlement entry only after the real reviewed-source prerequisites', async () => {
  await openReviewedSource();
  const entry = screen.getByRole('button', { name: 'Abrechnungsausgleich' });
  expect(entry.getAttribute('disabled')).toBeNull();
});

// Synthetic HTTP fixtures below prove browser intent/lifecycle only, not backend atomicity.
const CONFIG = '72700000-0000-4000-8000-000000000010';
const SETTLEMENT = '72700000-0000-4000-8000-000000000011';
const BONUS = '72700000-0000-4000-8000-000000000012';
const ACTION_REV = '72700000-0000-4000-8000-000000000013';
const GROUP = '72700000-0000-4000-8000-000000000014';
const CATEGORY = '72700000-0000-4000-8000-000000000015';
const sourceTuple = { intakeId: ID, revision: REV, sha256: HASH, accountId: A };
const accepted = {
  id: SETTLEMENT,
  sourceIntakeId: ID,
  receiptId: RECEIPT,
  sourceSha256: HASH,
  sourceRevision: REV,
  cardAccountId: A,
  reference: 'SYN-727',
  issueDate: '2026-10-01',
  currency: 'EUR',
  originsJson: '{}',
  representationKind: null,
  actionGroupId: null,
  revision: ACTION_REV,
} as const;
const original = {
  kind: 'original',
  date: '2026-09-27',
  status: 'reconciled',
  selection: {
    bookingId: '72700000-0000-4000-8000-000000000016',
    bookingRevision: REV,
    splitId: '72700000-0000-4000-8000-000000000017',
    splitRevision: ACTION_REV,
    accountId: A,
    currency: 'EUR',
    bookingAmountCents: -8000,
    splitAmountCents: -8000,
    categoryId: CATEGORY,
  },
} satisfies StatementOriginalCandidate;
const initialState = (): StatementSettlementState => ({
  config: { cardAccountId: A, fundingAccountId: B, enabled: true, revision: CONFIG },
  settlements: [],
  bonuses: [],
});
async function review(
  initial = initialState(),
  post?: (
    action: StatementSettlementAction,
    state: StatementSettlementState,
  ) => Response | Promise<Response>,
  source = intake(),
  expectedAmount = '100,00',
) {
  remainingWrites = post ? 1 : 0;
  const state = initial;
  const opened = await openReviewedSource(
    (url, init) => {
      if (url.pathname === `${PATH}/${ID_B}` && (init?.method ?? 'GET') === 'GET')
        return json({ intake: secondSource() });
      if (
        url.pathname === `${PATH}/${ID_B}/reopen` &&
        init?.method === 'POST' &&
        allowDocumentReopen
      )
        return json({
          intake: { ...secondSource(), status: 'pending', reviewed: null },
          groupId: GROUP,
        });
      if (url.pathname === '/api/statement-settlements/actions') {
        if (!post) throw new Error('Unexpected monetary action');
        return post(JSON.parse(String(init?.body)) as StatementSettlementAction, state);
      }
      if (url.pathname === '/api/statement-settlements') return json(state);
      if (url.pathname === '/api/statement-settlements/candidates')
        return json({
          kind: url.searchParams.get('kind'),
          items: url.searchParams.get('kind') === 'original' ? [original] : [],
          nextCursor: null,
          omitted: {},
        });
      if (url.pathname === '/api/lookups')
        return json({
          groups: [],
          categories: [
            {
              id: CATEGORY,
              name: 'Musteraufwand',
              groupId: null,
              class: 'want',
              kind: 'expense',
              sortOrder: 0,
            },
          ],
          projects: [],
          incomeTypes: [],
          contacts: [],
          payees: [],
        });
      if (url.pathname === '/api/expected/occurrences') return json({ occurrences: [] });
      return undefined;
    },
    source,
    expectedAmount,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Abrechnungsausgleich' }));
  await screen.findByRole('heading', { name: 'Abrechnung und Quelle' });
  const funding = screen.getByLabelText('Ausgleich von Konto');
  await waitFor(() => expect(funding.closest('fieldset')?.disabled).toBe(false));
  return { calls: opened.calls, state, router: opened.router };
}
const actions = (calls: Call[]) =>
  calls.filter((c) => c.path === '/api/statement-settlements/actions');
const receipt = (value: Partial<StatementActionReceipt>) =>
  json({ operation: 'confirm', groupId: GROUP, ...value }, 201);

it('configures explicitly with absent CAS and keeps upload/review nonmonetary', async () => {
  const state = initialState();
  state.config = null;
  const result = await review(state, (action, s) => {
    if (action.operation !== 'configure') throw new Error('Expected configure only');
    s.config = { cardAccountId: A, fundingAccountId: B, enabled: true, revision: CONFIG };
    return receipt({ operation: 'configure', configRevision: CONFIG });
  });
  expect(actions(result.calls)).toEqual([]);
  const selectedFunding = screen.getByLabelText('Ausgleich von Konto');
  await userEvent.selectOptions(selectedFunding, B);
  if (!(selectedFunding instanceof HTMLSelectElement))
    throw new TypeError('Expected native funding selection');
  expect(selectedFunding.value).toBe(B);
  await userEvent.click(screen.getByLabelText('Ausgleich für neue Abrechnungen aktivieren'));
  await userEvent.click(screen.getByRole('button', { name: 'Ausgleichseinstellung speichern' }));
  await waitFor(() => expect(actions(result.calls)).toHaveLength(1));
  expect(actions(result.calls)[0]?.body).toEqual({
    operation: 'configure',
    key: expect.any(String),
    cardAccountId: A,
    fundingAccountId: B,
    enabled: true,
    expectedRevision: null,
  });
});
it('accepts the fixed issued amount before a separate transfer intent without a replacement amount', async () => {
  const result = await review(initialState(), (action, s) => {
    if (action.operation === 'confirm') {
      s.settlements = [
        {
          ...accepted,
          fundingAccountId: B,
          debitDate: '2026-10-10',
          payableCents: 10000,
          state: 'open',
          supersedesId: null,
          legacyPaymentId: null,
          legacyDueDate: null,
          transferId: null,
          fromBookingId: null,
          toBookingId: null,
        },
      ];
      return receipt({
        operation: 'confirm',
        settlementId: SETTLEMENT,
        settlementRevision: ACTION_REV,
      });
    }
    if (action.operation !== 'create_transfer') throw new Error('No other financial intent');
    return receipt({
      operation: 'create_transfer',
      settlementId: SETTLEMENT,
      settlementRevision: ACTION_REV,
    });
  });
  remainingWrites = 2;
  await userEvent.click(screen.getByRole('button', { name: 'Abrechnung annehmen · ohne Buchung' }));
  await screen.findByRole('button', { name: 'Umbuchung erstellen' });
  expect(actions(result.calls)[0]?.body).toEqual({
    operation: 'confirm',
    key: expect.any(String),
    source: sourceTuple,
    configRevision: CONFIG,
  });
  await userEvent.click(screen.getByRole('button', { name: 'Umbuchung erstellen' }));
  await waitFor(() => expect(actions(result.calls)).toHaveLength(2));
  expect(actions(result.calls)[1]?.body).toEqual({
    operation: 'create_transfer',
    key: expect.any(String),
    source: sourceTuple,
    configRevision: CONFIG,
    settlementId: SETTLEMENT,
    expectedRevision: ACTION_REV,
    status: 'pending',
  });
});
it('retains stale evidence and manual punctuation-date draft after409 without another action', async () => {
  const { calls } = await review(initialState(), () =>
    json({ error: 'conflict', message: 'Nachweis geändert.' }, 409),
  );
  const date = screen.getByLabelText('Datum der Gutschrift');
  expect(date.getAttribute('type')).toBe('text');
  expect(date.getAttribute('inputmode')).toBe('text');
  await userEvent.click(date);
  await userEvent.paste('12.10.2026');
  await userEvent.click(screen.getByRole('button', { name: 'Abrechnung annehmen · ohne Buchung' }));
  await screen.findByText(/Ihre Angaben bleiben erhalten/);
  if (!(date instanceof HTMLInputElement)) throw new TypeError('Expected date input');
  expect(date.value).toBe('12.10.2026');
  expect(actions(calls)).toHaveLength(1);
  expect(
    screen.getByRole('button', { name: 'Abrechnung annehmen · ohne Buchung' }).closest('fieldset')
      ?.disabled,
  ).toBe(true);
  await userEvent.click(screen.getByRole('button', { name: 'Zur Dokumentprüfung' }));
  expect(window.confirm).toHaveBeenCalled();
  expect(screen.getByRole('heading', { name: 'Abrechnung und Quelle' })).toBeTruthy();
});
it('retries exactly the captured action and idempotency key after an unknown network outcome', async () => {
  let attempt = 0;
  const { calls } = await review(initialState(), () => {
    if (attempt++ === 0) throw new TypeError('Synthetic disconnected transport');
    return receipt({
      operation: 'confirm',
      settlementId: SETTLEMENT,
      settlementRevision: ACTION_REV,
    });
  });
  remainingWrites = 2;
  await userEvent.click(screen.getByRole('button', { name: 'Abrechnung annehmen · ohne Buchung' }));
  await userEvent.click(
    await screen.findByRole('button', { name: 'Dieselbe Aktion erneut senden' }),
  );
  await waitFor(() => expect(actions(calls)).toHaveLength(2));
  expect(actions(calls)[1]?.body).toEqual(actions(calls)[0]?.body);
});
it('keeps selected reconciled gross purchases unchanged and confirms explicit125 allocation without posting', async () => {
  const { calls } = await review(initialState(), () =>
    receipt({ operation: 'confirm_bonus', bonusId: BONUS, bonusRevision: ACTION_REV }),
  );
  for (const [label, value] of [
    ['Geprüfter Bonusbetrag', '1,25'],
    ['Datum der Gutschrift', '12.10.2026'],
  ] as const) {
    await userEvent.click(screen.getByLabelText(label));
    await userEvent.paste(value);
  }
  await userEvent.selectOptions(screen.getByLabelText('Behandlung des Bonus'), 'gross_then_credit');
  await userEvent.click(await screen.findByLabelText(/Musteraufwand · −80,00.*abgeglichen/));
  await userEvent.click(screen.getByLabelText('Bonusanteil · Musteraufwand'));
  await userEvent.paste('1,25');
  await userEvent.click(
    screen.getByLabelText('Bestehende Gutschriften geprüft; keine doppelte Zuordnung'),
  );
  await userEvent.click(
    screen.getByLabelText('Gebühren und andere Anpassungen ausdrücklich geprüft'),
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Bonusnachweis annehmen · ohne Buchung' }),
  );
  await waitFor(() => expect(actions(calls)).toHaveLength(1));
  const expected: StatementBonusEvidence = {
    origin: 'owner',
    bonusCents: 125,
    creditDate: '2026-10-12',
    treatment: 'gross_then_credit',
    existingCreditsReviewed: true,
    feesAdjustmentsReviewed: true,
    selectedOriginals: [original.selection],
    allocations: [{ categoryId: CATEGORY, amountCents: 125 }],
  };
  expect(actions(calls)[0]?.body).toEqual({
    operation: 'confirm_bonus',
    key: expect.any(String),
    source: sourceTuple,
    configRevision: CONFIG,
    evidence: expected,
  });
  expect(original.selection).toEqual({
    bookingId: '72700000-0000-4000-8000-000000000016',
    bookingRevision: REV,
    splitId: '72700000-0000-4000-8000-000000000017',
    splitRevision: ACTION_REV,
    accountId: A,
    currency: 'EUR',
    bookingAmountCents: -8000,
    splitAmountCents: -8000,
    categoryId: CATEGORY,
  });
});

function sourceAmount(value: number) {
  const source = intake();
  source.proposal.fields.payableCents = field(value);
  source.reviewed = { fields: source.proposal.fields };
  return source;
}
for (const [stateName, value, display] of [
  ['zero', 0, '0,00'],
  ['credit_manual', -125, '−1,25'],
] as const)
  it(`keeps ${stateName} explicit and offers no transfer`, async () => {
    const state = initialState();
    state.settlements = [
      {
        ...accepted,
        fundingAccountId: B,
        debitDate: '2026-10-10',
        payableCents: value,
        state: stateName,
        supersedesId: null,
        legacyPaymentId: null,
        legacyDueDate: null,
        transferId: null,
        fromBookingId: null,
        toBookingId: null,
      },
    ];
    const { calls } = await review(state, undefined, sourceAmount(value), display);
    expect(screen.queryByRole('button', { name: 'Umbuchung erstellen' })).toBeNull();
    if (stateName === 'zero')
      expect(screen.getByText('Der bekannte Nullbetrag erzeugt keine Zahlung.')).toBeTruthy();
    else
      expect(
        screen.getByRole('link', { name: 'Manuelle Buchung öffnen' }).getAttribute('href'),
      ).toContain('panel=buchung');
    expect(actions(calls)).toEqual([]);
  });
it('keeps an already-net125 decision nonposting and masks source and accepted evidence amounts', async () => {
  const state = initialState();
  const evidence: StatementBonusEvidence = {
    origin: 'owner',
    bonusCents: 125,
    creditDate: '2026-10-10',
    treatment: 'already_net',
    existingCreditsReviewed: true,
    feesAdjustmentsReviewed: true,
    selectedOriginals: [original.selection],
    allocations: [{ categoryId: CATEGORY, amountCents: 125 }],
  };
  state.bonuses = [
    {
      ...accepted,
      id: BONUS,
      bonusCents: 125,
      creditDate: '2026-10-10',
      state: 'already_net',
      supersedesId: null,
      bookingId: null,
      evidenceJson: JSON.stringify(evidence),
      evidence,
    },
  ];
  const { calls } = await review(state, undefined, sourceAmount(7875), '78,75');
  expect(screen.queryByRole('button', { name: 'Gutschrift erstellen' })).toBeNull();
  expect(
    screen.getByText('Keine zusätzliche Gutschrift. Ungeklärte Differenzen bleiben offen.'),
  ).toBeTruthy();
  act(() => setAmountsHidden(true));
  await waitFor(() => expect(screen.queryByText(/78,75|80,00|1,25/)).toBeNull());
  expect(screen.getAllByText(/•••/).length).toBeGreaterThan(0);
  expect(actions(calls)).toEqual([]);
});

it('keeps impossible punctuation dates as an invalid draft without an action', async () => {
  const { calls } = await review();
  const date = screen.getByLabelText('Datum der Gutschrift');
  await userEvent.click(date);
  await userEvent.paste('31.02.2026');
  expect(date.getAttribute('inputmode')).toBe('text');
  expect(date.getAttribute('aria-invalid')).toBe('true');
  if (!(date instanceof HTMLInputElement)) throw new TypeError('Expected date input');
  expect(date.value).toBe('31.02.2026');
  expect(actions(calls)).toEqual([]);
});
it('blocks account navigation while an action is pending and preserves a rejected dirty draft', async () => {
  let deliver: ((value: Response) => void) | undefined;
  const pending = new Promise<Response>((resolve) => {
    deliver = resolve;
  });
  const { calls, router } = await review(initialState(), () => pending);
  await userEvent.click(screen.getByRole('button', { name: 'Abrechnung annehmen · ohne Buchung' }));
  await waitFor(() => expect(actions(calls)).toHaveLength(1));
  act(() => {
    void router.navigate({ to: '/konten/$id', params: { id: B } });
  });
  await waitFor(() => expect(router.state.location.pathname).toBe(`/konten/${A}`));
  expect(screen.getByRole('dialog', { name: 'Abrechnungsausgleich' })).toBeTruthy();
  if (!deliver) throw new Error('Expected the controlled action response');
  deliver(
    receipt({ operation: 'confirm', settlementId: SETTLEMENT, settlementRevision: ACTION_REV }),
  );
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Zur Dokumentprüfung' }).getAttribute('disabled'),
    ).toBeNull(),
  );
  const amount = screen.getByLabelText('Geprüfter Bonusbetrag');
  await userEvent.click(amount);
  await userEvent.paste('2,50');
  act(() => {
    void router.navigate({ to: '/konten/$id', params: { id: B } });
  });
  await waitFor(() => expect(window.confirm).toHaveBeenCalled());
  expect(router.state.location.pathname).toBe(`/konten/${A}`);
  if (!(amount instanceof HTMLInputElement)) throw new TypeError('Expected amount input');
  expect(amount.value).toBe('2,50');
  expect(actions(calls)).toHaveLength(1);
});

it('blocks acceptance and monetary actions while a different displayed funding choice is unsaved', async () => {
  const state = initialState();
  state.settlements = [
    {
      ...accepted,
      fundingAccountId: B,
      debitDate: '2026-10-10',
      payableCents: 10000,
      state: 'open',
      supersedesId: null,
      legacyPaymentId: null,
      legacyDueDate: null,
      transferId: null,
      fromBookingId: null,
      toBookingId: null,
    },
  ];
  const { calls } = await review(state);
  const selectedFunding = screen.getByLabelText('Ausgleich von Konto');
  await userEvent.selectOptions(selectedFunding, C);
  if (!(selectedFunding instanceof HTMLSelectElement))
    throw new TypeError('Expected native funding selection');
  expect(selectedFunding.value).toBe(C);
  expect(screen.getByText(/Die Kontoeinstellung ist noch nicht gespeichert/)).toBeTruthy();
  expect(
    screen.getByRole('button', { name: 'Umbuchung erstellen' }).closest('fieldset')?.disabled,
  ).toBe(true);
  expect(
    screen
      .getByRole('button', { name: 'Abrechnung durch geprüfte Quelle ersetzen' })
      .closest('fieldset')?.disabled,
  ).toBe(true);
  expect(
    screen
      .getByRole('button', { name: 'Ausgleichseinstellung speichern' })
      .getAttribute('disabled'),
  ).toBeNull();
  expect(actions(calls)).toEqual([]);
});

function secondSource(): StatementIntakeView {
  const source = sourceAmount(2500);
  source.id = ID_B;
  source.receiptId = RECEIPT_B;
  source.revision = REV_B;
  source.sha256 = HASH_B;
  source.proposal.sha256 = HASH_B;
  source.proposal.fields.reference = field('SYN-727-B');
  source.reviewed = { fields: source.proposal.fields };
  return source;
}
it('returns explicit history source B to the document editor with B download and literal B CAS', async () => {
  const state = initialState();
  state.settlements = [
    {
      ...accepted,
      sourceIntakeId: ID_B,
      receiptId: RECEIPT_B,
      sourceSha256: HASH_B,
      sourceRevision: REV_B,
      reference: 'SYN-727-B',
      fundingAccountId: B,
      debitDate: '2026-10-10',
      payableCents: 2500,
      state: 'withdrawn',
      supersedesId: null,
      legacyPaymentId: null,
      legacyDueDate: null,
      transferId: null,
      fromBookingId: null,
      toBookingId: null,
    },
  ];
  const { calls } = await review(state);
  await userEvent.click(screen.getByText('Frühere Annahmen und Nachweise'));
  await userEvent.click(screen.getByRole('button', { name: 'Quelle dieser Annahme prüfen' }));
  await waitFor(() =>
    expect(
      screen.getByRole('link', { name: 'Original-PDF herunterladen' }).getAttribute('href'),
    ).toBe(`/api/receipts/${RECEIPT_B}/download`),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Zur Dokumentprüfung' }));
  const reference = await screen.findByLabelText('Abrechnungsnummer');
  if (!(reference instanceof HTMLInputElement)) throw new TypeError('Expected reference input');
  expect(reference.value).toBe('SYN-727-B');
  expect(
    screen.getByRole('link', { name: 'Original-PDF herunterladen' }).getAttribute('href'),
  ).toBe(`/api/receipts/${RECEIPT_B}/download`);
  remainingWrites = 1;
  allowDocumentReopen = true;
  await userEvent.click(screen.getByRole('button', { name: 'Prüfung wieder öffnen' }));
  await screen.findByRole('button', { name: 'Als geprüft speichern' });
  expect(calls.filter((c) => c.method !== 'GET')).toEqual([
    {
      method: 'POST',
      path: `${PATH}/${ID_B}/reopen`,
      body: { revision: REV_B, sha256: HASH_B, accountId: A },
    },
  ]);
  expect(actions(calls)).toEqual([]);
});

it('captures initial funding once and preserves its dirty draft across a newer background state', async () => {
  const { calls, state } = await review();
  const funding = screen.getByLabelText('Ausgleich von Konto');
  const enabled = screen.getByLabelText('Ausgleich für neue Abrechnungen aktivieren');
  if (!(funding instanceof HTMLSelectElement) || !(enabled instanceof HTMLInputElement))
    throw new TypeError('Expected native configuration controls');
  expect(funding.value).toBe(B);
  expect(enabled.checked).toBe(true);
  await userEvent.selectOptions(funding, C);
  expect(funding.value).toBe(C);
  expect(screen.getByText(/Die Kontoeinstellung ist noch nicht gespeichert/)).toBeTruthy();

  state.config = { cardAccountId: A, fundingAccountId: B, enabled: false, revision: REV_B };
  const client = clients.at(-1);
  if (!client) throw new Error('Expected the actual mounted query client');
  await act(async () => {
    await client.invalidateQueries({ queryKey: [...LEDGER_KEY, 'statement-settlements', A] });
  });
  await screen.findByText(/Der Stand hat sich geändert/);
  expect(funding.value).toBe(C);
  expect(enabled.checked).toBe(true);
  expect(screen.getByText(/Die Kontoeinstellung ist noch nicht gespeichert/)).toBeTruthy();
  expect(funding.closest('fieldset')?.disabled).toBe(true);
  expect(
    screen.getByRole('button', { name: 'Abrechnung annehmen · ohne Buchung' }).closest('fieldset')
      ?.disabled,
  ).toBe(true);
  expect(actions(calls)).toEqual([]);
});
