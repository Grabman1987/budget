import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import {
  createBooking,
  createTestDatabase,
  getPayslipIntake,
  listPayslips,
  listReceipts,
  monthResultRead,
  schema,
  setPayslipSourceConfig,
  stagePayslip,
  decidePayslipIntake,
  undo,
  updateBooking,
  updateTracked,
  type OpenedDatabase,
} from '@budget/db';
import { PAYSLIP_PARSER_VERSION, type ParsedPayrollDocument } from '@budget/domain';
import { previewPayslipPayoutSplit } from '../../../../packages/db/src/repos/payslip-payout-split';
import { seedBasics } from '../../../../packages/db/src/repos/test-helpers';
import { BankSync } from './service';
import type { BankProvider } from './provider';
import { bankSecretBox } from './secrets';

let opened: OpenedDatabase;
beforeEach(() => {
  opened = createTestDatabase();
  seedBasics(opened.db);
});
afterEach(() => opened.close());
const ctx = { actor: 'synthetic-609-owner' };
const document: ParsedPayrollDocument = {
  documentType: 'payslip',
  periodSource: 'content',
  parserVersion: PAYSLIP_PARSER_VERSION,
  payoutDate: '2026-09-30',
  differenceCents: 0,
  warnings: [],
  draft: {
    month: '2026-09',
    kind: 'regular',
    specialType: null,
    grossCents: 400000,
    svCents: 68000,
    taxCents: 44000,
    netCents: 297500,
    bookingId: null,
    receiptId: null,
    lines: [
      { section: 'deduction', label: 'Synthetic deduction', amountCents: 500 },
      { section: 'reimbursement', label: 'Synthetic reimbursement', amountCents: 10000 },
    ],
  },
};
async function originalBank(postBooked = false) {
  let now = new Date('2026-10-01T12:00:00Z');
  const salary = {
    bankStatus: 'booked' as const,
    reference: 'synthetic-salary-609',
    date: '2026-09-30',
    amountCents: 297500,
    currency: 'EUR',
    memo: 'Synthetic salary',
    rawPayee: 'Synthetic employer',
  };
  const provider: BankProvider = {
    institutions: vi.fn(async () => [
      { name: 'Synthetic bank', country: 'AT', maximumConsentSeconds: 15552000 },
    ]),
    authorize: vi.fn(async () => 'https://synthetic.invalid/authorize'),
    session: vi.fn(async () => ({
      id: 'synthetic-session-609',
      validUntil: '2026-12-01T12:00:00Z',
      accounts: [{ uid: 'synthetic-account-609', label: 'Synthetic source', currency: 'EUR' }],
    })),
    transactions: vi.fn(async () => ({ rows: [salary], skippedInvalid: 0, skippedOutOfWindow: 0 })),
    balance: vi.fn(async () => ({ amountCents: 397500, currency: 'EUR', date: '2026-09-30' })),
  };
  const service = new BankSync(
    opened.db,
    provider,
    bankSecretBox('ab'.repeat(32)),
    'https://synthetic.invalid',
    () => now,
  );
  await service.start('Synthetic bank', 'AT', 'synthetic-initiator-609');
  const state = vi.mocked(provider.authorize).mock.calls[0]![1];
  const consent = await service.callback('synthetic-code-609', state, 'synthetic-initiator-609');
  const mapping = opened.db
    .select({ id: schema.bankSyncAccount.id })
    .from(schema.bankSyncAccount)
    .where(eq(schema.bankSyncAccount.consentId, consent.id))
    .get()!;
  service.map(mapping.id, 'giro', '2026-09-01');
  if (postBooked) service.setPolicy(consent.id, true);
  await service.tick();
  const candidate = opened.db.select().from(schema.bankSyncCandidate).get()!;
  const payout = postBooked
    ? opened.db.select().from(schema.booking).get()!.id
    : service.confirm(candidate.id, null, {
        actions: { payeeId: 'p1', incomeTypeId: 'income-salary' },
      }).bookingId;
  setPayslipSourceConfig(
    opened.db,
    { salaryAccountId: 'giro', automation: { payeeId: 'p1' }, wageTypes: {} },
    ctx,
  );
  const id = stagePayslip(
    opened.db,
    {
      sha256: 'b'.repeat(64),
      source: 'manual',
      sizeBytes: 100,
      filename: 'synthetic-bank-payroll-609.pdf',
      parsed: document,
    },
    ctx,
  ).id;
  const context = { accountId: 'giro', payoutDate: '2026-09-30', expectedOccurrenceId: null };
  return {
    id,
    payout,
    candidate,
    mapping,
    service,
    provider,
    salary,
    nextDay: () => {
      now = new Date(now.getTime() + 86400000);
    },
    preview: () =>
      previewPayslipPayoutSplit(opened.db, getPayslipIntake(opened.db, id), payout, context),
    confirm: (splitToken: string) =>
      decidePayslipIntake(
        opened.db,
        id,
        { action: 'confirm', bookingId: payout, ...context, splitToken },
        ctx,
      ),
  };
}
const rows = (id: string) => ({
  booking: opened.db.select().from(schema.booking).where(eq(schema.booking.id, id)).get(),
  splits: opened.db
    .select()
    .from(schema.bookingSplit)
    .where(eq(schema.bookingSplit.bookingId, id))
    .all(),
});
function refusesWithoutWrites(fixture: Awaited<ReturnType<typeof originalBank>>, token: string) {
  const before = rows(fixture.payout),
    audits = opened.db.select().from(schema.auditLog).all();
  expect(() => fixture.confirm(token)).toThrow(/geändert/);
  expect(rows(fixture.payout)).toEqual(before);
  expect(opened.db.select().from(schema.auditLog).all()).toEqual(audits);
  expect(getPayslipIntake(opened.db, fixture.id).status).toBe('pending');
  expect(listPayslips(opened.db)).toHaveLength(0);
}

