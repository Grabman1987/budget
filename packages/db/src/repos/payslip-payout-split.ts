import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { and, eq, getTableColumns, inArray, isNull, or, sql } from 'drizzle-orm';
import {
  PAYSLIP_PARSER_VERSION, payrollTotals, payslipInput, payslipSourceConfig,
  type ParsedPayrollDocument,
} from '@budget/domain';
import {
  account, appSetting, auditLog, booking, bookingReceipt, bookingSplit,
  expectedOccurrence, expectedPayment, importMapping, importRun, INCOME_TYPES,
  payee, payslip, payslipIntake, receipt, receiptSplit,
} from '../schema';
import { history, type AuditContext, type Snapshot } from './audit';
import { updateBooking } from './bookings';
import { assertContactBookingWrite } from './contact-invariants';
import { ConflictError } from './errors';
import { assertTradeSettlementBookingWrite } from './invariants';
import { assertStatementBookingWrite } from './statement-settlement-invariants';
import type { Executor } from './types';

type Source = typeof payslipIntake.$inferSelect & { parsed: ParsedPayrollDocument };
export type PayoutSplitContext = {
  accountId: string | null;
  payoutDate: string | null;
  expectedOccurrenceId: string | null;
};
export type PayoutSplitPreview = {
  status: 'eligible' | 'already_correct' | 'locked' | 'unavailable';
  token?: string;
  salaryCents?: number;
  reimbursementsCents?: number;
};
const unavailable: PayoutSplitPreview = { status: 'unavailable' };

/** Require complete original SQL-column snapshots, including identities and unrelated metadata. */
function originalSnapshot(
  columns: Record<string, { name: string }>, row: Record<string, unknown>, snapshot: Snapshot | null,
) {
  const current = Object.fromEntries(Object.entries(columns).map(([prop, column]) => [column.name, row[prop] ?? null]));
  return snapshot !== null && isDeepStrictEqual(current, snapshot);
}

