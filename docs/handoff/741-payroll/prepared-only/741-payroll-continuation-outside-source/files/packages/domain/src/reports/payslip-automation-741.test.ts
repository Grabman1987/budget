import { describe, expect, it } from 'vitest';
import {
  planPayslipAutomation,
  sameAutomaticPayrollRecord,
  sameAutomaticPayrollSlot,
  type PayrollAutomaticBooking,
  type PayrollAutomaticExpectation,
} from './payslip-automation';
import { PAYSLIP_PARSER_VERSION, type ParsedPayrollDocument } from './payslip-intake';

// Independent cents: 400000 - 68000 - 44000 - 500 + 10000 = 297500.
// The payout remains salary 287500 plus reimbursement 10000, never a second salary.
const parsed = (): ParsedPayrollDocument => ({
  documentType: 'payslip', periodSource: 'content', parserVersion: PAYSLIP_PARSER_VERSION,
  payoutDate: '2031-01-31', differenceCents: 0, warnings: [],
  draft: {
    month: '2031-01', kind: 'regular', specialType: null,
    grossCents: 400000, svCents: 68000, taxCents: 44000, netCents: 297500,
    bookingId: null, receiptId: null,
    lines: [
      { section: 'deduction', label: 'Synthetic deduction', amountCents: 500 },
      { section: 'reimbursement', label: 'Synthetic reimbursement', amountCents: 10000 },
    ],
  },
});
const booking = (patch: Partial<PayrollAutomaticBooking> = {}): PayrollAutomaticBooking => ({
  id: 'synthetic-existing-payout', date: '2031-01-31', amountCents: 297500,
  currency: 'EUR', payeeId: 'synthetic-configured-employer', transferId: null,
  alreadyCaptured: false, expectedOccurrenceIds: [],
  splits: [
    { amountCents: 287500, incomeTypeId: 'income-salary', categoryId: null, contactId: null, transferId: null },
    { amountCents: 10000, incomeTypeId: 'income-refund', categoryId: null, contactId: null, transferId: null },
  ],
  ...patch,
});
const expectation = (patch: Partial<PayrollAutomaticExpectation> = {}): PayrollAutomaticExpectation => ({
  occurrenceId: 'synthetic-salary-occurrence', dueDate: '2031-01-31', amountCents: 297500,
  currency: 'EUR', payeeId: 'synthetic-configured-employer', incomeTypeId: 'income-salary',
  status: 'expected', bookingId: null, contactId: null, ...patch,
});
const input = (document = parsed()) => ({
  parsed: document, payeeId: 'synthetic-configured-employer',
  salaryIncomeTypeId: 'income-salary', payrollIncomeTypeIds: ['income-salary', 'income-special'],
  reimbursementIncomeTypeId: 'income-refund', openingDate: '2030-01-01',
  bookings: [] as PayrollAutomaticBooking[], expectations: [] as PayrollAutomaticExpectation[],
});

