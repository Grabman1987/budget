import { afterEach, beforeEach, expect, it } from 'vitest';
import type { ParsedPayrollDocument } from '@budget/domain';
import { PAYSLIP_PARSER_VERSION } from '@budget/domain';
import { createTestDatabase, type OpenedDatabase } from '../client';
import * as schema from '../schema';
import { accounts, createEntity } from './entities';
import { createBooking, getBooking } from './bookings';
import { history, undo } from './audit';
import { balanceSeries } from './ledger-queries';
import {
  automaticallyDecidePayslip,
  decidePayslipIntake,
  getPayslipIntake,
  payslipAutomationConfigSnapshot,
  payslipAutomationSnapshot,
  readPayslipPayoutAssociation,
  setPayslipSourceConfig,
  stagePayslip,
} from './payslip-intake';

const ACCOUNT = '74100000-0000-4000-8000-000000000501';
const EMPLOYER = '74100000-0000-4000-8000-000000000502';
const ctx = { actor: 'synthetic-payroll-owner-741' };
let opened: OpenedDatabase;
const document = (): ParsedPayrollDocument => ({
  documentType: 'payslip',
  periodSource: 'content',
  parserVersion: PAYSLIP_PARSER_VERSION,
  payoutDate: '2031-01-31',
  differenceCents: 0,
  warnings: [],
  draft: {
    month: '2031-01',
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
});
const config = () => ({
  salaryAccountId: ACCOUNT,
  automation: { payeeId: EMPLOYER },
  wageTypes: {},
});
beforeEach(() => {
  opened = createTestDatabase();
  accounts.create(
    opened.db,
    {
      id: ACCOUNT,
      name: 'Synthetic payroll account',
      type: 'checking',
      role: 'budget',
      onBudget: true,
      openingDate: '2030-01-01',
      openingBalanceCents: 50000,
    },
    ctx,
  );
  createEntity(opened.db, schema.payee, { id: EMPLOYER, name: 'Synthetic payroll sender' }, ctx);
  setPayslipSourceConfig(opened.db, config(), ctx);
});
afterEach(() => opened.close());
function stage(parsed = document(), sha = 'a'.repeat(64)) {
  const parsedWith = payslipAutomationConfigSnapshot(opened.db);
  const source = stagePayslip(
    opened.db,
    {
      sha256: sha,
      source: 'manual',
      sizeBytes: 100,
      filename: 'synthetic-payroll-741.pdf',
      parsed,
    },
    ctx,
  );
  return { id: source.id, snapshot: payslipAutomationSnapshot(opened.db, source.id, parsedWith) };
}
const perform = (source: ReturnType<typeof stage>) =>
  automaticallyDecidePayslip(opened.db, source.id, source.snapshot, ctx);
const balance = () =>
  balanceSeries(opened.db, ACCOUNT, { from: '2031-01-31', to: '2031-01-31' })[0]!.balanceCents;
const snapshot = () =>
  JSON.stringify(
    (
      opened.sqlite
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
        )
        .all() as { name: string }[]
    ).map(({ name }) => [
      name,
      opened.sqlite.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all(),
    ]),
  );
const existing = (payeeId: string | null = EMPLOYER) =>
  createBooking(
    opened.db,
    {
      accountId: ACCOUNT,
      date: '2031-01-31',
      amountCents: 297500,
      payeeId,
      status: 'confirmed',
      splits: [
        { categoryId: null, amountCents: 287500, incomeTypeId: 'income-salary' },
        { categoryId: null, amountCents: 10000, incomeTypeId: 'income-refund' },
      ],
    },
    ctx,
  );

it('records the literal payout and persisted source association, then removes that live result through whole Undo', () => {
  const source = stage(),
    result = perform(source);
  expect(result).toMatchObject({ status: 'booked', reason: 'unambiguous_source' });
  expect(result.groupId).toEqual(expect.any(String));
  const booking = getBooking(opened.db, result.bookingId!)!;
  expect(booking).toMatchObject({
    accountId: ACCOUNT,
    amountCents: 297500,
    date: '2031-01-31',
    status: 'pending',
    payeeId: EMPLOYER,
  });
  expect(booking.splits).toMatchObject([
    { amountCents: 287500, incomeTypeId: 'income-salary', categoryId: null },
    { amountCents: 10000, incomeTypeId: 'income-refund', categoryId: null },
  ]);
  expect(balance()).toBe(347500);
  expect(readPayslipPayoutAssociation(opened.db, source.id)).toEqual({
    payslipId: result.payslipId,
    bookingId: result.bookingId,
    accountId: ACCOUNT,
  });
  const beforeReplay = snapshot();
  expect(perform(source)).toMatchObject({ status: 'unchanged', groupId: null });
  expect(snapshot()).toBe(beforeReplay);
  const entries = opened.sqlite
    .prepare('SELECT actor FROM audit_log WHERE group_id=?')
    .all(result.groupId) as { actor: string }[];
  expect(entries.length).toBeGreaterThan(3);
  expect(entries.every((entry) => entry.actor.startsWith('document-automation:payroll@'))).toBe(
    true,
  );
  const reversed = undo(opened.db, { groupId: result.groupId! }, ctx);
  expect(balance()).toBe(50000);
  expect(readPayslipPayoutAssociation(opened.db, source.id)).toBeNull();
  expect(getPayslipIntake(opened.db, source.id).status).toBe('pending');
  const undone = snapshot();
  expect(perform(source)).toMatchObject({
    status: 'pruefen',
    reason: 'source_changed',
    groupId: null,
  });
  expect(snapshot()).toBe(undone);
  undo(opened.db, { groupId: reversed.groupId }, ctx);
  expect(readPayslipPayoutAssociation(opened.db, source.id)?.bookingId).toBe(result.bookingId);
  expect(balance()).toBe(347500);
  expect(opened.sqlite.pragma('foreign_key_check')).toEqual([]);
});

