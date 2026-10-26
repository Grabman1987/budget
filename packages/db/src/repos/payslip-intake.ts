import { randomUUID } from 'node:crypto';
import { and, eq, gt, gte, lte, isNull, min, or } from 'drizzle-orm';
import {
  isDuplicatePayslip,
  payrollTotals,
  payslipInput,
  payslipSourceConfig,
  proposedPayslipPayoutDate,
  planPayslipAutomation,
  sameAutomaticPayrollSlot,
  sameAutomaticPayrollRecord,
  lastDayOfMonth,
  versionOn,
  type PayslipAutomationOutcome,
  type ParsedPayrollDocument,
  type PayslipSourceConfig,
} from '@budget/domain';
import {
  account,
  appSetting,
  booking,
  bookingSplit,
  bookingReceipt,
  INCOME_TYPES,
  inboxItem,
  payslipIntake,
  payslipScan,
  payslip,
  payslipSecret,
  receipt,
  expectedOccurrence,
  expectedPayment,
  expectedPaymentVersion,
  payee,
} from '../schema';
import {
  insertTracked,
  updateTracked,
  recordAudit,
  withGroup,
  nowIso,
  history,
  type AuditContext,
} from './audit';
import { BookingInvariantError, ConflictError, EntityNotFoundError } from './errors';
import { upcoming } from './expected';
import { runInTransaction, type Executor } from './types';
import { addReceipt, getReceipt, linkReceipt } from './receipts';
import { listPayslips, savePayslip } from './payroll-projects';
import { earliestAccountDate } from './portfolio';
import { listEntities } from './entities';
import { createBooking } from './bookings';
import { expectedLinkedStatus } from './expected-links';
import { applyPayslipPayoutSplit, previewPayslipPayoutSplit } from './payslip-payout-split';

export const getPayslipSourceConfig = (db: Executor): PayslipSourceConfig => {
  const value = db
    .select()
    .from(appSetting)
    .where(eq(appSetting.id, 'payslip.source'))
    .get()?.value;
  return value
    ? payslipSourceConfig.parse(JSON.parse(value))
    : { salaryAccountId: null, wageTypes: {} };
};
export function setPayslipSourceConfig(db: Executor, raw: PayslipSourceConfig, ctx: AuditContext) {
  const config = payslipSourceConfig.parse(raw),
    grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    if (
      config.salaryAccountId &&
      !tx
        .select()
        .from(account)
        .where(
          and(
            eq(account.id, config.salaryAccountId),
            isNull(account.deletedAt),
            eq(account.currency, 'EUR'),
          ),
        )
        .get()
    )
      throw new ConflictError('Bitte ein bestehendes EUR-Gehaltskonto wählen.');
    if (
      config.automation &&
      (!config.salaryAccountId ||
        !tx
          .select()
          .from(payee)
          .where(
            and(
              eq(payee.id, config.automation.payeeId),
              isNull(payee.deletedAt),
              isNull(payee.systemKind),
            ),
          )
          .get())
    )
      throw new ConflictError('Bitte Gehaltskonto und bestehenden Arbeitgeber/Absender wählen.');
    const id = 'payslip.source',
      value = JSON.stringify(config);
    if (tx.select().from(appSetting).where(eq(appSetting.id, id)).get())
      updateTracked(tx, appSetting, [id], { value }, grouped);
    else insertTracked(tx, appSetting, { id, value }, grouped);
    return { config, groupId: grouped.groupId };
  });
}
export function findPayslipIntake(db: Executor, sha256?: string, contentHash?: string) {
  return db
    .select()
    .from(payslipIntake)
    .where(
      or(
        ...[
          sha256 ? eq(payslipIntake.sha256, sha256) : undefined,
          contentHash ? eq(payslipIntake.contentHash, contentHash) : undefined,
        ],
      ),
    )
    .get();
}
export function getPayslipIntake(db: Executor, id: string) {
  const row = db
    .select()
    .from(payslipIntake)
    .where(and(eq(payslipIntake.id, id), isNull(payslipIntake.deletedAt)))
    .get();
  if (!row) throw new EntityNotFoundError('payslip_intake', id);
  return { ...row, parsed: JSON.parse(row.parsedJson) as ParsedPayrollDocument };
}
/** Live persisted source association only: never infer a payout from configuration or suggestions. */
export function readPayslipPayoutAssociation(db: Executor, intakeId: string) {
  return (
    db
      .select({ payslipId: payslip.id, bookingId: booking.id, accountId: account.id })
      .from(payslipIntake)
      .innerJoin(
        payslip,
        and(
          eq(payslip.id, payslipIntake.payslipId),
          eq(payslip.receiptId, payslipIntake.receiptId),
        ),
      )
      .innerJoin(booking, eq(booking.id, payslip.bookingId))
      .innerJoin(account, eq(account.id, booking.accountId))
      .innerJoin(
        receipt,
        and(eq(receipt.id, payslipIntake.receiptId), eq(receipt.sha256, payslipIntake.sha256)),
      )
      .innerJoin(
        bookingReceipt,
        and(eq(bookingReceipt.bookingId, booking.id), eq(bookingReceipt.receiptId, receipt.id)),
      )
      .where(
        and(
          eq(payslipIntake.id, intakeId),
          eq(payslipIntake.status, 'confirmed'),
          isNull(payslipIntake.deletedAt),
          isNull(payslip.deletedAt),
          isNull(booking.deletedAt),
          isNull(account.deletedAt),
          isNull(receipt.deletedAt),
          isNull(bookingReceipt.deletedAt),
          eq(account.currency, 'EUR'),
          eq(booking.currency, account.currency),
        ),
      )
      .get() ?? null
  );
}
const title = (parsed: ParsedPayrollDocument) =>
  parsed.draft
    ? `Gehaltszettel ${parsed.draft.month.slice(5)}/${parsed.draft.month.slice(0, 4)} erkannt`
    : parsed.documentType === 'pension'
      ? 'Pensionskassen-Mitteilung erkannt'
      : parsed.documentType === 'bonus'
        ? 'Bonus-Mitteilung erkannt'
        : 'Gehaltszettel: Prüfung erforderlich';