it('splits a real fresh BankSync confirmation into literal salary/refund cents and exactly undoes it', async () => {
  const fixture = await originalBank();
  const before = rows(fixture.payout);
  expect(before.booking).toMatchObject({
    source: 'bank',
    status: 'confirmed',
    amountCents: 297500,
    bankSourceId: fixture.mapping.id,
    bankRawText: 'Synthetic salary',
    bankRawPayee: 'Synthetic employer',
  });
  expect(fixture.preview()).toMatchObject({
    status: 'eligible',
    salaryCents: 287500,
    reimbursementsCents: 10000,
  });
  const saved = fixture.confirm(fixture.preview().token!);
  expect(opened.db.select().from(schema.booking).all()).toHaveLength(1);
  expect(rows(fixture.payout).booking).toEqual(before.booking);
  expect(rows(fixture.payout).splits).toMatchObject([
    { amountCents: 287500, incomeTypeId: 'income-salary' },
    { amountCents: 10000, incomeTypeId: 'income-refund' },
  ]);
  createBooking(
    opened.db,
    {
      accountId: 'giro',
      date: '2026-09-30',
      amountCents: -100000,
      splits: [{ categoryId: 'essen', amountCents: -100000 }],
    },
    ctx,
  );
  expect(monthResultRead(opened.db, '2026-09-30', '2026-09')).toMatchObject({
    earnedCents: 287500,
    consumptionCents: 100000,
    savedCents: 187500,
    savingsRateBp: 6522,
  });
  undo(opened.db, { groupId: saved.groupId }, ctx);
  expect(rows(fixture.payout)).toEqual(before);
  expect(listReceipts(opened.db, fixture.payout)).toHaveLength(0);
  expect(listPayslips(opened.db)).toHaveLength(0);
  expect(getPayslipIntake(opened.db, fixture.id).status).toBe('pending');
});