it('links a genuine existing payout without changing its money, splits, status or booking history', () => {
  const bookingId = existing(),
    before = getBooking(opened.db, bookingId),
    audit = history(opened.db, 'booking', bookingId);
  const source = stage(),
    result = perform(source);
  expect(result).toMatchObject({ status: 'linked', bookingId });
  expect(readPayslipPayoutAssociation(opened.db, source.id)).toEqual({
    payslipId: result.payslipId,
    bookingId,
    accountId: ACCOUNT,
  });
  expect(getBooking(opened.db, bookingId)).toEqual(before);
  expect(history(opened.db, 'booking', bookingId)).toEqual(audit);
  expect(balance()).toBe(347500);
  undo(opened.db, { groupId: result.groupId! }, ctx);
  expect(getBooking(opened.db, bookingId)).toEqual(before);
  expect(history(opened.db, 'booking', bookingId)).toEqual(audit);
  expect(readPayslipPayoutAssociation(opened.db, source.id)).toBeNull();
  expect(balance()).toBe(347500);
});

it('keeps an amount-only incoming movement under review instead of creating a second salary', () => {
  existing(null);
  const source = stage(),
    before = snapshot();
  expect(perform(source)).toEqual({
    status: 'pruefen',
    reason: 'booking_needs_review',
    groupId: null,
  });
  expect(snapshot()).toBe(before);
  expect(readPayslipPayoutAssociation(opened.db, source.id)).toBeNull();
});

it('keeps two genuine equal payouts ambiguous without changing either original booking', () => {
  const first = existing(),
    second = existing();
  expect(first).not.toBe(second);
  const source = stage(),
    before = snapshot();
  expect(perform(source)).toEqual({
    status: 'pruefen',
    reason: 'booking_ambiguous',
    groupId: null,
  });
  expect(snapshot()).toBe(before);
  expect(balance()).toBe(645000);
  expect(readPayslipPayoutAssociation(opened.db, source.id)).toBeNull();
});

it('keeps a rejected source read-only and never presents a payout association', () => {
  const source = stage();
  decidePayslipIntake(opened.db, source.id, { action: 'reject', bookingId: null }, ctx);
  const before = snapshot();
  expect(perform(source)).toEqual({
    status: 'unchanged',
    reason: 'already_decided',
    groupId: null,
  });
  expect(snapshot()).toBe(before);
  expect(readPayslipPayoutAssociation(opened.db, source.id)).toBeNull();
});

it('rejects a config ABA even when the current serialized source configuration is restored', () => {
  const source = stage();
  setPayslipSourceConfig(opened.db, { salaryAccountId: ACCOUNT, wageTypes: {} }, ctx);
  setPayslipSourceConfig(opened.db, config(), ctx);
  const before = snapshot();
  expect(perform(source)).toEqual({ status: 'pruefen', reason: 'source_changed', groupId: null });
  expect(snapshot()).toBe(before);
  expect(balance()).toBe(50000);
});

it('does not repost an undone payroll slot from a different-byte source', () => {
  const result = perform(stage());
  undo(opened.db, { groupId: result.groupId! }, ctx);
  const variant = stage(document(), 'b'.repeat(64)),
    before = snapshot();
  expect(perform(variant)).toEqual({
    status: 'pruefen',
    reason: 'payroll_previously_undone',
    groupId: null,
  });
  expect(snapshot()).toBe(before);
  expect(balance()).toBe(50000);
  expect(readPayslipPayoutAssociation(opened.db, variant.id)).toBeNull();
});

it('rolls back a late payslip insert failure including payout, splits, receipt edge and audit', () => {
  const source = stage();
  let observedPayoutInsert = 0;
  opened.sqlite.function('synthetic_payroll_observe', () => {
    observedPayoutInsert++;
    return 0;
  });
  opened.sqlite.exec(
    'CREATE TRIGGER synthetic_payroll_741_observe AFTER INSERT ON booking BEGIN SELECT synthetic_payroll_observe(); END',
  );
  opened.sqlite.exec(
    "CREATE TRIGGER synthetic_payroll_741_late BEFORE INSERT ON payslip BEGIN SELECT RAISE(ABORT, 'synthetic payroll late failure'); END",
  );
  const before = snapshot();
  expect(() => perform(source)).toThrow('synthetic payroll late failure');
  expect(observedPayoutInsert).toBe(1);
  expect(snapshot()).toBe(before);
  expect(balance()).toBe(50000);
  expect(readPayslipPayoutAssociation(opened.db, source.id)).toBeNull();
  opened.sqlite.exec('DROP TRIGGER synthetic_payroll_741_late');
  opened.sqlite.exec('DROP TRIGGER synthetic_payroll_741_observe');
  expect(perform(source)).toMatchObject({ status: 'booked' });
});
