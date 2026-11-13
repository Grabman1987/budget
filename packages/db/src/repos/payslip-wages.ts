import { randomUUID } from 'node:crypto';
import {
  normalizeWageLabel,
  type CapturedPayslip,
  type ParsedPayrollDocument,
  type SalaryComponent,
  type SalaryPayslip,
  type WageComponentRule,
} from '@budget/domain';
import { and, asc, eq, isNull } from 'drizzle-orm';
import {
  contact,
  payslip,
  payslipIntake,
  payslipWageLine,
  payslipWageRead,
  wageComponentMapping,
} from '../schema';
import { listPayslips } from './payroll-projects';
import {
  insertManyTracked,
  insertTracked,
  updateTracked,
  withGroup,
  type AuditContext,
} from './audit';
import { BookingInvariantError, ConflictError } from './errors';
import { runInTransaction, type Executor } from './types';

/**
 * Wage lines of #1066. Rows are only ever added next to an existing payslip: its header, its
 * legacy lines, bookings and receipts stay exactly as they are.
 */
const liveRead = (db: Executor, payslipId: string) =>
  db
    .select()
    .from(payslipWageRead)
    .where(and(eq(payslipWageRead.payslipId, payslipId), isNull(payslipWageRead.deletedAt)))
    .get();

/**
 * Store the wage lines and the statutory split of a parse result for one payslip. Returns null
 * (and writes nothing) when the result has no wage lines or the payslip already has a reading.
 */
export function storePayslipWageRead(
  tx: Executor,
  payslipId: string,
  parsed: ParsedPayrollDocument,
  source: { origin: 'intake' | 'reread'; receiptId: string | null },
  ctx: AuditContext,
): { readId: string; lineCount: number } | null {
  if (!parsed.wageLines || liveRead(tx, payslipId)) return null;
  const grouped = withGroup(ctx);
  const split = parsed.statutorySplit ?? null;
  const readId = randomUUID();
  insertTracked(
    tx,
    payslipWageRead,
    {
      id: readId,
      payslipId,
      receiptId: source.receiptId,
      origin: source.origin,
      parserVersion: parsed.parserVersion ?? 0,
      lineCheck: parsed.wageLineIssue ?? 'ok',
      svCurrentCents: split?.svCurrentCents ?? null,
      svSpecialCents: split?.svSpecialCents ?? null,
      taxCurrentCents: split?.taxCurrentCents ?? null,
      taxOtherCents: split?.taxOtherCents ?? null,
    },
    grouped,
  );
  if (parsed.wageLines.length)
    insertManyTracked(
      tx,
      payslipWageLine,
      parsed.wageLines.map((line) => ({
        id: randomUUID(),
        readId,
        payslipId,
        lineOrder: line.order,
        wageCode: line.code,
        label: line.label,
        section: line.section,
        referenceMonth: line.referenceMonth,
        quantityText: line.quantity,
        rateText: line.rate,
        amountCents: line.amountCents,
      })),
      grouped,
    );
  return { readId, lineCount: parsed.wageLines.length };
}

export type PayslipWageReadRow = typeof payslipWageRead.$inferSelect & {
  lines: (typeof payslipWageLine.$inferSelect)[];
};
/** Live readings of live payslips with their lines in printed order. */
export function listPayslipWageReads(db: Executor): PayslipWageReadRow[] {
  const reads = db
    .select({ read: payslipWageRead })
    .from(payslipWageRead)
    .innerJoin(payslip, eq(payslip.id, payslipWageRead.payslipId))
    .where(and(isNull(payslipWageRead.deletedAt), isNull(payslip.deletedAt)))
    .orderBy(asc(payslip.month), asc(payslipWageRead.payslipId))
    .all()
    .map((r) => r.read);
  const lines = db
    .select()
    .from(payslipWageLine)
    .where(isNull(payslipWageLine.deletedAt))
    .orderBy(asc(payslipWageLine.lineOrder))
    .all();
  return reads.map((read) => ({ ...read, lines: lines.filter((l) => l.readId === read.id) }));
}

/**
 * Input of the salary development module: every live payslip with its legacy fields, the document
 * type of its confirmed intake (bonus payroll runs) and its wage reading when it has one.
 */
export function listSalaryPayslips(db: Executor): SalaryPayslip[] {
  const reads = new Map(listPayslipWageReads(db).map((r) => [r.payslipId, r]));
  const bonus = new Set(
    db
      .select({ payslipId: payslipIntake.payslipId, parsedJson: payslipIntake.parsedJson })
      .from(payslipIntake)
      .where(and(eq(payslipIntake.status, 'confirmed'), isNull(payslipIntake.deletedAt)))
      .all()
      .filter((r) => (JSON.parse(r.parsedJson) as ParsedPayrollDocument).documentType === 'bonus')
      .map((r) => r.payslipId),
  );
  const employers = new Map(
    db
      .select({ id: payslip.id, employerContactId: payslip.employerContactId })
      .from(payslip)
      .all()
      .map((r) => [r.id, r.employerContactId]),
  );
  return listPayslips(db).map((p) => {
    const read = reads.get(p.id);
    return {
      ...p,
      employerContactId: employers.get(p.id) ?? null,
      documentType: bonus.has(p.id) ? ('bonus' as const) : null,
      wage: read
        ? {
            lineCheck: read.lineCheck,
            split:
              read.svCurrentCents === null
                ? null
                : {
                    svCurrentCents: read.svCurrentCents,
                    svSpecialCents: read.svSpecialCents!,
                    taxCurrentCents: read.taxCurrentCents!,
                    taxOtherCents: read.taxOtherCents!,
                  },
            lines: read.lines.map((l) => ({
              code: l.wageCode,
              label: l.label,
              section: l.section,
              amountCents: l.amountCents,
            })),
          }
        : null,
    };
  });
}
export const wageComponentRules = (db: Executor): WageComponentRule[] =>
  listWageComponentMappings(db).map((m) => ({
    employerContactId: m.employerContactId,
    wageCode: m.wageCode,
    labelNorm: m.labelNorm,
    component: m.component,
  }));

