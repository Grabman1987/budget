import { monthsBetween } from '../date';
import { z } from 'zod';

const money = z.number().int().min(0).max(100_000_000_000);
const signedMoney = z.number().int().min(-100_000_000_000).max(100_000_000_000);
const ref = z.string().min(1).max(64).nullable();
export const payslipInput = z
  .object({
    month: z.string().regex(/^(20\d{2})-(0[1-9]|1[0-2])$/),
    kind: z.enum(['regular', 'special']),
    specialType: z.enum(['salary13', 'salary14', 'other']).nullable(),
    grossCents: money,
    svCents: signedMoney,
    taxCents: signedMoney,
    netCents: money,
    bookingId: ref,
    receiptId: ref,
    lines: z
      .array(
        z.strictObject({
          section: z.enum(['earning', 'deduction', 'reimbursement']),
          label: z.string().trim().min(1).max(160),
          amountCents: money,
        }),
      )
      .max(40),
  })
  .superRefine((value, ctx) => {
    if ((value.kind === 'regular') !== (value.specialType === null))
      ctx.addIssue({
        code: 'custom',
        path: ['specialType'],
        message: 'Art der Sonderzahlung prüfen.',
      });
    if (payrollTotals([value]).calculatedNetCents !== value.netCents)
      ctx.addIssue({
        code: 'custom',
        path: ['netCents'],
        message:
          'Brutto + Bezüge − SV − Lohnsteuer − sonstige Abzüge + Erstattungen muss der Auszahlung entsprechen.',
      });
  });
export type PayslipInput = z.infer<typeof payslipInput>;
export type CapturedPayslip = PayslipInput & { id: string };

type PayslipPosition = Pick<PayslipInput, 'month' | 'kind' | 'specialType'> & { id?: string };
/** The existing model represents other payments as special/other; multiple are allowed. */
export function isDuplicatePayslip(slips: PayslipPosition[], candidate: PayslipPosition) {
  return (
    candidate.specialType !== 'other' &&
    slips.some(
      (p) =>
        (candidate.id === undefined || p.id !== candidate.id) &&
        p.month === candidate.month &&
        p.kind === candidate.kind &&
        p.specialType === candidate.specialType,
    )
  );
}

/** Additional earnings are gross salary; reimbursements are separate. Negative SV/tax means a refund. */
export function payrollTotals(slips: PayslipInput[]) {
  const sum = (read: (p: PayslipInput) => number) => slips.reduce((n, p) => n + read(p), 0);
  const additionsCents = sum((p) =>
    p.lines.filter((l) => l.section === 'earning').reduce((n, l) => n + l.amountCents, 0),
  );
  const otherCents = sum((p) =>
    p.lines.filter((l) => l.section === 'deduction').reduce((n, l) => n + l.amountCents, 0),
  );
  const reimbursementsCents = sum((p) =>
    p.lines.filter((l) => l.section === 'reimbursement').reduce((n, l) => n + l.amountCents, 0),
  );
  const grossCents = sum((p) => p.grossCents) + additionsCents;
  const svCents = sum((p) => p.svCents),
    taxCents = sum((p) => p.taxCents),
    netCents = sum((p) => p.netCents);
  const deductionsCents = svCents + taxCents + otherCents;
  const salaryNetCents = grossCents - deductionsCents;
  // Ratios retain their sign for corrections; no gross denominator means unavailable.
  const ratio = (n: number) => (grossCents === 0 ? null : n / grossCents);
  return {
    grossCents,
    additionsCents,
    svCents,
    taxCents,
    otherCents,
    deductionsCents,
    reimbursementsCents,
    salaryNetCents,
    taxChargeCents: sum((p) => Math.max(0, p.taxCents)),
    taxRefundCents: sum((p) => Math.max(0, -p.taxCents)),
    netCents,
    calculatedNetCents: salaryNetCents + reimbursementsCents,
    deductionRatio: ratio(deductionsCents),
    svRatio: ratio(svCents),
    taxRatio: ratio(taxCents),
    otherRatio: ratio(otherCents),
  };
}

