import { payrollTotals, type CapturedPayslip } from './payroll-projects';
import type { ParsedPayrollDocument } from './payslip-intake';

/**
 * Plan of the owner-triggered re-read of stored payslips (#1066). Pure: the caller reads the
 * stored PDFs; this decides per payslip whether its wage lines may be added. A payslip is only
 * ever completed with new rows: header totals, lines, bookings and receipts are never touched,
 * and a re-read whose totals differ from the stored ones changes nothing.
 */
export type WageRereadOutcome =
  | 'add'
  | 'already_read'
  | 'no_document'
  | 'file_missing'
  | 'password'
  | 'unreadable'
  | 'no_wage_lines'
  | 'totals_differ';
export type WageRereadField =
  | 'month'
  | 'kind'
  | 'gross'
  | 'sv'
  | 'tax'
  | 'net'
  | 'reimbursements'
  | 'deductions'
  | 'adjustments';
export type WageRereadSource =
  | { status: 'parsed'; parsed: ParsedPayrollDocument }
  | { status: 'file_missing' | 'password' | 'unreadable' };
export interface WageRereadPlanItem {
  payslipId: string;
  month: string;
  outcome: WageRereadOutcome;
  /** Wage lines that would be (or were) added; 0 for every other outcome. */
  lineCount: number;
  /** Reconciliation of the re-read lines with the gross; null when nothing is added. */
  lineCheck: 'ok' | 'gross_mismatch' | 'no_gross' | null;
  /** Stored legacy fields the re-read disagrees with (outcome `totals_differ`). */
  differences: WageRereadField[];
}

/** Whether the stored document has to be opened at all. */
export const wageRereadNeedsSource = (slip: Pick<CapturedPayslip, 'receiptId'>, hasRead: boolean) =>
  !hasRead && slip.receiptId !== null;

export function planWageReread(
  slip: CapturedPayslip,
  hasRead: boolean,
  source: WageRereadSource | null,
): WageRereadPlanItem {
  const item = (
    outcome: WageRereadOutcome,
    differences: WageRereadField[] = [],
  ): WageRereadPlanItem => ({
    payslipId: slip.id,
    month: slip.month,
    outcome,
    lineCount: 0,
    lineCheck: null,
    differences,
  });
  if (hasRead) return item('already_read');
  if (slip.receiptId === null) return item('no_document');
  if (!source) return item('file_missing');
  if (source.status !== 'parsed') return item(source.status);
  const { parsed } = source;
  if (parsed.documentType === 'unknown') return item('unreadable');
  const draft = parsed.draft;
  if (!draft || !parsed.wageLines) return item('no_wage_lines');
  const stored = payrollTotals([slip]),
    reread = payrollTotals([draft]);
  const adjustments = (lines: CapturedPayslip['lines']) =>
    ['sv_adjustment', 'tax_adjustment'].map((section) =>
      lines.filter((l) => l.section === section).reduce((n, l) => n + l.amountCents, 0),
    );
  const [svAdjStored, taxAdjStored] = adjustments(slip.lines);
  const [svAdjReread, taxAdjReread] = adjustments(draft.lines);
  const differences = (
    [
      ['month', slip.month === draft.month],
      ['kind', slip.kind === draft.kind && slip.specialType === draft.specialType],
      ['gross', slip.grossCents === draft.grossCents],
      ['sv', slip.svCents === draft.svCents],
      ['tax', slip.taxCents === draft.taxCents],
      ['net', slip.netCents === draft.netCents],
      ['reimbursements', stored.reimbursementsCents === reread.reimbursementsCents],
      ['deductions', stored.otherCents === reread.otherCents],
      ['adjustments', svAdjStored === svAdjReread && taxAdjStored === taxAdjReread],
    ] as const
  )
    .filter(([, same]) => !same)
    .map(([field]) => field);
  if (differences.length) return item('totals_differ', differences);
  return {
    ...item('add'),
    lineCount: parsed.wageLines.length,
    lineCheck: parsed.wageLineIssue ?? 'ok',
  };
}