export function stagePayslip(
  db: Executor,
  input: {
    sha256: string;
    contentHash?: string;
    source: 'manual' | 'dropbox';
    sizeBytes: number;
    filename: string;
    parsed: ParsedPayrollDocument;
    /** Stage the intake already decided (rejected, inbox task resolved) with this reason. */
    settle?: string;
  },
  ctx: AuditContext,
) {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const staged = stageRow(tx, input, grouped);
    if (input.settle && !staged.duplicate) settleIntake(tx, staged.id, input.settle, grouped);
    return staged;
  });
}
function stageRow(
  tx: Executor,
  input: Parameters<typeof stagePayslip>[1],
  grouped: AuditContext,
): { id: string; duplicate: boolean; groupId: string | null | undefined } {
  const old = findPayslipIntake(tx, input.sha256, input.contentHash);
  if (old && !old.deletedAt) return { id: old.id, duplicate: true, groupId: null };
  if (old) {
    updateTracked(
      tx,
      payslipIntake,
      [old.id],
      {
        deletedAt: null,
        parsedJson: JSON.stringify(input.parsed),
        status: 'pending',
        payslipId: null,
      },
      grouped,
      'restore',
    );
    updateTracked(tx, receipt, [old.receiptId], { deletedAt: null }, grouped, 'restore');
    insertTracked(
      tx,
      inboxItem,
      {
        id: randomUUID(),
        kind: 'revision',
        title: title(input.parsed),
        refType: 'payslip-intake',
        refId: old.id,
        urgent: input.parsed.warnings.length > 0,
      },
      grouped,
    );
    return { id: old.id, duplicate: false, groupId: grouped.groupId };
  }
  const r = addReceipt(
    tx,
    {
      sha256: input.sha256,
      mime: 'application/pdf',
      sizeBytes: input.sizeBytes,
      originalFilename: input.filename,
    },
    undefined,
    grouped,
  ).receipt;
  const row = insertTracked(
    tx,
    payslipIntake,
    {
      id: randomUUID(),
      sha256: input.sha256,
      contentHash: input.contentHash ?? null,
      source: input.source,
      receiptId: r.id,
      parsedJson: JSON.stringify(input.parsed),
    },
    grouped,
  );
  insertTracked(
    tx,
    inboxItem,
    {
      id: randomUUID(),
      kind: 'revision',
      title: title(input.parsed),
      refType: 'payslip-intake',
      refId: row.id,
      urgent: input.parsed.warnings.length > 0,
    },
    grouped,
  );
  return { id: row.id, duplicate: false, groupId: grouped.groupId };
}
/** Inbox resolutions for payslip PDFs that are not meant to be reviewed again. */
export const PAYSLIP_BEFORE_START = 'Vor dem Startdatum – nicht übernommen.';
export const PAYSLIP_ALREADY_RECORDED = 'Bereits erfasst.';
export type PayslipScope = 'in_scope' | 'before_start' | 'recorded';

/**
 * Month (`YYYY-MM`) where the records begin: the opening date of the first live budget account, as
 * everywhere else in the app. Off-budget accounts (investments) may start earlier and do not count;
 * without any budget account the first account of any kind decides.
 */
export const payslipRecordsStart = (db: Executor) =>
  (
    db
      .select({ day: min(account.openingDate) })
      .from(account)
      .where(and(isNull(account.deletedAt), eq(account.onBudget, true)))
      .get()?.day ?? earliestAccountDate(db)
  )?.slice(0, 7) ?? null;

const filenameMonth = (filename: string) => {
  const m = filename.match(/(?:^|\D)(20\d{2})(0[1-9]|1[0-2])(?:\D|$)/);
  return m ? `${m[1]}-${m[2]}` : null;
};
/**
 * Whether a document belongs into the review queue. The read period decides (Abrechnungsmonat,
 * else a YYYYMM filename); only without any period the year folder (`folderYear`) is used.
 * A payslip already captured for the same month and kind (special: same gross) is "recorded".
 */