export interface WageRereadWrite {
  /** The stored header the plan was made against; the write is skipped if it changed since. */
  payslip: Pick<
    CapturedPayslip,
    'id' | 'month' | 'grossCents' | 'svCents' | 'taxCents' | 'netCents' | 'receiptId'
  >;
  parsed: ParsedPayrollDocument;
}
/**
 * Apply planned re-reads in one transaction and one audit group (undoable as a whole). A payslip
 * whose header changed or which got a reading in the meantime is skipped and reported.
 */
export function applyPayslipWageReread(
  db: Executor,
  writes: WageRereadWrite[],
  ctx: AuditContext,
): { groupId: string | null; written: string[]; skipped: string[] } {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const written: string[] = [],
      skipped: string[] = [];
    for (const { payslip: planned, parsed } of writes) {
      const current = tx
        .select()
        .from(payslip)
        .where(and(eq(payslip.id, planned.id), isNull(payslip.deletedAt)))
        .get();
      const unchanged =
        current &&
        current.month === planned.month &&
        current.grossCents === planned.grossCents &&
        current.svCents === planned.svCents &&
        current.taxCents === planned.taxCents &&
        current.netCents === planned.netCents &&
        current.receiptId === planned.receiptId;
      const stored = unchanged
        ? storePayslipWageRead(
            tx,
            planned.id,
            parsed,
            { origin: 'reread', receiptId: planned.receiptId },
            grouped,
          )
        : null;
      (stored ? written : skipped).push(planned.id);
    }
    return { groupId: written.length ? grouped.groupId : null, written, skipped };
  });
}

// --- Owner mapping wage type → salary component --------------------------------------------------

export interface WageComponentMappingInput {
  employerContactId: string | null;
  wageCode: string | null;
  label: string | null;
  component: SalaryComponent;
}
const mappingKey = (employer: string | null, code: string | null, label: string | null) =>
  `${employer ?? ''}|${code ?? ''}|${label ?? ''}`;

export const listWageComponentMappings = (db: Executor) =>
  db
    .select()
    .from(wageComponentMapping)
    .where(isNull(wageComponentMapping.deletedAt))
    .orderBy(asc(wageComponentMapping.mappingKey))
    .all();

/** Create or change the component of one mapping key; audited. */
export function saveWageComponentMapping(
  db: Executor,
  input: WageComponentMappingInput,
  ctx: AuditContext,
) {
  const code = input.wageCode?.trim() || null;
  const labelNorm = input.label ? normalizeWageLabel(input.label) || null : null;
  if (!code && !labelNorm)
    throw new BookingInvariantError('Bitte Lohnart-Nummer oder Bezeichnung angeben.');
  if (code && !/^\d{1,8}$/.test(code))
    throw new BookingInvariantError('Die Lohnart-Nummer besteht aus bis zu 8 Ziffern.');
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    if (
      input.employerContactId &&
      !tx
        .select()
        .from(contact)
        .where(and(eq(contact.id, input.employerContactId), isNull(contact.deletedAt)))
        .get()
    )
      throw new BookingInvariantError('Der Arbeitgeber ist nicht mehr verfügbar.');
    const key = mappingKey(input.employerContactId, code, labelNorm);
    const existing = tx
      .select()
      .from(wageComponentMapping)
      .where(and(eq(wageComponentMapping.mappingKey, key), isNull(wageComponentMapping.deletedAt)))
      .get();
    if (existing) {
      updateTracked(
        tx,
        wageComponentMapping,
        [existing.id],
        { component: input.component },
        grouped,
      );
      return { id: existing.id, groupId: grouped.groupId };
    }
    const row = insertTracked(
      tx,
      wageComponentMapping,
      {
        id: randomUUID(),
        employerContactId: input.employerContactId,
        wageCode: code,
        labelNorm,
        mappingKey: key,
        component: input.component,
      },
      grouped,
    );
    return { id: row.id, groupId: grouped.groupId };
  });
}

export function deleteWageComponentMapping(db: Executor, id: string, ctx: AuditContext) {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const row = tx
      .select()
      .from(wageComponentMapping)
      .where(and(eq(wageComponentMapping.id, id), isNull(wageComponentMapping.deletedAt)))
      .get();
    if (!row) throw new ConflictError('Diese Zuordnung ist nicht mehr vorhanden.');
    updateTracked(
      tx,
      wageComponentMapping,
      [id],
      { deletedAt: new Date().toISOString() },
      grouped,
      'delete',
    );
    return { groupId: grouped.groupId };
  });
}
