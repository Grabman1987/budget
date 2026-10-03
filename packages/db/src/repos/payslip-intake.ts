import { randomUUID } from 'node:crypto';
import { and, eq, isNull, or } from 'drizzle-orm';
import {
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
  receipt,
} from '../schema';
import { insertTracked, updateTracked, withGroup, nowIso, type AuditContext } from './audit';
import { ConflictError, EntityNotFoundError } from './errors';
import { runInTransaction, type Executor } from './types';
import { addReceipt, getReceipt, linkReceipt } from './receipts';
import { savePayslip } from './payroll-projects';

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
  },
  ctx: AuditContext,
) {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
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