export function payslipScope(
  db: Executor,
  parsed: ParsedPayrollDocument,
  filename: string,
  folderYear: number | null = null,
): PayslipScope {
  const start = payslipRecordsStart(db),
    month = parsed.draft?.month ?? filenameMonth(filename);
  if (start) {
    if (month ? month < start : folderYear !== null && folderYear < Number(start.slice(0, 4)))
      return 'before_start';
  }
  const draft = parsed.draft;
  if (!draft) return 'in_scope';
  const live = listEntities(db, payslip);
  const recorded =
    draft.kind === 'special' && draft.specialType === 'other'
      ? live.some(
          (p) =>
            p.month === draft.month && p.kind === 'special' && p.grossCents === draft.grossCents,
        )
      : isDuplicatePayslip(live, draft);
  return recorded ? 'recorded' : 'in_scope';
}
export const payslipScopeReason = (scope: Exclude<PayslipScope, 'in_scope'>) =>
  scope === 'before_start' ? PAYSLIP_BEFORE_START : PAYSLIP_ALREADY_RECORDED;
/** Reject the intake and resolve its inbox task with the reason; nothing is deleted. */
function settleIntake(tx: Executor, id: string, resolution: string, ctx: AuditContext) {
  updateTracked(tx, payslipIntake, [id], { status: 'rejected' }, ctx);
  const item = tx
    .select()
    .from(inboxItem)
    .where(
      and(
        eq(inboxItem.refType, 'payslip-intake'),
        eq(inboxItem.refId, id),
        isNull(inboxItem.resolvedAt),
      ),
    )
    .get();
  if (item)
    updateTracked(
      tx,
      inboxItem,
      [item.id],
      { resolvedAt: nowIso(), resolution, urgent: false },
      ctx,
    );
}
/**
 * Re-evaluate one pending Dropbox intake with the current scope rules (start of the records,
 * payslips captured since). Returns the verdict; out-of-scope intakes are rejected with a reason.
 */
export function reevaluatePayslipIntake(
  db: Executor,
  id: string,
  folderYear: number | null,
  ctx: AuditContext,
): PayslipScope {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const row = getPayslipIntake(tx, id);
    if (row.status !== 'pending' || row.source !== 'dropbox') return 'in_scope';
    const scope = payslipScope(
      tx,
      row.parsed,
      getReceipt(tx, row.receiptId).originalFilename ?? '',
      folderYear,
    );
    if (scope !== 'in_scope') settleIntake(tx, id, payslipScopeReason(scope), grouped);
    return scope;
  });
}

const SCOPE_KEY = 'payslip.scan.start';
/** Start month the last complete Dropbox listing was filtered with. */
export const readPayslipScanStart = (db: Executor) =>
  db.select().from(appSetting).where(eq(appSetting.id, SCOPE_KEY)).get()?.value ?? null;
export function writePayslipScanStart(db: Executor, start: string, ctx: AuditContext) {
  runInTransaction(db, (tx) => {
    if (readPayslipScanStart(tx) === null)
      insertTracked(tx, appSetting, { id: SCOPE_KEY, value: start }, ctx);
    else updateTracked(tx, appSetting, [SCOPE_KEY], { value: start }, ctx);
  });
}
const PARSER_KEY = 'payslip.parser.version';
/** Parser version the pending intakes were last read with (see `PAYSLIP_PARSER_VERSION`). */
export const readPayslipParserVersion = (db: Executor) =>
  db.select().from(appSetting).where(eq(appSetting.id, PARSER_KEY)).get()?.value ?? null;