it.each(['missing', 'account', 'amount', 'source', 'raw', 'date', 'currency'] as const)(
  'refuses a %s retained bank candidate without writes',
  async (change) => {
    const fixture = await originalBank(),
      token = fixture.preview().token!;
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    // Negative storage faults only; the positive provenance is always produced by the real service.
    if (change === 'missing')
      opened.db
        .delete(schema.bankSyncCandidate)
        .where(eq(schema.bankSyncCandidate.id, fixture.candidate.id))
        .run();
    else
      opened.db
        .update(schema.bankSyncCandidate)
        .set(
          change === 'account'
            ? { accountId: 'spar' }
            : change === 'amount'
              ? { amountCents: 297501 }
              : change === 'source'
                ? { sourceId: null }
                : change === 'raw'
                  ? { rawPayee: 'Changed synthetic sender' }
                  : change === 'date'
                    ? { date: '2026-09-29' }
                    : { currency: 'USD' },
        )
        .where(eq(schema.bankSyncCandidate.id, fixture.candidate.id))
        .run();
    expect(fixture.preview().status).toBe('unavailable');
    refusesWithoutWrites(fixture, token);
  },
);

it('refuses a bank mapping with missing original origin audit rather than inventing it', async () => {
  const fixture = await originalBank(),
    token = fixture.preview().token!;
  expect(token).toMatch(/^[a-f0-9]{64}$/);
  // Remove known provenance only in this negative fault fixture; never synthesize replacement evidence.
  opened.db
    .delete(schema.auditLog)
    .where(
      and(
        eq(schema.auditLog.entityType, 'bank_sync_account'),
        eq(schema.auditLog.entityId, fixture.mapping.id),
        eq(schema.auditLog.action, 'create'),
      ),
    )
    .run();
  expect(fixture.preview().status).toBe('unavailable');
  refusesWithoutWrites(fixture, token);
});

it.each(['candidate', 'mapping'] as const)(
  'rejects an audited %s ABA even when selected values return exactly',
  async (target) => {
    const fixture = await originalBank(),
      token = fixture.preview().token!;
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    // Inject a negative audited fault; no app permission or protocol Undo rule is changed.
    if (target === 'candidate') {
      updateTracked(
        opened.db,
        schema.bankSyncCandidate,
        [fixture.candidate.id],
        { memo: 'Synthetic changed evidence' },
        ctx,
      );
      updateTracked(
        opened.db,
        schema.bankSyncCandidate,
        [fixture.candidate.id],
        { memo: fixture.candidate.memo },
        ctx,
      );
    } else {
      updateTracked(
        opened.db,
        schema.bankSyncAccount,
        [fixture.mapping.id],
        { accountId: 'spar' },
        ctx,
      );
      updateTracked(
        opened.db,
        schema.bankSyncAccount,
        [fixture.mapping.id],
        { accountId: 'giro' },
        ctx,
      );
    }
    expect(fixture.preview().status).toBe('unavailable');
    refusesWithoutWrites(fixture, token);
  },
);

it('binds the token to safe mapping history when an ordinary provider poll advances it', async () => {
  const fixture = await originalBank(),
    token = fixture.preview().token!;
  expect(token).toMatch(/^[a-f0-9]{64}$/);
  fixture.nextDay();
  await fixture.service.tick();
  expect(fixture.preview().status).toBe('eligible');
  expect(fixture.preview().token).not.toBe(token);
  refusesWithoutWrites(fixture, token);
});

it('keeps changed provider evidence link-only even when the retained candidate is unchanged', async () => {
  const fixture = await originalBank(),
    token = fixture.preview().token!;
  expect(token).toMatch(/^[a-f0-9]{64}$/);
  vi.mocked(fixture.provider.transactions).mockResolvedValue({
    rows: [{ ...fixture.salary, memo: 'Changed provider salary' }],
    skippedInvalid: 0,
    skippedOutOfWindow: 0,
  });
  fixture.nextDay();
  await fixture.service.tick();
  expect(fixture.preview().status).toBe('unavailable');
  refusesWithoutWrites(fixture, token);
});

it('keeps a real automatic unclassified bank posting link-only after owner classification', async () => {
  const fixture = await originalBank(true);
  updateBooking(
    opened.db,
    fixture.payout,
    {
      payeeId: 'p1',
      splits: [{ categoryId: null, incomeTypeId: 'income-salary', amountCents: 297500 }],
    },
    ctx,
  );
  expect(fixture.preview().status).toBe('unavailable');
  refusesWithoutWrites(fixture, '0'.repeat(64));
});