describe('strict payroll upload eligibility with independent literals', () => {
  it('allows a fully reconciled new payout on its printed date without changing the parsed values', () => {
    const source = input(), before = JSON.stringify(source);
    expect(planPayslipAutomation(source)).toEqual({
      eligible: true, payoutDate: '2031-01-31', bookingId: null, expectedOccurrenceId: null,
    });
    expect(JSON.stringify(source)).toBe(before);
    expect(source.parsed.draft?.netCents).toBe(297500);
  });

  it('links only the exact whole salary/refund split and preserves every candidate field', () => {
    const source = { ...input(), bookings: [booking()] }, before = JSON.stringify(source);
    expect(planPayslipAutomation(source)).toEqual({
      eligible: true, payoutDate: '2031-01-31', bookingId: 'synthetic-existing-payout', expectedOccurrenceId: null,
    });
    expect(JSON.stringify(source)).toBe(before);
    expect(source.bookings[0]!.splits.map((s) => s.amountCents)).toEqual([287500, 10000]);
  });

  it('uses the unique actual salary expectation when the PDF provides no payout date', () => {
    const document = { ...parsed(), payoutDate: null };
    expect(planPayslipAutomation({ ...input(document), expectations: [expectation()] })).toEqual({
      eligible: true, payoutDate: '2031-01-31', bookingId: null, expectedOccurrenceId: 'synthetic-salary-occurrence',
    });
    expect(planPayslipAutomation(input(document))).toEqual({ eligible: false, reason: 'payout_date_missing' });
  });

  it('preserves an already received expectation only when it names the same exact existing payout', () => {
    expect(planPayslipAutomation({ ...input(), bookings: [booking({ expectedOccurrenceIds: ['synthetic-salary-occurrence'] })],
      expectations: [expectation({ status: 'received', bookingId: 'synthetic-existing-payout' })] })).toEqual({
      eligible: true, payoutDate: '2031-01-31', bookingId: 'synthetic-existing-payout', expectedOccurrenceId: null,
    });
    expect(planPayslipAutomation({ ...input(), bookings: [booking()],
      expectations: [expectation({ status: 'received', bookingId: 'another-payout' })] }))
      .toEqual({ eligible: false, reason: 'expectation_already_linked' });
  });

  it.each([[1, 297499], [-1, 297501]] as const)(
    'preserves the existing signed %i-cent rounding correction for literal net %i', (differenceCents, netCents) => {
      const document = parsed();
      document.differenceCents = differenceCents;
      document.draft = { ...document.draft!, netCents };
      expect(planPayslipAutomation(input(document))).toEqual({
        eligible: true, payoutDate: '2031-01-31', bookingId: null, expectedOccurrenceId: null,
      });
      expect(document.draft.netCents).toBe(netCents);
      expect(document.draft.lines).toHaveLength(2);
    },
  );

  it('does not turn a special payout into regular salary', () => {
    const document = parsed();
    document.documentType = 'bonus';
    document.draft = { ...document.draft!, kind: 'special', specialType: 'salary13' };
    const special = { ...input(document), salaryIncomeTypeId: 'income-special' };
    expect(planPayslipAutomation({ ...special, bookings: [booking()] }))
      .toEqual({ eligible: false, reason: 'booking_needs_review' });
    expect(planPayslipAutomation({ ...special, bookings: [booking({ splits: [
      { amountCents: 287500, incomeTypeId: 'income-special', categoryId: null, contactId: null, transferId: null },
      { amountCents: 10000, incomeTypeId: 'income-refund', categoryId: null, contactId: null, transferId: null },
    ] })] })).toEqual({ eligible: true, payoutDate: '2031-01-31',
      bookingId: 'synthetic-existing-payout', expectedOccurrenceId: null });
  });

  it('refuses incomplete, warned, non-current or unreconciled parser evidence', () => {
    const documents: ParsedPayrollDocument[] = [
      { ...parsed(), draft: null },
      { ...parsed(), documentType: 'pension' },
      { ...parsed(), periodSource: 'filename' },
      { ...parsed(), parserVersion: PAYSLIP_PARSER_VERSION + 1 },
      { ...parsed(), warnings: ['synthetic ambiguous line'] },
      { ...parsed(), unmappedWageTypes: [{ code: '999', label: 'Synthetic unknown', amountCents: 100 }] },
      { ...parsed(), differenceCents: null },
      { ...parsed(), differenceCents: 2 },
      { ...parsed(), draft: { ...parsed().draft!, netCents: 297499 } },
    ];
    for (const document of documents)
      expect(planPayslipAutomation(input(document))).toEqual({ eligible: false, reason: 'document_needs_review' });
  });

  it.each(['2031-02-30', '2031-1-31', '2029-12-31'])(
    'does not invent or normalize an unsafe payout date %s', (payoutDate) => {
      expect(planPayslipAutomation(input({ ...parsed(), payoutDate })))
        .toEqual({ eligible: false, reason: 'payout_date_missing' });
    },
  );

  it('refuses multiple salary expectations instead of choosing by proximity', () => {
    expect(planPayslipAutomation({ ...input(), expectations: [expectation(), expectation({ occurrenceId: 'second' })] }))
      .toEqual({ eligible: false, reason: 'expectation_ambiguous' });
  });

  it.each([
    { payeeId: null }, { currency: 'USD' }, { amountCents: 297499 },
    { contactId: 'synthetic-contact' }, { status: 'skipped' },
  ])('does not promote an incompatible expectation to automatic proof: %j', (patch) => {
    expect(planPayslipAutomation({ ...input(), expectations: [expectation(patch)] }))
      .toEqual({ eligible: false, reason: 'expectation_needs_review' });
  });

  it('keeps a conflicting printed and scheduled payout date for review', () => {
    expect(planPayslipAutomation({ ...input(), expectations: [expectation({ dueDate: '2031-01-30' })] }))
      .toEqual({ eligible: false, reason: 'expectation_date_conflict' });
  });

  it('does not create alongside several plausible incoming movements', () => {
    expect(planPayslipAutomation({ ...input(), bookings: [booking(), booking({ id: 'second' })] }))
      .toEqual({ eligible: false, reason: 'booking_ambiguous' });
  });

  it.each([
    { payeeId: null }, { payeeId: 'another-employer' }, { currency: 'USD' },
    { date: '2031-01-30' }, { amountCents: 297400 }, { transferId: 'synthetic-transfer' },
    { alreadyCaptured: true }, { expectedOccurrenceIds: ['another-occurrence'] },
  ])('retains a plausible incoming booking as a blocker, never a new payout: %j', (patch) => {
    expect(planPayslipAutomation({ ...input(), bookings: [booking(patch)] }))
      .toEqual({ eligible: false, reason: 'booking_needs_review' });
  });

  it('requires the complete literal split semantics even when the incoming total matches', () => {
    const valid = booking().splits;
    const splits: PayrollAutomaticBooking['splits'][] = [
      [],
      [{ ...valid[0]!, amountCents: 297500 }],
      [{ ...valid[0]!, categoryId: 'expense-category' }, valid[1]!],
      [{ ...valid[0]!, contactId: 'synthetic-contact' }, valid[1]!],
      [{ ...valid[0]!, transferId: 'synthetic-transfer' }, valid[1]!],
      [{ ...valid[0]!, incomeTypeId: 'income-special' }, valid[1]!],
      [{ ...valid[0]!, amountCents: 287499 }, valid[1]!],
      [valid[0]!, { ...valid[1]!, incomeTypeId: null }],
    ];
    for (const rows of splits)
      expect(planPayslipAutomation({ ...input(), bookings: [booking({ splits: rows })] }))
        .toEqual({ eligible: false, reason: 'booking_needs_review' });
  });
});