export function writePayslipParserVersion(db: Executor, version: number, ctx: AuditContext) {
  runInTransaction(db, (tx) => {
    const value = String(version);
    if (readPayslipParserVersion(tx) === null)
      insertTracked(tx, appSetting, { id: PARSER_KEY, value }, ctx);
    else updateTracked(tx, appSetting, [PARSER_KEY], { value }, ctx);
  });
}
export function replaceParsedPayslip(
  db: Executor,
  id: string,
  parsed: ParsedPayrollDocument,
  ctx: AuditContext,
) {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const row = getPayslipIntake(tx, id);
    if (row.status !== 'pending')
      throw new ConflictError('Diese Aufgabe wurde bereits entschieden.');
    updateTracked(tx, payslipIntake, [id], { parsedJson: JSON.stringify(parsed) }, grouped);
    const item = tx
      .select()
      .from(inboxItem)
      .where(and(eq(inboxItem.refType, 'payslip-intake'), eq(inboxItem.refId, id)))
      .get();
    if (item)
      updateTracked(
        tx,
        inboxItem,
        [item.id],
        { title: title(parsed), urgent: parsed.warnings.length > 0 },
        grouped,
      );
    return { groupId: grouped.groupId };
  });
}
/** Save an owner mapping and its reparse as one audited change after checking the read snapshot. */
export function replacePayslipMappings(
  db: Executor,
  id: string,
  expectedConfig: PayslipSourceConfig,
  expectedParsed: ParsedPayrollDocument,
  nextConfig: PayslipSourceConfig,
  parsed: ParsedPayrollDocument,
  ctx: AuditContext,
) {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const row = getPayslipIntake(tx, id);
    if (row.status !== 'pending')
      throw new ConflictError('Diese Aufgabe wurde bereits entschieden.');
    if (JSON.stringify(row.parsed) !== JSON.stringify(expectedParsed))
      throw new ConflictError(
        'Die Abrechnung wurde zwischenzeitlich neu ausgewertet. Bitte neu laden.',
      );
    const current = getPayslipSourceConfig(tx);
    if (JSON.stringify(current) !== JSON.stringify(expectedConfig))
      throw new ConflictError(
        'Die Lohnarten-Zuordnung wurde zwischenzeitlich geändert. Bitte neu laden.',
      );
    const settingId = 'payslip.source';
    const value = JSON.stringify(payslipSourceConfig.parse(nextConfig));
    if (tx.select().from(appSetting).where(eq(appSetting.id, settingId)).get())
      updateTracked(tx, appSetting, [settingId], { value }, grouped);
    else insertTracked(tx, appSetting, { id: settingId, value }, grouped);
    updateTracked(tx, payslipIntake, [id], { parsedJson: JSON.stringify(parsed) }, grouped);
    const item = tx
      .select()
      .from(inboxItem)
      .where(
        and(
          eq(inboxItem.refType, 'payslip-intake'),
          eq(inboxItem.refId, id),
          isNull(inboxItem.resolvedAt),
        ),
      )
      .get();
    if (!item) throw new ConflictError('Posteingang-Aufgabe fehlt.');
    updateTracked(
      tx,
      inboxItem,
      [item.id],
      { title: title(parsed), urgent: parsed.warnings.length > 0 },
      grouped,
    );
    return { config: payslipSourceConfig.parse(nextConfig), groupId: grouped.groupId };
  });
}
export function payslipMatches(
  db: Executor,
  parsed: ParsedPayrollDocument,
  accountId = getPayslipSourceConfig(db).salaryAccountId,
  payoutDate?: string | null,
  splitSource?: {
    intake: ReturnType<typeof getPayslipIntake>;
    expectedOccurrenceId: string | null;
  },
) {
  const draft = parsed.draft;
  if (!draft || !accountId || payoutDate === null) return [];
  const anchor =
    payoutDate ??
    parsed.payoutDate ??
    new Date(Date.UTC(Number(draft.month.slice(0, 4)), Number(draft.month.slice(5)), 0))
      .toISOString()
      .slice(0, 10);
  return db
    .select({ b: booking, a: account })
    .from(booking)
    .innerJoin(account, eq(account.id, booking.accountId))
    .where(
      and(
        eq(booking.accountId, accountId),
        isNull(booking.deletedAt),
        isNull(account.deletedAt),
        isNull(booking.transferId),
        eq(booking.currency, 'EUR'),
        eq(account.currency, 'EUR'),
      ),
    )
    .all()
    .filter(
      ({ b, a }) =>
        b.date >= a.openingDate &&
        b.amountCents > 0 &&
        Math.abs(Date.parse(b.date) - Date.parse(anchor)) <= 5 * 86400000 &&
        db
          .select()
          .from(bookingSplit)
          .where(eq(bookingSplit.bookingId, b.id))
          .all()
          .some(
            (s) =>
              !s.contactId &&
              !s.transferId &&
              (s.incomeTypeId === INCOME_TYPES.salary.id ||
                s.incomeTypeId === INCOME_TYPES.special.id),
          ),
    )
    .map(({ b }) => ({
      id: b.id,
      date: b.date,
      amountCents: b.amountCents,
      differenceCents: b.amountCents - draft.netCents,
      exact: b.amountCents === draft.netCents,
      ...(splitSource
        ? {
            splitPreview: previewPayslipPayoutSplit(db, splitSource.intake, b.id, {
              accountId: accountId ?? null,
              payoutDate: payoutDate ?? null,
              expectedOccurrenceId: splitSource.expectedOccurrenceId,
            }),
          }
        : {}),
    }));
}
export function decidePayslipIntake(
  db: Executor,
  id: string,
  decision: {
    action: 'confirm' | 'reject';
    bookingId: string | null;
    accountId?: string | undefined;
    payoutDate?: string | undefined;
    payeeId?: string | null | undefined;
    expectedOccurrenceId?: string | null | undefined;
    /** Explicit owner acceptance of the server's current audit-proven split preview. */
    splitToken?: string | undefined;
  },
  ctx: AuditContext,
  /** Internal automatic attachment only; never accepted by the manual HTTP decision schema. */
  attachExistingPayslipId?: string,
) {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const row = getPayslipIntake(tx, id);
    if (row.status !== 'pending')
      throw new ConflictError('Diese Aufgabe wurde bereits entschieden.');
    if (
      decision.splitToken &&
      (decision.action !== 'confirm' || !decision.bookingId || attachExistingPayslipId)
    )
      throw new ConflictError(
        'Die Aufteilung benötigt eine ausdrücklich gewählte bestehende Auszahlung.',
      );
    if (attachExistingPayslipId && (decision.action !== 'confirm' || !decision.bookingId))
      throw new ConflictError('Bestehende Abrechnung und Auszahlung bitte prüfen.');
    let payslipId: string | null = null;
    if (decision.action === 'confirm') {
      const p = row.parsed;
      // Filename fallback is disclosed, not a failed extraction. All other warnings block saving.
      if (
        !p.draft ||
        p.warnings.some((w) => w !== 'Abrechnungsmonat nur aus dem Dateinamen erkannt.') ||
        Math.abs(p.differenceCents ?? 2) > 1
      )
        throw new ConflictError('Bitte zuerst die Warnungen beheben oder manuell erfassen.');
      const occurrence = decision.expectedOccurrenceId
        ? tx
            .select()
            .from(expectedOccurrence)
            .where(
              and(
                eq(expectedOccurrence.id, decision.expectedOccurrenceId),
                isNull(expectedOccurrence.deletedAt),
              ),
            )
            .get()
        : null;
      const expected = occurrence
        ? tx
            .select()
            .from(expectedPayment)
            .where(
              and(
                eq(expectedPayment.id, occurrence.expectedPaymentId),
                isNull(expectedPayment.deletedAt),
              ),
            )
            .get()
        : null;
      if (
        decision.expectedOccurrenceId &&
        (!occurrence ||
          !expected ||
          occurrence.bookingId ||
          occurrence.status !== 'expected' ||
          expected.kind !== 'inflow' ||
          expected.accountId !== decision.accountId ||
          occurrence.dueDate.slice(0, 7) !== p.draft.month ||
          expected.incomeTypeId !==
            (p.draft.kind === 'special' ? INCOME_TYPES.special.id : INCOME_TYPES.salary.id))
      )
        throw new ConflictError('Die erwartete Gehaltszahlung ist nicht mehr verfügbar.');
      const date = decision.payoutDate ?? occurrence?.dueDate ?? proposedPayslipPayoutDate(p);
      if (
        decision.bookingId &&
        (!date ||
          !payslipMatches(tx, p, decision.accountId, date).some((b) => b.id === decision.bookingId))
      )
        throw new ConflictError(
          'Gehaltsbuchung ist nicht mehr verfügbar oder außerhalb des Zeitfensters.',
        );
      getReceipt(tx, row.receiptId);
      if (decision.splitToken && decision.bookingId) {
        applyPayslipPayoutSplit(
          tx,
          row,
          decision.bookingId,
          {
            accountId: decision.accountId ?? getPayslipSourceConfig(tx).salaryAccountId,
            payoutDate: date ?? null,
            expectedOccurrenceId: decision.expectedOccurrenceId ?? null,
          },
          decision.splitToken,
          grouped,
        );
      }
      let payoutId = decision.bookingId;
      if (decision.bookingId && occurrence) {
        const matchedBooking = tx
          .select()
          .from(booking)
          .where(and(eq(booking.id, decision.bookingId), isNull(booking.deletedAt)))
          .get();
        if (!matchedBooking || matchedBooking.accountId !== expected!.accountId)
          throw new ConflictError('Die Buchung passt nicht zur erwarteten Gehaltszahlung.');
        updateTracked(
          tx,
          expectedOccurrence,
          [occurrence.id],
          {
            status: expectedLinkedStatus(tx, occurrence, expected!, matchedBooking),
            bookingId: matchedBooking.id,
          },
          grouped,
        );
      }
      if (!payoutId && decision.accountId) {
        const target = tx
          .select()
          .from(account)
          .where(and(eq(account.id, decision.accountId), isNull(account.deletedAt)))
          .get();
        if (!date) throw new ConflictError('Bitte ein Auszahlungsdatum wählen.');
        const payeeId =
          decision.payeeId === undefined ? (expected?.payeeId ?? null) : decision.payeeId;
        if (
          payeeId &&
          !tx
            .select()
            .from(payee)
            .where(and(eq(payee.id, payeeId), isNull(payee.deletedAt), isNull(payee.systemKind)))
            .get()
        )
          throw new ConflictError('Die gewählte Person ist nicht mehr verfügbar.');
        if (!target || target.closedAt || target.currency !== 'EUR' || date < target.openingDate)
          throw new ConflictError(
            'Bitte ein offenes EUR-Auszahlungskonto mit passendem Startdatum wählen.',
          );
        if (payslipMatches(tx, p, target.id, date).some((candidate) => candidate.exact))
          throw new ConflictError(
            'Eine passende Auszahlung ist bereits vorhanden. Bitte diese Buchung auswählen.',
          );
        const totals = payrollTotals([p.draft]);
        const salaryCents = p.draft.netCents - totals.reimbursementsCents;
        if (p.draft.netCents <= 0 || salaryCents <= 0)
          throw new ConflictError('Für diese Auszahlung bitte eine bestehende Buchung auswählen.');
        payoutId = createBooking(
          tx,
          {
            accountId: target.id,
            date,
            payeeId,
            amountCents: p.draft.netCents,
            currency: 'EUR',
            status: target.type === 'cash' ? 'confirmed' : 'pending',
            source: 'system',
            memo: `Gehaltszettel ${p.draft.month}`,
            splits: [
              {
                categoryId: null,
                amountCents: salaryCents,
                incomeTypeId:
                  p.draft.kind === 'special' ? INCOME_TYPES.special.id : INCOME_TYPES.salary.id,
              },
              ...(totals.reimbursementsCents
                ? [
                    {
                      categoryId: null,
                      amountCents: totals.reimbursementsCents,
                      incomeTypeId: INCOME_TYPES.refund.id,
                    },
                  ]
                : []),
            ],
          },
          grouped,
        );
        if (occurrence && payoutId) {
          const linkedBooking = tx
            .select()
            .from(booking)
            .where(and(eq(booking.id, payoutId), isNull(booking.deletedAt)))
            .get();
          if (!linkedBooking)
            throw new ConflictError('Die Gehaltsbuchung ist nicht mehr verfügbar.');
          const status = expectedLinkedStatus(tx, occurrence, expected!, linkedBooking);
          updateTracked(
            tx,
            expectedOccurrence,
            [occurrence.id],
            { status, bookingId: payoutId },
            grouped,
          );
        }
      }
      const lines = [...p.draft.lines];
      const difference = payrollTotals([p.draft]).calculatedNetCents - p.draft.netCents;
      if (difference)
        lines.push({
          section: 'deduction',
          label: 'Rundung (Summenprüfung)',
          amountCents: difference,
        });
      const capture = payslipInput.parse({
        ...p.draft,
        lines,
        receiptId: row.receiptId,
        bookingId: payoutId,
      });
      let saved: { id: string };
      if (attachExistingPayslipId) {
        const existing = listPayslips(tx).find(
          (candidate) => candidate.id === attachExistingPayslipId,
        );
        if (
          !existing ||
          existing.receiptId ||
          existing.bookingId !== payoutId ||
          !sameAutomaticPayrollRecord(capture, existing)
        )
          throw new ConflictError(
            'Die bestehende Abrechnung stimmt nicht eindeutig mit dem Dokument überein.',
          );
        // Preserve every original financial value and line identity: attach only this retained source.
        updateTracked(tx, payslip, [existing.id], { receiptId: row.receiptId }, grouped);
        saved = existing;
      } else {
        saved = savePayslip(tx, capture, grouped, undefined, row.id);
      }
      payslipId = saved.id;
      if (payoutId) linkReceipt(tx, row.receiptId, payoutId, grouped);
    }
    updateTracked(
      tx,
      payslipIntake,
      [id],
      { status: decision.action === 'confirm' ? 'confirmed' : 'rejected', payslipId },
      grouped,
    );
    const item = tx
      .select()
      .from(inboxItem)
      .where(
        and(
          eq(inboxItem.refType, 'payslip-intake'),
          eq(inboxItem.refId, id),
          isNull(inboxItem.resolvedAt),
        ),
      )
      .get();
    if (!item) throw new ConflictError('Posteingang-Aufgabe fehlt.');
    updateTracked(
      tx,
      inboxItem,
      [item.id],
      { resolvedAt: nowIso(), resolution: decision.action },
      grouped,
    );
    return { payslipId, groupId: grouped.groupId };
  });
}
export const readPayslipScan = (db: Executor) =>
  db.select().from(payslipScan).where(eq(payslipScan.id, 'dropbox')).get();
