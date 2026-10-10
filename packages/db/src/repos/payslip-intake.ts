import { randomUUID } from 'node:crypto';
import { and, eq, isNull, min, or } from 'drizzle-orm';
import {
  isDuplicatePayslip,
  payrollTotals,
  payslipInput,
  payslipSourceConfig,
  type ParsedPayrollDocument,
  type PayslipSourceConfig,
} from '@budget/domain';
import {
  account,
  appSetting,
  booking,
  bookingSplit,
  INCOME_TYPES,
  inboxItem,
  payslipIntake,
  payslipScan,
  payslip,
  payslipSecret,
  receipt,
} from '../schema';
import {
  insertTracked,
  updateTracked,
  recordAudit,
  withGroup,
  nowIso,
  type AuditContext,
} from './audit';
import { ConflictError, EntityNotFoundError } from './errors';
import { runInTransaction, type Executor } from './types';
import { addReceipt, getReceipt, linkReceipt } from './receipts';
import { savePayslip } from './payroll-projects';
import { earliestAccountDate } from './portfolio';
import { listEntities } from './entities';

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
export function payslipMatches(db: Executor, parsed: ParsedPayrollDocument) {
  const config = getPayslipSourceConfig(db),
    draft = parsed.draft;
  if (!draft || !config.salaryAccountId) return [];
  const anchor =
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
        eq(booking.accountId, config.salaryAccountId),
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
    }));
}
export function decidePayslipIntake(
  db: Executor,
  id: string,
  decision: { action: 'confirm' | 'reject'; bookingId: string | null },
  ctx: AuditContext,
) {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const row = getPayslipIntake(tx, id);
    if (row.status !== 'pending')
      throw new ConflictError('Diese Aufgabe wurde bereits entschieden.');
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
      if (decision.bookingId && !payslipMatches(tx, p).some((b) => b.id === decision.bookingId))
        throw new ConflictError(
          'Gehaltsbuchung ist nicht mehr verfügbar oder außerhalb des Zeitfensters.',
        );
      getReceipt(tx, row.receiptId);
      const lines = [...p.draft.lines];
      const difference = payrollTotals([p.draft]).calculatedNetCents - p.draft.netCents;
      if (difference)
        lines.push({
          section: 'deduction',
          label: 'Rundung (Summenprüfung)',
          amountCents: difference,
        });
      const saved = savePayslip(
        tx,
        payslipInput.parse({
          ...p.draft,
          lines,
          receiptId: row.receiptId,
          bookingId: decision.bookingId,
        }),
        grouped,
        undefined,
        row.id,
      );
      payslipId = saved.id;
      if (decision.bookingId) linkReceipt(tx, row.receiptId, decision.bookingId, grouped);
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
