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
  payslipWageLine,
  payslipWageRead,
  WAGE_LINE_SECTIONS,
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

const SECTIONS: readonly string[] = WAGE_LINE_SECTIONS;
const lineCheckOf = (issue: unknown): 'ok' | 'gross_mismatch' | 'no_gross' =>
  issue === 'gross_mismatch' || issue === 'no_gross' ? issue : 'ok';
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const nowIso = () => new Date().toISOString();
const safeInt = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n);
const text160 = (value: string) => Array.from(value.trim()).slice(0, 160).join('');
const shortText = (value: unknown) =>
  typeof value === 'string' && value.trim() ? Array.from(value.trim()).slice(0, 32).join('') : null;

/**
 * Bring parsed wage lines into the stored shape: labels trimmed and cut to 160 characters, the
 * order renumbered 0…n−1, an invalid reference month or section dropped, each with a reason.
 * Returns null when an amount is not an integer number of cents (nothing is stored then).
 */
export function normalizeWageRead(parsed: ParsedPayrollDocument) {
  const issues = new Set<string>();
  const lines = [];
  for (const [order, line] of (parsed.wageLines ?? []).entries()) {
    if (!safeInt(line.amountCents)) return null;
    let label = text160(typeof line.label === 'string' ? line.label : '');
    if (typeof line.label === 'string' && Array.from(line.label.trim()).length > 160)
      issues.add('label_truncated');
    const code = shortText(line.code);
    if (!label) {
      label = code ? `Lohnart ${code}` : 'Ohne Bezeichnung';
      issues.add('label_missing');
    }
    if (line.order !== order) issues.add('order_renumbered');
    let referenceMonth: string | null = null;
    if (line.referenceMonth != null) {
      if (typeof line.referenceMonth === 'string' && MONTH.test(line.referenceMonth))
        referenceMonth = line.referenceMonth;
      else issues.add('reference_month_dropped');
    }
    const section = SECTIONS.includes(line.section) ? line.section : 'unknown';
    if (section !== line.section) issues.add('section_unknown');
    lines.push({
      lineOrder: order,
      wageCode: code,
      label,
      section,
      referenceMonth,
      quantityText: shortText(line.quantity),
      rateText: shortText(line.rate),
      amountCents: line.amountCents,
    });
  }
  const split = parsed.statutorySplit ?? null;
  const splitValid =
    split !== null &&
    [split.svCurrentCents, split.svSpecialCents, split.taxCurrentCents, split.taxOtherCents].every(
      safeInt,
    );
  if (split && !splitValid) issues.add('split_dropped');
  return {
    lines,
    split: splitValid ? split : null,
    lineCheck: lineCheckOf(parsed.wageLineIssue),
    parserVersion: safeInt(parsed.parserVersion) ? parsed.parserVersion : 0,
    issues: [...issues],
  };
}

export type WageReadOutcome =
  | { status: 'stored'; readId: string; lineCount: number; issues: string[] }
  /** `recorded`: a `skipped` reading (with audit entries) was written for it. */
  | { status: 'skipped'; reason: string; recorded: boolean }
  | { status: 'unchanged' };

/** Constraint or validation errors of the data; everything else is a programming error. */
const isDataError = (error: unknown) =>
  error instanceof Error &&
  (error.name === 'SqliteError' || error.name === 'ZodError' || error.name === 'RangeError') &&
  (error.name !== 'SqliteError' ||
    String((error as { code?: unknown }).code).startsWith('SQLITE_CONSTRAINT'));
const logged = new Set<string>();
/**
 * A programming error surfaces outside production. In production the payslip write still goes
 * on: the reading records the error class and it is logged once per class, without any content.
 */
function errorMarker(error: unknown): string | null {
  if (isDataError(error)) return null;
  if (process.env['NODE_ENV'] !== 'production') throw error;
  const name = error instanceof Error ? error.constructor.name || 'Error' : 'Unknown';
  if (!logged.has(name)) {
    logged.add(name);
    console.error(`Gehaltszeilen übersprungen (${name}).`);
  }
  return `error:${name}`;
}