export function writePayslipScan(db: Executor, patch: typeof payslipScan.$inferInsert) {
  db.insert(payslipScan)
    .values(patch)
    .onConflictDoUpdate({ target: payslipScan.id, set: patch })
    .run();
}

const PASSWORD_ID = 'pdf-password';
/** Ciphertext only; decryption is the server's job. */
export const readPayslipPasswordCiphertext = (db: Executor) =>
  db.select().from(payslipSecret).where(eq(payslipSecret.id, PASSWORD_ID)).get()?.ciphertext ??
  null;
/** Store/replace the sealed password. The audit entry records the event, never a value. */
export function storePayslipPasswordCiphertext(
  db: Executor,
  ciphertext: string,
  ctx: AuditContext,
) {
  runInTransaction(db, (tx) => {
    const existed = readPayslipPasswordCiphertext(tx) !== null;
    tx.insert(payslipSecret)
      .values({ id: PASSWORD_ID, ciphertext, updatedAt: nowIso() })
      .onConflictDoUpdate({
        target: payslipSecret.id,
        set: { ciphertext, updatedAt: nowIso() },
      })
      .run();
    recordAudit(tx, {
      actor: ctx.actor,
      action: existed ? 'update' : 'create',
      entityType: 'payslip_secret',
      entityId: PASSWORD_ID,
      before: existed ? { set: true } : null,
      after: { set: true },
      ...(ctx.groupId ? { groupId: ctx.groupId } : {}),
    });
  });
}
export function clearPayslipPassword(db: Executor, ctx: AuditContext) {
  return runInTransaction(db, (tx) => {
    if (readPayslipPasswordCiphertext(tx) === null) return false;
    tx.delete(payslipSecret).where(eq(payslipSecret.id, PASSWORD_ID)).run();
    recordAudit(tx, {
      actor: ctx.actor,
      action: 'delete',
      entityType: 'payslip_secret',
      entityId: PASSWORD_ID,
      before: { set: true },
      after: null,
      ...(ctx.groupId ? { groupId: ctx.groupId } : {}),
    });
    return true;
  });
}