/** Read-only eligibility for an explicit action; amount/date matching alone never authorizes it. */
export function previewPayslipPayoutSplit(
  db: Executor, source: Source, bookingId: string, context: PayoutSplitContext,
): PayoutSplitPreview {
  const payout = db.select().from(booking).where(and(eq(booking.id, bookingId), isNull(booking.deletedAt))).get();
  if (!payout) return unavailable;
  if (payout.status === 'reconciled') return { status: 'locked' };
  const parsed = source.parsed;
  const draft = parsed.draft;
  if (!draft || source.status !== 'pending' || parsed.documentType !== 'payslip' ||
    parsed.parserVersion !== PAYSLIP_PARSER_VERSION || parsed.periodSource !== 'content' ||
    parsed.warnings.length || parsed.unmappedWageTypes?.length ||
    !context.payoutDate || !parsed.payoutDate || context.payoutDate !== parsed.payoutDate ||
    !Number.isFinite(Date.parse(context.payoutDate)) || !Number.isFinite(Date.parse(payout.date)) ||
    context.accountId !== payout.accountId || payout.currency !== 'EUR' ||
    payout.amountCents !== draft.netCents || payout.amountCents <= 0 || payout.transferId ||
    payout.projectId || payout.originalAmountCents !== null ||
    Math.abs(Date.parse(payout.date) - Date.parse(context.payoutDate)) > 5 * 86_400_000) return unavailable;
  const totals = payrollTotals([draft]);
  const difference = totals.calculatedNetCents - draft.netCents;
  const salaryCents = draft.netCents - totals.reimbursementsCents;
  if (!Number.isSafeInteger(difference) || Math.abs(difference) > 1 ||
    difference !== parsed.differenceCents || !Number.isSafeInteger(salaryCents) || salaryCents <= 0 ||
    !Number.isSafeInteger(totals.reimbursementsCents) || totals.reimbursementsCents < 0 ||
    !payslipInput.safeParse({ ...draft, lines: [...draft.lines, ...(difference ? [{
      section: 'deduction', label: 'Rundung (Summenprüfung)', amountCents: difference,
    }] : [])] }).success) return unavailable;
  const target = db.select().from(account).where(eq(account.id, payout.accountId)).get();
  const original = db.select().from(receipt).where(eq(receipt.id, source.receiptId)).get();
  const configRow = db.select().from(appSetting).where(eq(appSetting.id, 'payslip.source')).get();
  let config: ReturnType<typeof payslipSourceConfig.parse> | undefined;
  try { config = configRow ? payslipSourceConfig.parse(JSON.parse(configRow.value)) : undefined; } catch { return unavailable; }
  const sender = payout.payeeId ? db.select().from(payee).where(eq(payee.id, payout.payeeId)).get() : undefined;
  if (!target || target.deletedAt || target.closedAt || target.currency !== 'EUR' ||
    payout.date < target.openingDate || !original || original.deletedAt ||
    original.mime !== 'application/pdf' || original.sha256 !== source.sha256 ||
    !Number.isSafeInteger(original.sizeBytes) || original.sizeBytes <= 0 || original.sizeBytes > 15 * 1024 * 1024 ||
    !config || config.salaryAccountId !== payout.accountId || !config.automation ||
    config.automation.payeeId !== payout.payeeId || !sender || sender.deletedAt || sender.systemKind) return unavailable;
  const splits = db.select().from(bookingSplit).where(eq(bookingSplit.bookingId, bookingId)).all()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  const salaryType = draft.kind === 'special' ? INCOME_TYPES.special.id : INCOME_TYPES.salary.id;
  const plain = (split: typeof bookingSplit.$inferSelect) => !split.categoryId && !split.contactId && !split.transferId && !split.memo;
  if (splits.length === (totals.reimbursementsCents ? 2 : 1) && splits.every(plain) &&
    splits[0]?.incomeTypeId === salaryType && splits[0].amountCents === salaryCents &&
    (!totals.reimbursementsCents || (splits[1]?.incomeTypeId === INCOME_TYPES.refund.id &&
      splits[1].amountCents === totals.reimbursementsCents))) return { status: 'already_correct' };
  // Only a single untouched original salary lump is a supported normalization source.
  if (splits.length !== 1 || !plain(splits[0]!) || splits[0]!.incomeTypeId !== salaryType ||
    splits[0]!.amountCents !== payout.amountCents || !['import', 'migration'].includes(payout.source) ||
    !payout.importRunId || !payout.importKey) return unavailable;
  const run = db.select().from(importRun).where(eq(importRun.id, payout.importRunId)).get();
  const mapping = run?.mappingVersion ? db.select().from(importMapping)
    .where(and(eq(importMapping.importRunId, run.id), eq(importMapping.version, run.mappingVersion))).get() : undefined;
  if (!run || run.status !== 'committed' || !run.committedAt || run.revertedAt ||
    !['ynab', 'bank', 'csv'].includes(run.source) || !mapping) return unavailable;
  const bookingHistory = history(db, 'booking', bookingId);
  const creation = bookingHistory[0];
  if (bookingHistory.length !== 1 || !creation || creation.action !== 'create' || creation.before !== null ||
    creation.undoOfId || creation.groupId !== `import:${run.id}` ||
    !originalSnapshot(getTableColumns(booking), payout, creation.after)) return unavailable;
  // Query all historical children, including originals later removed/recreated or moved away.
  const childHistory = db.select().from(auditLog).where(and(eq(auditLog.entityType, 'booking_split'), or(
    eq(sql`json_extract(${auditLog.beforeJson}, '$.booking_id')`, bookingId),
    eq(sql`json_extract(${auditLog.afterJson}, '$.booking_id')`, bookingId),
  ))).all();
  if (childHistory.length !== splits.length || childHistory.some((entry) => {
    const split = splits.find((item) => item.id === entry.entityId);
    if (!split || entry.action !== 'create' || entry.beforeJson !== null || entry.undoOfId ||
      entry.groupId !== creation.groupId || !entry.afterJson) return true;
    try { return !originalSnapshot(getTableColumns(bookingSplit), split, JSON.parse(entry.afterJson) as Snapshot); }
    catch { return true; }
  })) return unavailable;
  if (db.select().from(payslip).where(eq(payslip.bookingId, bookingId)).get() ||
    db.select().from(expectedOccurrence).where(eq(expectedOccurrence.bookingId, bookingId)).get() ||
    db.select().from(bookingReceipt).where(eq(bookingReceipt.bookingId, bookingId)).get() ||
    db.select().from(receiptSplit).where(inArray(receiptSplit.splitId, splits.map((split) => split.id))).get()) return unavailable;
  // Refuse a consumed-and-undone association too; returning to equal values is not fresh provenance.
  const priorAssociation = db.select({ id: auditLog.id }).from(auditLog).where(or(
    and(inArray(auditLog.entityType, ['expected_occurrence', 'statement_settlement', 'statement_bonus', 'statement_automation_run']),
      sql`(instr(coalesce(${auditLog.beforeJson}, ''), ${bookingId}) > 0 OR instr(coalesce(${auditLog.afterJson}, ''), ${bookingId}) > 0)`),
    and(eq(auditLog.entityType, 'receipt_split'), or(
      inArray(sql`json_extract(${auditLog.beforeJson}, '$.split_id')`, splits.map((split) => split.id)),
      inArray(sql`json_extract(${auditLog.afterJson}, '$.split_id')`, splits.map((split) => split.id)),
    )),
  )).get();
  if (priorAssociation) return unavailable;
  try {
    assertStatementBookingWrite(db, bookingId, 'update', ['splits']);
    assertTradeSettlementBookingWrite(db, bookingId, 'update', ['splits']);
    assertContactBookingWrite(db, bookingId, 'update', ['splits']);
  } catch { return unavailable; }
  const occurrence = context.expectedOccurrenceId ? db.select().from(expectedOccurrence)
    .where(eq(expectedOccurrence.id, context.expectedOccurrenceId)).get() : null;
  const expected = occurrence ? db.select().from(expectedPayment)
    .where(eq(expectedPayment.id, occurrence.expectedPaymentId)).get() : null;
  if (context.expectedOccurrenceId && (!occurrence || occurrence.deletedAt || occurrence.bookingId ||
    occurrence.status !== 'expected' || !expected || expected.deletedAt || expected.kind !== 'inflow' ||
    expected.accountId !== target.id || expected.incomeTypeId !== salaryType || occurrence.dueDate.slice(0, 7) !== draft.month)) return unavailable;
  const stamp = (table: string, id: string) => history(db, table, id).map((entry) => entry.id);
  const token = createHash('sha256').update(JSON.stringify({
    source, context, payout, splits, original, target, sender, configRow, run, mapping, occurrence, expected,
    bookingHistory: bookingHistory.map((entry) => entry.id), childHistory: childHistory.map((entry) => entry.id).sort(),
    sourceHistory: stamp('payslip_intake', source.id), receiptHistory: stamp('receipt', original.id),
    accountHistory: stamp('account', target.id), senderHistory: stamp('payee', sender.id),
    configHistory: stamp('app_setting', 'payslip.source'),
    occurrenceHistory: occurrence ? stamp('expected_occurrence', occurrence.id) : [],
    expectedHistory: expected ? stamp('expected_payment', expected.id) : [],
  })).digest('hex');
  return { status: 'eligible', token, salaryCents, reimbursementsCents: totals.reimbursementsCents };
}

/** Called inside the existing intake decision transaction and its one financial audit group. */
export function applyPayslipPayoutSplit(
  db: Executor, source: Source, bookingId: string, context: PayoutSplitContext, token: string, ctx: AuditContext,
) {
  const preview = previewPayslipPayoutSplit(db, source, bookingId, context);
  if (preview.status !== 'eligible' || preview.token !== token)
    throw new ConflictError('Die Auszahlung oder der Nachweis wurde geändert. Bitte die Aufteilung neu prüfen.');
  updateBooking(db, bookingId, { splits: [
    { categoryId: null, incomeTypeId: source.parsed.draft!.kind === 'special' ? INCOME_TYPES.special.id : INCOME_TYPES.salary.id,
      amountCents: preview.salaryCents! },
    ...(preview.reimbursementsCents ? [{ categoryId: null, incomeTypeId: INCOME_TYPES.refund.id,
      amountCents: preview.reimbursementsCents }] : []),
  ] }, ctx);
}