/**
 * Store the wage lines and the statutory split of a parse result for one payslip, inside its own
 * savepoint. It never throws for the data: lines are normalised first; if they still cannot be
 * stored, a `skipped` reading records the reason and the caller's write (e.g. a payslip confirm)
 * goes on. `unchanged`: no wage lines in the result, or the payslip already has a reading. A
 * `skipped` reading is replaced by the next successful one.
 */
export function storePayslipWageRead(
  tx: Executor,
  payslipId: string,
  parsed: ParsedPayrollDocument,
  source: { origin: 'intake' | 'reread'; receiptId: string | null },
  ctx: AuditContext,
): WageReadOutcome {
  if (!parsed.wageLines) return { status: 'unchanged' };
  const existing = liveRead(tx, payslipId);
  if (existing && existing.lineCheck !== 'skipped') return { status: 'unchanged' };
  const grouped = withGroup(ctx);
  const header = {
    payslipId,
    receiptId: source.receiptId,
    origin: source.origin,
    parserVersion: safeInt(parsed.parserVersion) ? parsed.parserVersion : 0,
  };
  const skip = (reason: string, marker: string | null = null): WageReadOutcome => {
    let recorded = false;
    try {
      runInTransaction(tx, (inner) => {
        if (existing) return;
        insertTracked(
          inner,
          payslipWageRead,
          {
            id: randomUUID(),
            ...header,
            lineCheck: 'skipped',
            issues: JSON.stringify(marker ? [reason, marker] : [reason]),
          },
          grouped,
        );
        recorded = true;
      });
    } catch (error) {
      // Even the record of the skip must not fail the caller's write (data errors only).
      errorMarker(error);
      recorded = false;
    }
    return { status: 'skipped', reason, recorded };
  };
  try {
    const normal = normalizeWageRead(parsed);
    if (!normal) return skip('amount_invalid');
    return runInTransaction(tx, (inner) => {
      if (existing)
        updateTracked(
          inner,
          payslipWageRead,
          [existing.id],
          { deletedAt: nowIso() },
          grouped,
          'delete',
        );
      const readId = randomUUID();
      insertTracked(
        inner,
        payslipWageRead,
        {
          id: readId,
          ...header,
          lineCheck: normal.lineCheck,
          issues: normal.issues.length ? JSON.stringify(normal.issues) : null,
          svCurrentCents: normal.split?.svCurrentCents ?? null,
          svSpecialCents: normal.split?.svSpecialCents ?? null,
          taxCurrentCents: normal.split?.taxCurrentCents ?? null,
          taxOtherCents: normal.split?.taxOtherCents ?? null,
        },
        grouped,
      );
      if (normal.lines.length)
        insertManyTracked(
          inner,
          payslipWageLine,
          normal.lines.map((line) => ({ id: randomUUID(), readId, payslipId, ...line })),
          grouped,
        );
      return {
        status: 'stored' as const,
        readId,
        lineCount: normal.lines.length,
        issues: normal.issues,
      };
    });
  } catch (error) {
    return skip('write_failed', errorMarker(error));
  }
}