describe('persisted payroll identity without financial rewrites', () => {
  it('compares the actual month/kind/special identity rather than PDF bytes or IDs', () => {
    const source = parsed().draft!;
    expect(sameAutomaticPayrollSlot(source, source)).toBe(true);
    expect(sameAutomaticPayrollSlot(source, { ...source, month: '2031-02' })).toBe(false);
    expect(sameAutomaticPayrollSlot(source, { ...source, kind: 'special', specialType: 'salary13' })).toBe(false);
    const other = { ...source, kind: 'special' as const, specialType: 'other' as const };
    expect(sameAutomaticPayrollSlot(other, { ...other, grossCents: 400001 })).toBe(false);
  });

  it('permits source attachment only for identical financial fields and ordered lines', () => {
    const source = parsed().draft!;
    expect(sameAutomaticPayrollRecord(source, { ...source, bookingId: 'persisted-booking', receiptId: 'persisted-receipt' })).toBe(true);
    expect(sameAutomaticPayrollRecord(source, { ...source, netCents: 297499 })).toBe(false);
    expect(sameAutomaticPayrollRecord(source, { ...source, lines: [...source.lines].reverse() })).toBe(false);
    expect(sameAutomaticPayrollRecord(source, { ...source,
      lines: source.lines.map((line) => ({ ...line, label: 'Changed label' })) })).toBe(false);
  });
});
