import {
  accounts,
  categories,
  createBooking,
  createTransfer,
  updateBooking,
  undo,
  createEntity,
  createTestDatabase,
  getBooking,
  history,
  schema,
  stageStatementIntake,
  mutateStatementIntake,
  type OpenedDatabase,
  type ReportTables,
} from '@budget/db';
import {
  monthHouseholdIncome,
  parseStatementText,
  type StatementIntakeView,
  type StatementCandidatePage,
  type StatementOriginalCandidate,
  type StatementCreditCandidate,
  type StatementTransferCandidate,
} from '@budget/domain';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createLedgerApi } from './index';
import { syntheticPayslipPdf } from '../payslips/testing';
import { digest, storeReceipt } from '../receipts/files';
import * as sourceService from '../statements/service';
import { createApp } from '../app';
import { AuthStore } from '../auth/store';
import { sha256Hex } from '../auth/crypto';
import { createAuth } from '../auth/routes';

// OUTSIDE proposal only: all imports exist at 15aa5a8; no future helper is imported.
// Subapp-level financial regression. Existing app-session/CSRF gates need later NEW API cases.
const FUND = '72700000-0000-4000-8000-000000000001';
const CARD = '72700000-0000-4000-8000-000000000002';
const GROUP = '72700000-0000-4000-8000-000000000010';
const EXPENSE = '72700000-0000-4000-8000-000000000011';
const AS_OF = '2026-10-09';
const ctx = { actor: 'synthetic-727' };
let opened: OpenedDatabase, dir: string, app: ReturnType<typeof createLedgerApi>;
beforeEach(() => {
  opened = createTestDatabase();
  dir = mkdtempSync(join(tmpdir(), 'budget-settlement-727-'));
  accounts.create(
    opened.db,
    {
      id: FUND,
      name: 'Synthetic funding',
      type: 'checking',
      role: 'budget',
      onBudget: true,
      openingDate: '2026-09-01',
      openingBalanceCents: 50000,
    },
    ctx,
  );
  accounts.create(
    opened.db,
    {
      id: CARD,
      name: 'Synthetic card',
      type: 'credit_card',
      role: 'budget',
      onBudget: true,
      openingDate: '2026-09-01',
      openingBalanceCents: 0,
    },
    ctx,
  );
  createEntity(opened.db, schema.categoryGroup, { id: GROUP, name: 'Synthetic expenses' }, ctx);
  categories.create(
    opened.db,
    { id: EXPENSE, groupId: GROUP, name: 'Synthetic purchase', class: 'need' },
    ctx,
  );
  app = createLedgerApi({
    db: opened.db,
    receiptsDir: join(dir, 'receipts'),
    today: () => AS_OF,
    stepUp: async (_c, next) => next(),
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  opened.close();
  rmSync(dir, { recursive: true, force: true });
});
const request = (method: string, path: string, body?: unknown) =>
  app.request(path, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
async function balances(asOf = AS_OF) {
  const response = await request('GET', '/accounts?asOf=' + asOf);
  expect(response.status).toBe(200);
  const body = (await response.json()) as { accounts: { id: string; balanceCents: number }[] };
  const fund = body.accounts.find((a) => a.id === FUND),
    card = body.accounts.find((a) => a.id === CARD);
  expect(fund).toBeDefined();
  expect(card).toBeDefined();
  return { fund: fund!.balanceCents, card: card!.balanceCents };
}
function expense(amountCents: number, date: string, status: 'pending' | 'confirmed' = 'confirmed') {
  return createBooking(
    opened.db,
    { accountId: CARD, date, amountCents, status, splits: [{ amountCents, categoryId: EXPENSE }] },
    ctx,
  );
}
async function reviewedSource(payableCents: 10000 | 7875) {
  const amount = payableCents === 10000 ? '100,00' : '78,75';
  const lines = [
    'Rechnungsnummer: SYNTHETIC-727',
    'Rechnungsdatum: 01.10.2026',
    'Abrechnungszeitraum: 01.09.2026 - 30.09.2026',
    'Abrechnungsbetrag: ' + amount + ' EUR',
  ];
  const bytes = await syntheticPayslipPdf(lines, ''),
    sha256 = digest(bytes);
  await storeReceipt(join(dir, 'receipts'), bytes);
  const staged = stageStatementIntake(
    opened.db,
    {
      accountId: CARD,
      sha256,
      sizeBytes: bytes.length,
      filename: 'synthetic-statement.pdf',
      proposal: parseStatementText(lines.join('\n'), sha256),
    },
    ctx,
  ).intake;
  expect(staged.proposal.fields.payableCents.value).toBe(payableCents);
  const response = await request('PUT', '/statement-intake/' + staged.id + '/review', {
    revision: staged.revision,
    sha256,
    accountId: CARD,
    facts: {
      reference: 'SYNTHETIC-727',
      issueDate: '2026-10-01',
      periodFrom: '2026-09-01',
      periodTo: '2026-09-30',
      payableCents,
      currency: 'EUR',
      debitDate: '2026-10-10',
      accountHint: null,
    },
  });
  expect(response.status).toBe(200);
  const source = ((await response.json()) as { intake: StatementIntakeView }).intake;
  expect(source.status).toBe('reviewed');
  expect(source.reviewed).not.toBeNull();
  expect(source.reviewed!.fields.payableCents.value).toBe(payableCents);
  expect(source.reviewed!.fields.debitDate.value).toBe('2026-10-10');
  return { intakeId: source.id, revision: source.revision, sha256: source.sha256, accountId: CARD };
}
// Proposed new HTTP wire contract. The missing route is the intended first feature RED.
// These local receipt types describe HTTP only; there are no imports of future implementation.
type ActionReceipt = {
  operation: string;
  groupId: string | null;
  configRevision?: string;
  settlementId?: string;
  settlementRevision?: string;
  bonusId?: string;
  bonusRevision?: string;
  bookingId?: string;
};
async function action(body: unknown) {
  const response = await request('POST', '/statement-settlements/actions', body);
  expect(response.status).toBe(201);
  return (await response.json()) as ActionReceipt;
}
async function configure(key: string) {
  const result = await action({
    operation: 'configure',
    key,
    cardAccountId: CARD,
    fundingAccountId: FUND,
    expectedRevision: null,
    enabled: true,
  });
  expect(result.operation).toBe('configure');
  expect(result.configRevision).toEqual(expect.any(String));
  return result.configRevision!;
}
const moneyRows = () =>
  JSON.stringify(
    ['booking', 'booking_split', 'transfer'].map((table) =>
      opened.sqlite.prepare('SELECT * FROM ' + table + ' ORDER BY rowid').all(),
    ),
  );

it('proves existing reviewed-source and literal account APIs without any settlement configuration', async () => {
  expense(-10000, '2026-09-20');
  expense(-3000, '2026-10-05', 'pending');
  await reviewedSource(10000);
  const before = opened.sqlite.serialize();
  expect(await balances()).toEqual({ fund: 50000, card: -13000 });
  expect(opened.sqlite.serialize().equals(before)).toBe(true);
});

it('pays the issued10000 rather than current13000 and leaves the newer3000 tuple/revision unchanged', async () => {
  expense(-10000, '2026-09-20');
  const newerId = expense(-3000, '2026-10-05', 'pending');
  const newer = getBooking(opened.db, newerId),
    newerAudit = history(opened.db, 'booking', newerId);
  const source = await reviewedSource(10000);
  expect(await balances()).toEqual({ fund: 50000, card: -13000 });
  const initialMoney = moneyRows();
  const configRevision = await configure('synthetic-727-config-settlement');
  const accepted = await action({
    operation: 'confirm',
    key: 'synthetic-727-confirm-settlement',
    source,
    configRevision,
  });
  expect(accepted.operation).toBe('confirm');
  expect(accepted.settlementId).toEqual(expect.any(String));
  expect(accepted.settlementRevision).toEqual(expect.any(String));
  expect(moneyRows()).toBe(initialMoney); // Confirmation is not a payment.
  await action({
    operation: 'create_transfer',
    key: 'synthetic-727-create-settlement',
    settlementId: accepted.settlementId,
    expectedRevision: accepted.settlementRevision,
    configRevision,
    source,
    status: 'confirmed',
  });
  const settled = await balances('2026-10-10');
  expect(settled).toEqual({ fund: 40000, card: -3000 });
  expect(settled.fund + settled.card).toBe(37000);
  expect(getBooking(opened.db, newerId)).toEqual(newer);
  expect(history(opened.db, 'booking', newerId)).toEqual(newerAudit);
});

it('keeps gross purchase8000 exact and creates only explicit125 expense refund, with no funding or household income', async () => {
  const purchaseId = expense(-8000, '2026-09-20'),
    purchase = getBooking(opened.db, purchaseId);
  expect(purchase).toBeDefined();
  expect(purchase!.splits).toHaveLength(1);
  const split = purchase!.splits[0]!,
    purchaseAudit = history(opened.db, 'booking', purchaseId);
  const splitAudit = history(opened.db, 'booking_split', split.id);
  expect(purchaseAudit[0]).toBeDefined();
  expect(splitAudit[0]).toBeDefined();
  const source = await reviewedSource(7875);
  expect(await balances()).toEqual({ fund: 50000, card: -8000 });
  const configRevision = await configure('synthetic-727-config-bonus');
  const selectedOriginals = [
    {
      bookingId: purchaseId,
      bookingRevision: purchaseAudit[0]!.id,
      splitId: split.id,
      splitRevision: splitAudit[0]!.id,
    },
  ];
  const initialMoney = moneyRows();
  const accepted = await action({
    operation: 'confirm_bonus',
    key: 'synthetic-727-confirm-bonus',
    source,
    configRevision,
    evidence: {
      origin: 'owner',
      bonusCents: 125,
      creditDate: '2026-09-30',
      treatment: 'gross_then_credit',
      existingCreditsReviewed: true,
      feesAdjustmentsReviewed: true,
      selectedOriginals: [
        {
          ...selectedOriginals[0],
          accountId: CARD,
          currency: 'EUR',
          bookingAmountCents: -8000,
          splitAmountCents: -8000,
          categoryId: EXPENSE,
        },
      ],
      allocations: [{ categoryId: EXPENSE, amountCents: 125 }],
    },
  });
  expect(accepted.operation).toBe('confirm_bonus');
  expect(accepted.bonusId).toEqual(expect.any(String));
  expect(accepted.bonusRevision).toEqual(expect.any(String));
  expect(moneyRows()).toBe(initialMoney); // Evidence confirmation is nonposting.
  const made = await action({
    operation: 'create_bonus',
    key: 'synthetic-727-create-bonus',
    bonusId: accepted.bonusId,
    expectedRevision: accepted.bonusRevision,
    source,
    configRevision,
    selectedOriginals,
    status: 'confirmed',
  });
  expect(made.bookingId).toEqual(expect.any(String));
  const creditResponse = await request('GET', '/bookings/' + made.bookingId);
  expect(creditResponse.status).toBe(200);
  const credit = (
    (await creditResponse.json()) as {
      booking: {
        accountId: string;
        amountCents: number;
        date: string;
        splits: { amountCents: number; categoryId: string | null; incomeTypeId: string | null }[];
      };
    }
  ).booking;
  expect(credit).toMatchObject({ accountId: CARD, amountCents: 125, date: '2026-09-30' });
  expect(credit.splits).toEqual([
    expect.objectContaining({
      amountCents: 125,
      categoryId: EXPENSE,
      incomeTypeId: schema.INCOME_TYPES.refund.id,
    }),
  ]);
  expect(await balances()).toEqual({ fund: 50000, card: -7875 });
  expect(getBooking(opened.db, purchaseId)).toEqual(purchase);
  expect(history(opened.db, 'booking', purchaseId)).toEqual(purchaseAudit);
  expect(history(opened.db, 'booking_split', split.id)).toEqual(splitAudit);
  const response = await request('GET', '/report-tables/months');
  expect(response.status).toBe(200);
  const report = (await response.json()) as ReportTables;
  const september = report.months.find((month) => month.month === '2026-09');
  expect(september).toBeDefined();
  expect(september!.spending[EXPENSE]).toBe(7875);
  expect(monthHouseholdIncome(september!, report)).toBe(0);
});

const familyRows = () =>
  JSON.stringify(
    [
      'booking',
      'booking_split',
      'transfer',
      'statement_settlement_config',
      'statement_settlement',
      'statement_bonus',
      'statement_settlement_delivery',
      'audit_log',
    ].map((t) => opened.sqlite.prepare('SELECT * FROM ' + t + ' ORDER BY rowid').all()),
  );
it('rejects strict unknown fields and invalid status without delivery, audit or financial residue', async () => {
  const before = familyRows();
  const r = await request('POST', '/statement-settlements/actions', {
    operation: 'configure',
    key: 'synthetic-727-invalid-fields',
    cardAccountId: CARD,
    fundingAccountId: FUND,
    expectedRevision: null,
    enabled: true,
    amountCents: 10000,
  });
  expect(r.status).toBe(400);
  expect(familyRows()).toBe(before);
  const status = await request('POST', '/statement-settlements/actions', {
    operation: 'create_transfer',
    key: 'synthetic-727-invalid-status',
    status: 'reconciled',
  });
  expect(status.status).toBe(400);
  expect(familyRows()).toBe(before);
});
it('rechecks the source CAS after real source verification and refuses a concurrent reopen without action writes', async () => {
  const source = await reviewedSource(10000),
    configRevision = await configure('synthetic-727-config-source-race');
  const original = sourceService.readStatementSource;
  let afterConcurrent = '';
  vi.spyOn(sourceService, 'readStatementSource').mockImplementationOnce(async (...args) => {
    const bytes = await original(...args);
    mutateStatementIntake(opened.db, source.intakeId, source, 'reopen', {}, ctx);
    afterConcurrent = familyRows();
    return bytes;
  });
  const result = await request('POST', '/statement-settlements/actions', {
    operation: 'confirm',
    key: 'synthetic-727-source-race-action',
    source,
    configRevision,
  });
  expect(result.status).toBe(409);
  expect(afterConcurrent).not.toBe('');
  expect(familyRows()).toBe(afterConcurrent);
});
it('replays the immutable configure receipt before closed-account eligibility and writes nothing', async () => {
  const body = {
    operation: 'configure',
    key: 'synthetic-727-config-replay-close',
    cardAccountId: CARD,
    fundingAccountId: FUND,
    expectedRevision: null,
    enabled: true,
  };
  const first = await request('POST', '/statement-settlements/actions', body);
  expect(first.status).toBe(201);
  const saved = await first.json();
  accounts.update(opened.db, CARD, { closedAt: '2026-10-10' }, ctx);
  const before = familyRows();
  const replay = await request(
    'POST',
    '/statement-settlements/actions',
    Object.fromEntries(Object.entries(body).reverse()),
  );
  expect(replay.status).toBe(201);
  expect(await replay.json()).toEqual(saved);
  expect(familyRows()).toBe(before);
});
it('retains actual session/origin gates and the64KiB bound without a financial write', async () => {
  const origin = 'http://localhost:3000',
    token = 'synthetic-settlement-session',
    now = new Date('2026-10-20T12:00:00Z');
  const store = new AuthStore(opened.db);
  store.createSession({
    id: sha256Hex(token),
    passkeyId: null,
    now,
    expiresAt: new Date('2026-11-20T12:00:00Z'),
    stepUp: false,
    viaRecovery: true,
  });
  const auth = createAuth({
    store,
    clock: () => now,
    config: {
      rpID: 'localhost',
      rpName: 'Budget',
      origin,
      cookieSecure: false,
      setupToken: undefined,
      trustProxy: false,
      sessionDays: 30,
      sessionMaxDays: 90,
      stepUpMinutes: 5,
      pepper: Buffer.from('synthetic-pepper-0123456789abcdef'),
    },
  });
  const protectedApp = createApp({
    webDir: join(dir, 'web'),
    auth,
    ledger: { db: opened.db, receiptsDir: join(dir, 'receipts'), today: () => AS_OF },
  });
  const body = JSON.stringify({
    operation: 'configure',
    key: 'synthetic-727-protected-config',
    cardAccountId: CARD,
    fundingAccountId: FUND,
    expectedRevision: null,
    enabled: true,
  });
  const before = familyRows();
  const unauth = await protectedApp.request('/api/statement-settlements/actions', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body,
  });
  expect(unauth.status).toBe(401);
  const foreign = await protectedApp.request('/api/statement-settlements/actions', {
    method: 'POST',
    headers: {
      origin: 'https://invalid.example',
      cookie: `budget_session=${token}`,
      'content-type': 'application/json',
    },
    body,
  });
  expect(foreign.status).toBe(403);
  const huge = await protectedApp.request('/api/statement-settlements/actions', {
    method: 'POST',
    headers: { origin, cookie: `budget_session=${token}`, 'content-type': 'application/json' },
    body: ' '.repeat(65537),
  });
  expect(huge.status).toBe(413);
  expect(familyRows()).toBe(before);
});
it('reads explicit account-local original candidates with actual booking/split CAS after proving50000 and minus13000', async () => {
  const older = expense(-10000, '2026-09-20'),
    newer = expense(-3000, '2026-10-05');
  expect(await balances()).toEqual({ fund: 50000, card: -13000 });
  const p = getBooking(opened.db, newer)!;
  expect(p.amountCents).toBe(-3000);
  expect(getBooking(opened.db, older)!.amountCents).toBe(-10000);
  const bookingRevision = history(opened.db, 'booking', newer)[0]!.id,
    split = p.splits[0]!,
    splitRevision = history(opened.db, 'booking_split', split.id)[0]!.id;
  expect(bookingRevision).toMatch(/^[a-f0-9-]{36}$/);
  expect(splitRevision).toMatch(/^[a-f0-9-]{36}$/);
  const response = await request(
    'GET',
    '/statement-settlements/candidates?cardAccountId=' + CARD + '&kind=original&limit=1',
  );
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  const page = (await response.json()) as {
    kind: string;
    items: { kind: string; date: string; selection: unknown }[];
    nextCursor: unknown;
  };
  expect(page.kind).toBe('original');
  expect(page.items).toHaveLength(1);
  expect(page.items[0]).toMatchObject({
    kind: 'original',
    date: '2026-10-05',
    selection: {
      bookingId: newer,
      bookingRevision,
      splitId: split.id,
      splitRevision,
      accountId: CARD,
      currency: 'EUR',
      bookingAmountCents: -3000,
      splitAmountCents: -3000,
      categoryId: EXPENSE,
    },
  });
  expect(page.nextCursor).toEqual({ date: '2026-10-05', id: split.id });
});
const candidatePage = async (kind: string, extra: Record<string, string> = {}) => {
  const response = await request(
    'GET',
    '/statement-settlements/candidates?' +
      new URLSearchParams({ cardAccountId: CARD, kind, ...extra }),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  return (await response.json()) as StatementCandidatePage;
};
const candidateReadSnapshot = () =>
  JSON.stringify([
    familyRows(),
    opened.sqlite.prepare('SELECT total_changes() AS n').get(),
    ...['statement_intake', 'receipt', 'account'].map((t) =>
      opened.sqlite.prepare('SELECT * FROM ' + t + ' ORDER BY rowid').all(),
    ),
  ]);
it('pages only the selected account with real reconciled originals and performs zero writes', async () => {
  const older = expense(-10000, '2026-09-20'),
    newer = expense(-3000, '2026-10-05'),
    foreign = '72700000-0000-4000-8000-000000000099';
  accounts.create(
    opened.db,
    {
      id: foreign,
      name: 'Synthetic other card',
      type: 'credit_card',
      role: 'budget',
      onBudget: true,
      openingDate: '2026-09-01',
    },
    ctx,
  );
  createBooking(
    opened.db,
    {
      accountId: foreign,
      date: '2026-10-06',
      amountCents: -9000,
      splits: [{ categoryId: EXPENSE, amountCents: -9000 }],
    },
    ctx,
  );
  updateBooking(opened.db, newer, { status: 'reconciled' }, ctx);
  const before = candidateReadSnapshot(),
    first = await candidatePage('original', { limit: '1' });
  expect(first.items.map((i) => (i as StatementOriginalCandidate).selection.bookingId)).toEqual([
    newer,
  ]);
  expect((first.items[0] as StatementOriginalCandidate).status).toBe('reconciled');
  expect((first.items[0] as StatementOriginalCandidate).selection.bookingRevision).toBe(
    history(opened.db, 'booking', newer)[0]!.id,
  );
  const second = await candidatePage('original', {
    limit: '1',
    beforeDate: first.nextCursor!.date,
    beforeId: first.nextCursor!.id,
  });
  expect(second.items.map((i) => (i as StatementOriginalCandidate).selection.bookingId)).toEqual([
    older,
  ]);
  expect(second.nextCursor).toBeNull();
  expect(candidateReadSnapshot()).toBe(before);
});
it('reads successive actual booking CAS after a memo change and Undo, and rejects the previously selected original atomically', async () => {
  const id = expense(-8000, '2026-09-20'),
    source = await reviewedSource(7875),
    configRevision = await configure('synthetic-727-read-cas-config');
  const stale = (await candidatePage('original')).items[0] as StatementOriginalCandidate;
  updateBooking(opened.db, id, { memo: 'Synthetic rereviewed memo' }, ctx);
  const changed = (await candidatePage('original')).items[0] as StatementOriginalCandidate;
  expect(changed.selection.bookingRevision).toBe(history(opened.db, 'booking', id)[0]!.id);
  expect(changed.selection.bookingRevision).not.toBe(stale.selection.bookingRevision);
  const evidence = {
    origin: 'owner',
    bonusCents: 125,
    creditDate: '2026-09-30',
    treatment: 'gross_then_credit',
    existingCreditsReviewed: true,
    feesAdjustmentsReviewed: true,
    selectedOriginals: [stale.selection],
    allocations: [{ categoryId: EXPENSE, amountCents: 125 }],
  };
  const before = familyRows(),
    response = await request('POST', '/statement-settlements/actions', {
      operation: 'confirm_bonus',
      key: 'synthetic-727-stale-read-rejected',
      source,
      configRevision,
      evidence,
    });
  expect(response.status).toBe(409);
  expect(familyRows()).toBe(before);
  undo(opened.db, { groupId: history(opened.db, 'booking', id)[0]!.groupId! }, ctx);
  const restored = (await candidatePage('original')).items[0] as StatementOriginalCandidate;
  expect(restored.selection.bookingRevision).toBe(history(opened.db, 'booking', id)[0]!.id);
  expect(restored.selection.bookingRevision).not.toBe(changed.selection.bookingRevision);
  expect(restored.selection.bookingRevision).not.toBe(stale.selection.bookingRevision);
  expect(getBooking(opened.db, id)!.amountCents).toBe(-8000);
});
it('returns actual whole-credit and two-leg CAS for explicit linking while preserving all existing monetary tuples', async () => {
  expense(-8000, '2026-09-20');
  const source = await reviewedSource(7875),
    configRevision = await configure('synthetic-727-read-link-config');
  const original = (await candidatePage('original')).items[0] as StatementOriginalCandidate;
  const evidence = {
    origin: 'owner',
    bonusCents: 125,
    creditDate: '2026-09-30',
    treatment: 'gross_then_credit',
    existingCreditsReviewed: true,
    feesAdjustmentsReviewed: true,
    selectedOriginals: [original.selection],
    allocations: [{ categoryId: EXPENSE, amountCents: 125 }],
  };
  const ready = await action({
    operation: 'confirm_bonus',
    key: 'synthetic-727-read-ready-bonus',
    source,
    configRevision,
    evidence,
  });
  const creditId = createBooking(
    opened.db,
    {
      accountId: CARD,
      date: '2026-09-30',
      amountCents: 125,
      status: 'reconciled',
      splits: [
        { categoryId: EXPENSE, amountCents: 125, incomeTypeId: schema.INCOME_TYPES.refund.id },
      ],
    },
    ctx,
  );
  const credit = (await candidatePage('credit', { bonusId: ready.bonusId! }))
    .items[0] as StatementCreditCandidate;
  expect(credit.selection.bookingId).toBe(creditId);
  expect(credit.selection.bookingRevision).toBe(history(opened.db, 'booking', creditId)[0]!.id);
  expect(credit.status).toBe('reconciled');
  const creditBefore = moneyRows();
  await action({
    operation: 'link_bonus',
    key: 'synthetic-727-read-link-credit',
    bonusId: ready.bonusId,
    expectedRevision: ready.bonusRevision,
    source,
    configRevision,
    selectedOriginals: evidence.selectedOriginals.map(
      ({ bookingId, bookingRevision, splitId, splitRevision }) => ({
        bookingId,
        bookingRevision,
        splitId,
        splitRevision,
      }),
    ),
    ...credit.selection,
  });
  expect(moneyRows()).toBe(creditBefore);
  expect((await candidatePage('original')).omitted.consumed).toBe(1);
  expect((await candidatePage('original', { bonusId: ready.bonusId! })).items).toHaveLength(1);
  const settlement = await action({
    operation: 'confirm',
    key: 'synthetic-727-read-ready-settlement',
    source,
    configRevision,
  });
  const existing = createTransfer(
    opened.db,
    {
      fromAccountId: FUND,
      toAccountId: CARD,
      date: '2026-10-10',
      amountCents: 7875,
      status: 'pending',
    },
    ctx,
  );
  const transfer = (await candidatePage('transfer', { settlementId: settlement.settlementId! }))
    .items[0] as StatementTransferCandidate;
  expect(transfer.selection).toEqual({
    transferId: existing.transferId,
    fromBookingId: existing.fromBookingId,
    fromRevision: history(opened.db, 'booking', existing.fromBookingId)[0]!.id,
    toBookingId: existing.toBookingId,
    toRevision: history(opened.db, 'booking', existing.toBookingId)[0]!.id,
  });
  expect(Object.hasOwn(transfer.selection, 'transferRevision')).toBe(false);
  const transferBefore = moneyRows();
  await action({
    operation: 'link_transfer',
    key: 'synthetic-727-read-link-transfer',
    settlementId: settlement.settlementId,
    expectedRevision: settlement.settlementRevision,
    source,
    configRevision,
    ...transfer.selection,
  });
  expect(moneyRows()).toBe(transferBefore);
  expect(await balances('2026-10-10')).toEqual({ fund: 42125, card: 0 });
});
it('fails closed for missing audit history and invalid or foreign candidate targets without any read writes', async () => {
  const id = expense(-8000, '2026-09-20'),
    split = getBooking(opened.db, id)!.splits[0]!;
  opened.sqlite
    .prepare("DELETE FROM audit_log WHERE entity_type='booking_split' AND entity_id=?")
    .run(split.id);
  const before = candidateReadSnapshot(),
    page = await candidatePage('original');
  expect(page.items).toEqual([]);
  expect(page.omitted).toEqual({ missing_history: 1 });
  for (const query of [
    'kind=original&limit=26',
    'kind=original&beforeDate=2026-10-01',
    'kind=credit',
    'kind=transfer',
    'kind=original&settlementId=' + FUND,
    'kind=transfer&settlementId=' + FUND + '&bonusId=' + CARD,
  ]) {
    const response = await request(
      'GET',
      '/statement-settlements/candidates?cardAccountId=' + CARD + '&' + query,
    );
    expect(response.status).toBe(400);
  }
  const missing = await request(
    'GET',
    '/statement-settlements/candidates?cardAccountId=' + CARD + '&kind=credit&bonusId=' + FUND,
  );
  expect(missing.status).toBe(404);
  expect(candidateReadSnapshot()).toBe(before);
});
it('refuses invalid raw page-end identity instead of returning a cursor that cannot be read or echoing its text', async () => {
  expense(-10000, '2026-09-20');
  const newer = expense(-3000, '2026-10-05'),
    split = getBooking(opened.db, newer)!.splits[0]!,
    invalid = 'synthetic-727-invalid-page-key';
  opened.sqlite.prepare('UPDATE booking_split SET id=? WHERE id=?').run(invalid, split.id);
  expect(getBooking(opened.db, newer)!.splits[0]!.id).toBe(invalid);
  const before = candidateReadSnapshot(),
    response = await request(
      'GET',
      '/statement-settlements/candidates?cardAccountId=' + CARD + '&kind=original&limit=1',
    );
  expect(response.status).toBe(422);
  expect(await response.text()).not.toContain(invalid);
  expect(candidateReadSnapshot()).toBe(before);
});
it('does not disclose another card target even when the requested bonus really exists', async () => {
  expense(-8000, '2026-09-20');
  const source = await reviewedSource(7875),
    configRevision = await configure('synthetic-727-foreign-target-config');
  const original = (await candidatePage('original')).items[0] as StatementOriginalCandidate;
  const ready = await action({
    operation: 'confirm_bonus',
    key: 'synthetic-727-foreign-target-bonus',
    source,
    configRevision,
    evidence: {
      origin: 'owner',
      bonusCents: 125,
      creditDate: '2026-09-30',
      treatment: 'gross_then_credit',
      existingCreditsReviewed: true,
      feesAdjustmentsReviewed: true,
      selectedOriginals: [original.selection],
      allocations: [{ categoryId: EXPENSE, amountCents: 125 }],
    },
  });
  const other = '72700000-0000-4000-8000-000000000098';
  accounts.create(
    opened.db,
    {
      id: other,
      name: 'Synthetic other card',
      type: 'credit_card',
      role: 'budget',
      onBudget: true,
      openingDate: '2026-09-01',
    },
    ctx,
  );
  const before = candidateReadSnapshot(),
    response = await request(
      'GET',
      '/statement-settlements/candidates?cardAccountId=' +
        other +
        '&kind=credit&bonusId=' +
        ready.bonusId,
    );
  expect(response.status).toBe(404);
  const body = await response.text();
  expect(body).not.toContain(source.intakeId);
  expect(body).not.toContain(original.selection.bookingId);
  expect(candidateReadSnapshot()).toBe(before);
});