/** Soft-delete the live reading of a payslip and its lines (header edited or payslip deleted). */
export function retirePayslipWageRead(tx: Executor, payslipId: string, ctx: AuditContext) {
  const read = liveRead(tx, payslipId);
  if (!read) return false;
  const grouped = withGroup(ctx);
  for (const line of tx
    .select()
    .from(payslipWageLine)
    .where(and(eq(payslipWageLine.readId, read.id), isNull(payslipWageLine.deletedAt)))
    .orderBy(asc(payslipWageLine.lineOrder))
    .all())
    updateTracked(tx, payslipWageLine, [line.id], { deletedAt: nowIso() }, grouped, 'delete');
  updateTracked(tx, payslipWageRead, [read.id], { deletedAt: nowIso() }, grouped, 'delete');
  return true;
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
 * Input of the salary development module: every live payslip with its legacy fields, its employer
 * resolved through contact merges (#871) and its wage reading when it has a usable one (a
 * `skipped` reading counts as none).
 */
export function listSalaryPayslips(db: Executor): SalaryPayslip[] {
  const reads = new Map(
    listPayslipWageReads(db)
      .filter((r) => r.lineCheck !== 'skipped')
      .map((r) => [r.payslipId, r]),
  );
  const merged = new Map(
    db
      .select({ id: contact.id, mergedIntoId: contact.mergedIntoId })
      .from(contact)
      .all()
      .map((c) => [c.id, c.mergedIntoId]),
  );
  const resolve = (id: string | null) => {
    for (let hop = 0; id && merged.get(id) && hop < 16; hop++) id = merged.get(id)!;
    return id;
  };
  const employers = new Map(
    db
      .select({ id: payslip.id, employerContactId: payslip.employerContactId })
      .from(payslip)
      .all()
      .map((r) => [r.id, r.employerContactId]),
  );
  return listPayslips(db).map((p) => {
    const read = reads.get(p.id);
    const lineCheck = read?.lineCheck;
    return {
      ...p,
      employerContactId: resolve(employers.get(p.id) ?? null),
      wage:
        read && lineCheck && lineCheck !== 'skipped'
          ? {
              lineCheck,
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
                referenceMonth: l.referenceMonth,
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
    | 'id'
    | 'month'
    | 'kind'
    | 'specialType'
    | 'grossCents'
    | 'svCents'
    | 'taxCents'
    | 'netCents'
    | 'receiptId'
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
    let audited = false;
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
        current.kind === planned.kind &&
        current.specialType === planned.specialType &&
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
      (stored?.status === 'stored' ? written : skipped).push(planned.id);
      if (stored?.status === 'stored' || (stored?.status === 'skipped' && stored.recorded))
        audited = true;
    }
    return { groupId: audited ? grouped.groupId : null, written, skipped };
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
    const employer = input.employerContactId
      ? tx
          .select()
          .from(contact)
          .where(and(eq(contact.id, input.employerContactId), isNull(contact.deletedAt)))
          .get()
      : null;
    if (input.employerContactId && (!employer || employer.mergedIntoId))
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

/**
 * Contact merge (#871): the source employer's mappings move to the target. Where the target already
 * maps the same wage code/label, the target's mapping is kept and the source's is retired.
 */
export function planWageMappingMerge(tx: Executor, sourceId: string, targetId: string) {
  const live = (employer: string) =>
    tx
      .select()
      .from(wageComponentMapping)
      .where(
        and(
          eq(wageComponentMapping.employerContactId, employer),
          isNull(wageComponentMapping.deletedAt),
        ),
      )
      .orderBy(asc(wageComponentMapping.id))
      .all();
  const targetKeys = new Set(live(targetId).map((m) => m.mappingKey));
  const rows = live(sourceId).map((m) => {
    const key = mappingKey(targetId, m.wageCode, m.labelNorm);
    return { row: m, key, keepTarget: targetKeys.has(key) };
  });
  return {
    rows,
    moves: rows.filter((r) => !r.keepTarget).length,
    keptTarget: rows.filter((r) => r.keepTarget).length,
  };
}
export function mergeWageMappings(
  tx: Executor,
  sourceId: string,
  targetId: string,
  ctx: AuditContext,
) {
  const grouped = withGroup(ctx);
  const plan = planWageMappingMerge(tx, sourceId, targetId);
  for (const { row, key, keepTarget } of plan.rows)
    updateTracked(
      tx,
      wageComponentMapping,
      [row.id],
      keepTarget ? { deletedAt: nowIso() } : { employerContactId: targetId, mappingKey: key },
      grouped,
      keepTarget ? 'delete' : 'update',
    );
  return { moves: plan.moves, keptTarget: plan.keptTarget };
}
