import { payrollTotals, payslipInput, type PayslipInput } from './payroll-projects';
import { PAYSLIP_PARSER_VERSION, proposedPayslipPayoutDate, type ParsedPayrollDocument } from './payslip-intake';

export type PayslipAutomationOutcome = {
  status: 'booked' | 'linked' | 'pruefen' | 'unchanged';
  reason: string;
  groupId: string | null;
  payslipId?: string;
  bookingId?: string;
};
export type PayrollAutomaticBooking = {
  id: string;
  date: string;
  amountCents: number;
  currency: string;
  payeeId: string | null;
  transferId: string | null;
  alreadyCaptured: boolean;
  expectedOccurrenceIds: ReadonlyArray<string>;
  splits: ReadonlyArray<{
    amountCents: number;
    incomeTypeId: string | null;
    categoryId: string | null;
    contactId: string | null;
    transferId: string | null;
  }>;
};
export type PayrollAutomaticExpectation = {
  occurrenceId: string;
  dueDate: string;
  amountCents: number;
  currency: string;
  payeeId: string | null;
  incomeTypeId: string | null;
  status: string;
  bookingId: string | null;
  contactId: string | null;
};
export type PayrollAutomaticPlan =
  | { eligible: false; reason: string }
  | { eligible: true; payoutDate: string; bookingId: string | null; expectedOccurrenceId: string | null };

/** Stricter than manual suggestions: never infer an employer or match by amount/date alone. */
export function planPayslipAutomation(input: {
  parsed: ParsedPayrollDocument;
  payeeId: string;
  salaryIncomeTypeId: string;
  payrollIncomeTypeIds: ReadonlyArray<string>;
  reimbursementIncomeTypeId: string;
  openingDate: string;
  bookings: ReadonlyArray<PayrollAutomaticBooking>;
  expectations: ReadonlyArray<PayrollAutomaticExpectation>;
}): PayrollAutomaticPlan {
  const no = (reason: string): PayrollAutomaticPlan => ({ eligible: false, reason });
  const p = input.parsed;
  if (!p.draft || !['payslip', 'bonus'].includes(p.documentType) || p.parserVersion !== PAYSLIP_PARSER_VERSION || p.periodSource !== 'content' || p.warnings.length || p.unmappedWageTypes?.length ||
      p.differenceCents === null || !Number.isSafeInteger(p.differenceCents) || Math.abs(p.differenceCents) > 1)
    return no('document_needs_review');
  // Validate the same signed rounding line used by the existing confirmation writer.
  const difference = payrollTotals([p.draft]).calculatedNetCents - p.draft.netCents;
  if (!Number.isSafeInteger(difference) || Math.abs(difference) > 1 || difference !== p.differenceCents)
    return no('document_needs_review');
  const checked = payslipInput.safeParse({ ...p.draft, lines: [
    ...p.draft.lines,
    ...(difference ? [{ section: 'deduction', label: 'Rundung (Summenprüfung)', amountCents: difference }] : []),
  ] });
  if (!checked.success || p.draft.netCents <= 0) return no('document_needs_review');
  const totals = payrollTotals([p.draft]);
  const salary = p.draft.netCents - totals.reimbursementsCents;
  if (!Number.isSafeInteger(salary) || salary <= 0 || totals.reimbursementsCents < 0)
    return no('document_needs_review');
  const expectations = input.expectations.filter((e) =>
    e.incomeTypeId === input.salaryIncomeTypeId && (e.payeeId === input.payeeId || e.payeeId === null));
  if (expectations.length > 1) return no('expectation_ambiguous');
  const expected = expectations[0];
  if (expected && (expected.payeeId !== input.payeeId || expected.currency !== 'EUR' ||
      expected.amountCents !== p.draft.netCents || expected.contactId ||
      !['expected', 'received'].includes(expected.status))) return no('expectation_needs_review');
  const printed = proposedPayslipPayoutDate(p);
  const date = printed ?? expected?.dueDate;
  const dateTime = date ? Date.parse(date + 'T00:00:00Z') : NaN;
  if (!date || date < input.openingDate || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(dateTime) || new Date(dateTime).toISOString().slice(0, 10) !== date)
    return no('payout_date_missing');
  if (expected && expected.dueDate !== date) return no('expectation_date_conflict');
  // Include any nearby payroll-like booking, even with missing/wrong sender, as a conflict.
  const nearby = input.bookings.filter((b) => b.amountCents > 0 &&
    Math.abs(Date.parse(b.date) - Date.parse(date)) <= 5 * 86400000 &&
    (b.amountCents === p.draft!.netCents || b.payeeId === input.payeeId || b.splits.some((s) => input.payrollIncomeTypeIds.includes(s.incomeTypeId ?? ''))));
  if (nearby.length > 1) return no('booking_ambiguous');
  const existing = nearby[0];
  if (existing) {
    const splitTotal = (kind: string) => existing.splits.filter((s) => s.incomeTypeId === kind)
      .reduce((sum, s) => sum + s.amountCents, 0);
    if (existing.expectedOccurrenceIds.some((id) => id !== expected?.occurrenceId) ||
        existing.date !== date || existing.currency !== 'EUR' || existing.payeeId !== input.payeeId ||
        existing.amountCents !== p.draft.netCents || existing.transferId || existing.alreadyCaptured ||
        existing.splits.some((s) => s.categoryId !== null || s.contactId || s.transferId || !Number.isSafeInteger(s.amountCents) ||
          ![input.salaryIncomeTypeId, input.reimbursementIncomeTypeId].includes(s.incomeTypeId ?? '')) ||
        splitTotal(input.salaryIncomeTypeId) !== salary ||
        splitTotal(input.reimbursementIncomeTypeId) !== totals.reimbursementsCents)
      return no('booking_needs_review');
  }
  if (expected?.bookingId && expected.bookingId !== existing?.id) return no('expectation_already_linked');
  if (expected && !expected.bookingId && expected.status !== 'expected') return no('expectation_needs_review');
  return { eligible: true, payoutDate: date, bookingId: existing?.id ?? null,
    expectedOccurrenceId: expected && !expected.bookingId ? expected.occurrenceId : null };
}

/** Existing regular/special payroll identity, not PDF byte identity. */
export function sameAutomaticPayrollSlot(a: PayslipInput, b: Pick<PayslipInput, 'month' | 'kind' | 'specialType' | 'grossCents'>) {
  return a.month === b.month && a.kind === b.kind && a.specialType === b.specialType &&
    (a.specialType !== 'other' || a.grossCents === b.grossCents);
}


/** Exact captured document values; never overwrite an amended/manual payroll record. */
export function sameAutomaticPayrollRecord(a: PayslipInput, b: PayslipInput): boolean {
  const fields = (p: PayslipInput) => ({
    month: p.month, kind: p.kind, specialType: p.specialType,
    grossCents: p.grossCents, svCents: p.svCents, taxCents: p.taxCents, netCents: p.netCents,
    lines: p.lines.map(({ section, label, amountCents }) => ({ section, label, amountCents })),
  });
  return JSON.stringify(fields(a)) === JSON.stringify(fields(b));
}