/** Recorded amounts only: no extrapolation to fourteen payments or invented missing months. */
export function payrollReport(slips: CapturedPayslip[], month: string) {
  const selected = slips.filter((p) => p.month === month);
  const year = month.slice(0, 4);
  const years = [...new Set(slips.map((p) => p.month.slice(0, 4)))].sort().map((y) => {
    const current = slips.filter((p) => p.month.startsWith(y));
    const previous = slips.filter((p) => p.month.startsWith(String(Number(y) - 1)));
    const keys = new Set(
      current.map((p) => `${p.month.slice(5)}:${p.kind}:${p.specialType ?? ''}`),
    );
    const prior = previous.filter((p) =>
      keys.has(`${p.month.slice(5)}:${p.kind}:${p.specialType ?? ''}`),
    );
    const covered =
      current.length > 0 &&
      [...keys].every((key) =>
        prior.some((p) => `${p.month.slice(5)}:${p.kind}:${p.specialType ?? ''}` === key),
      );
    const totals = payrollTotals(current),
      baseline = covered ? payrollTotals(prior).grossCents : null;
    return {
      year: y,
      months: new Set(current.map((p) => p.month)).size,
      ...totals,
      specialGrossCents: payrollTotals(current.filter((p) => p.kind === 'special')).grossCents,
      changeCents: baseline === null ? null : totals.grossCents - baseline,
      changeRatio: baseline ? (totals.grossCents - baseline) / baseline : null,
    };
  });
  const salaries = Array.from({ length: 14 }, (_, i) => {
    const matched = slips.filter(
      (p) =>
        p.month.startsWith(year) &&
        (i < 12
          ? p.kind === 'regular' && Number(p.month.slice(5)) === i + 1
          : p.specialType === (i === 12 ? 'salary13' : 'salary14')),
    );
    return {
      position: i + 1,
      netCents: matched.length ? payrollTotals(matched).netCents : null,
      salaryNetCents: matched.length ? payrollTotals(matched).salaryNetCents : null,
      reimbursementsCents: matched.length ? payrollTotals(matched).reimbursementsCents : null,
      ids: matched.map((p) => p.id),
    };
  });
  const recordedMonths = slips.map((p) => p.month).sort();
  const months = recordedMonths.length
    ? monthsBetween(recordedMonths[0]!, recordedMonths.at(-1)!)
    : [];
  const monthlyPayouts = Array.from({ length: 12 }, (_, i) => ({
    month: String(i + 1).padStart(2, '0'),
    years: years.map((y) => {
      const matching = slips.filter(
        (p) => p.month === `${y.year}-${String(i + 1).padStart(2, '0')}`,
      );
      return { year: y.year, netCents: matching.length ? payrollTotals(matching).netCents : null };
    }),
  }));
  return {
    monthlyPayouts,
    month: payrollTotals(selected),
    slips: selected,
    years,
    salaries,
    otherSpecialCents: payrollTotals(
      slips.filter((p) => p.month.startsWith(year) && p.specialType === 'other'),
    ).netCents,
    timeline: months.map((m) => ({
      month: m,
      ...payrollTotals(slips.filter((p) => p.month === m && p.kind === 'regular')),
      recorded: slips.some((p) => p.month === m && p.kind === 'regular'),
    })),
  };
}

export interface ProjectFact {
  month: string;
  amountCents: number;
  kind: 'income' | 'cost';
  bookingId: string;
}
export function projectResult(facts: ProjectFact[], months: string[]) {
  const selected = facts.filter((f) => months.includes(f.month));
  const incomeCents = selected
    .filter((f) => f.kind === 'income')
    .reduce((n, f) => n + f.amountCents, 0);
  const costCents = -selected
    .filter((f) => f.kind === 'cost')
    .reduce((n, f) => n + f.amountCents, 0);
  return {
    incomeCents,
    costCents,
    resultCents: incomeCents - costCents,
    perMonth: months.map((m) =>
      selected.filter((f) => f.month === m).reduce((n, f) => n + f.amountCents, 0),
    ),
    bookingIds: [...new Set(selected.map((f) => f.bookingId))],
  };
}