/** Captured after staging; a new source/config/parse audit head invalidates automation. */
export function payslipAutomationConfigSnapshot(db: Executor) {
  return {
    config: getPayslipSourceConfig(db),
    revision: history(db, 'app_setting', 'payslip.source')[0]?.id ?? null,
  };
}
export function payslipAutomationSnapshot(
  db: Executor,
  id: string,
  parsedWith: ReturnType<typeof payslipAutomationConfigSnapshot>,
) {
  const row = getPayslipIntake(db, id);
  return {
    sha256: row.sha256,
    receiptId: row.receiptId,
    revision: history(db, 'payslip_intake', id)[0]?.id ?? null,
    configRevision: parsedWith.revision,
    config: JSON.stringify(parsedWith.config),
    parsed: JSON.stringify(row.parsed),
  };
}
export function automaticallyDecidePayslip(
  db: Executor,
  id: string,
  snapshot: ReturnType<typeof payslipAutomationSnapshot>,
  ctx: AuditContext,
): PayslipAutomationOutcome {
  const review = (reason: string): PayslipAutomationOutcome => ({
    status: 'pruefen',
    reason,
    groupId: null,
  });
  try {
    return runInTransaction(db, (tx) => {
      const row = getPayslipIntake(tx, id);
      if (row.status !== 'pending')
        return { status: 'unchanged', reason: 'already_decided', groupId: null };
      // A restored/undone/reparsed intake can never qualify as a new source operation.
      const entries = history(tx, 'payslip_intake', id);
      if (
        entries.length !== 1 ||
        entries[0]?.action !== 'create' ||
        entries[0]?.id !== snapshot.revision
      )
        return review('source_changed');
      const config = getPayslipSourceConfig(tx);
      if (
        row.sha256 !== snapshot.sha256 ||
        row.receiptId !== snapshot.receiptId ||
        JSON.stringify(row.parsed) !== snapshot.parsed ||
        JSON.stringify(config) !== snapshot.config ||
        (history(tx, 'app_setting', 'payslip.source')[0]?.id ?? null) !== snapshot.configRevision
      )
        return review('source_changed');
      if (!config.automation || !config.salaryAccountId) return review('source_not_configured');
      const source = getReceipt(tx, row.receiptId);
      if (source.sha256 !== snapshot.sha256) return review('source_changed');
      const target = tx
        .select()
        .from(account)
        .where(and(eq(account.id, config.salaryAccountId), isNull(account.deletedAt)))
        .get();
      const sender = tx
        .select()
        .from(payee)
        .where(
          and(
            eq(payee.id, config.automation.payeeId),
            isNull(payee.deletedAt),
            isNull(payee.systemKind),
          ),
        )
        .get();
      if (!target || target.closedAt || target.currency !== 'EUR' || !sender)
        return review('source_not_configured');
      const parsed = row.parsed;
      if (!parsed.draft || !/^(20\d{2})-(0[1-9]|1[0-2])$/.test(parsed.draft.month))
        return review('document_needs_review');
      const historical = tx
        .select()
        .from(payslip)
        .where(and(eq(payslip.month, parsed.draft.month), eq(payslip.kind, parsed.draft.kind)))
        .all();
      if (historical.some((p) => p.deletedAt && sameAutomaticPayrollSlot(parsed.draft!, p)))
        return review('payroll_previously_undone');
      const saved = listEntities(tx, payslip);
      const existingSlot = saved.filter((p) => sameAutomaticPayrollSlot(parsed.draft!, p));
      if (
        existingSlot.length > 1 ||
        existingSlot[0]?.receiptId ||
        (existingSlot[0] && !existingSlot[0].bookingId)
      )
        return review('payroll_already_exists');
      if (
        existingSlot[0] &&
        history(tx, 'payslip', existingSlot[0].id).some((entry) => entry.action === 'undo')
      )
        return review('payroll_previously_undone');
      const incomeTypeId =
        parsed.draft.kind === 'special' ? INCOME_TYPES.special.id : INCOME_TYPES.salary.id;
      const versions = tx
        .select({ version: expectedPaymentVersion })
        .from(expectedPaymentVersion)
        .innerJoin(
          expectedPayment,
          eq(expectedPayment.id, expectedPaymentVersion.expectedPaymentId),
        )
        .where(
          and(
            eq(expectedPayment.accountId, target.id),
            isNull(expectedPayment.deletedAt),
            isNull(expectedPaymentVersion.deletedAt),
          ),
        )
        .all()
        .map((row) => row.version);
      const expectations = upcoming(
        tx,
        `${parsed.draft.month}-01`,
        lastDayOfMonth(parsed.draft.month),
        { kind: 'inflow' },
      )
        .filter((o) => o.accountId === target.id)
        .map((o) => {
          const sourceVersion = versionOn(
            versions.filter((v) => v.expectedPaymentId === o.paymentId),
            o.dueDate,
          );
          // Missing version currency is not permission to use upcoming's legacy EUR fallback.
          return { ...o, currency: sourceVersion?.currency ?? '' };
        });
      const possibleExpected = expectations.filter(
        (o) => o.incomeTypeId === incomeTypeId && (o.payeeId === sender.id || o.payeeId === null),
      );
      const anchor =
        proposedPayslipPayoutDate(parsed) ??
        (possibleExpected.length === 1 ? possibleExpected[0]!.dueDate : null);
      const anchorTime = anchor ? Date.parse(anchor + 'T00:00:00Z') : NaN;
      const windowFilter = Number.isFinite(anchorTime)
        ? and(
            eq(booking.accountId, target.id),
            isNull(booking.deletedAt),
            gt(booking.amountCents, 0),
            gte(booking.date, new Date(anchorTime - 5 * 86400000).toISOString().slice(0, 10)),
            lte(booking.date, new Date(anchorTime + 5 * 86400000).toISOString().slice(0, 10)),
          )
        : undefined;
      const candidates = windowFilter ? tx.select().from(booking).where(windowFilter).all() : [];
      const splits = windowFilter
        ? tx
            .select({ split: bookingSplit })
            .from(bookingSplit)
            .innerJoin(booking, eq(booking.id, bookingSplit.bookingId))
            .where(windowFilter)
            .all()
            .map((row) => row.split)
        : [];
      const linkedExpectations = windowFilter
        ? tx
            .select({ bookingId: expectedOccurrence.bookingId, id: expectedOccurrence.id })
            .from(expectedOccurrence)
            .innerJoin(booking, eq(booking.id, expectedOccurrence.bookingId))
            .where(and(windowFilter, isNull(expectedOccurrence.deletedAt)))
            .all()
        : [];
      const splitsByBooking = new Map<string, typeof splits>();
      for (const split of splits)
        splitsByBooking.set(split.bookingId, [
          ...(splitsByBooking.get(split.bookingId) ?? []),
          split,
        ]);
      const plan = planPayslipAutomation({
        parsed,
        payeeId: sender.id,
        salaryIncomeTypeId: incomeTypeId,
        payrollIncomeTypeIds: [INCOME_TYPES.salary.id, INCOME_TYPES.special.id],
        reimbursementIncomeTypeId: INCOME_TYPES.refund.id,
        openingDate: target.openingDate,
        bookings: candidates.map((b) => ({
          ...b,
          alreadyCaptured: saved.some((p) => p.bookingId === b.id && p.id !== existingSlot[0]?.id),
          expectedOccurrenceIds: linkedExpectations
            .filter((o) => o.bookingId === b.id)
            .map((o) => o.id),
          splits: splitsByBooking.get(b.id) ?? [],
        })),
        expectations,
      });
      if (!plan.eligible) return review(plan.reason);
      if (existingSlot[0] && existingSlot[0].bookingId !== plan.bookingId)
        return review('payroll_already_exists');
      const result = decidePayslipIntake(
        tx,
        id,
        {
          action: 'confirm',
          accountId: target.id,
          payeeId: sender.id,
          payoutDate: plan.payoutDate,
          bookingId: plan.bookingId,
          expectedOccurrenceId: plan.expectedOccurrenceId,
        },
        {
          ...ctx,
          actor: `document-automation:payroll@${snapshot.configRevision ?? 'unversioned'}`,
        },
        existingSlot[0]?.id,
      );
      const captured = tx.select().from(payslip).where(eq(payslip.id, result.payslipId!)).get()!;
      return {
        status: plan.bookingId ? 'linked' : 'booked',
        reason: existingSlot[0] ? 'existing_payroll_source_attached' : 'unambiguous_source',
        groupId: result.groupId ?? null,
        payslipId: result.payslipId!,
        ...(captured.bookingId ? { bookingId: captured.bookingId } : {}),
      };
    });
  } catch (error) {
    if (
      error instanceof ConflictError ||
      error instanceof BookingInvariantError ||
      error instanceof EntityNotFoundError
    )
      return review('current_state_needs_review');
    throw error;
  }
}
