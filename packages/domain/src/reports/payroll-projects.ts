import { monthsBetween } from '../date';
import { roundDivCents } from '../wealth/int';
import { z } from 'zod';
import { isSalaryAllowanceLabel } from './wage-label-rules';

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
          section: z.enum([
            'earning',
            'deduction',
            'reimbursement',
            'tax_adjustment',
            'sv_adjustment',
          ]),
          label: z.string().trim().min(1).max(160),
          amountCents: signedMoney,
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
  const svCents = sum(
      (p) =>
        p.svCents +
        p.lines.filter((l) => l.section === 'sv_adjustment').reduce((n, l) => n + l.amountCents, 0),
    ),
    taxCents = sum(
      (p) =>
        p.taxCents +
        p.lines
          .filter((l) => l.section === 'tax_adjustment')
          .reduce((n, l) => n + l.amountCents, 0),
    ),
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
    taxChargeCents: sum(
      (p) =>
        Math.max(0, p.taxCents) +
        p.lines
          .filter((l) => l.section === 'tax_adjustment')
          .reduce((n, l) => n + Math.max(0, l.amountCents), 0),
    ),
    taxRefundCents: sum(
      (p) =>
        Math.max(0, -p.taxCents) +
        p.lines
          .filter((l) => l.section === 'tax_adjustment')
          .reduce((n, l) => n + Math.max(0, -l.amountCents), 0),
    ),
    netCents,
    calculatedNetCents: salaryNetCents + reimbursementsCents,
    deductionRatio: ratio(deductionsCents),
    svRatio: ratio(svCents),
    taxRatio: ratio(taxCents),
    otherRatio: ratio(otherCents),
  };
}

/** Salary allowances (Telearbeit, Fahrgeld) of one slip; they are remuneration, travel expenses are not. */
export function salaryAllowanceCents(slip: PayslipInput) {
  return slip.lines
    .filter((l) => l.section === 'reimbursement' && isSalaryAllowanceLabel(l.label))
    .reduce((n, l) => n + l.amountCents, 0);
}

/** Net pay of one slip counting allowances (Telearbeit, Fahrgeld) as salary; travel expenses stay out. */
export function payslipPayNetCents(slip: PayslipInput) {
  return payrollTotals([slip]).salaryNetCents + salaryAllowanceCents(slip);
}

/**
 * Read-only wage facts of one payslip for the month composition (#1321), derived from its wage
 * lines and the owner mappings (`payrollCompositionFacts`). Never changes a net or tax figure.
 */
export interface PayslipCompositionFact {
  /** Gross of the earning lines mapped to the special component. */
  specialGrossCents: number;
  /** False while the reading has issues (unmapped lines, failed line check): the figure is partial. */
  complete: boolean;
  /** A regular slip with unmapped earning lines whose gross is above the trailing running gross. */
  openMappingTask: boolean;
}

/**
 * The ONE derivation of a slip's special gross (composition and year rows): mapped special lines
 * when the slip has a wage reading, else the whole gross of a separate special slip, else 0.
 * `null`: unknown (reading with issues) for the year totals; `cents` keeps the mapped part.
 */
function slipSpecialGross(
  p: CapturedPayslip,
  fact: PayslipCompositionFact | undefined,
  legacy: ReadonlyMap<string, number | null>,
): { cents: number; complete: boolean } {
  if (fact) return { cents: fact.specialGrossCents, complete: fact.complete };
  if (legacy.has(p.id))
    return { cents: legacy.get(p.id) ?? 0, complete: legacy.get(p.id) !== null };
  return { cents: p.kind === 'special' ? payrollTotals([p]).grossCents : 0, complete: true };
}

/**
 * Per month: pay of the running slips, pay of separately captured special-payment slips and the
 * monthly total (both added). A combined slip is never split: its whole pay is carried in its month
 * (owner decision 2026-11-17). Tax is never re-allocated between the parts. A combined month is
 * only marked: `containsSpecial` (a special slip or lines mapped to the special component) and the
 * mapped `specialGrossCents` (null when none is mapped); `openMappingSlipIds` lists regular slips
 * whose unmapped earning lines may hide a special payment (nothing is guessed).
 */
export function payrollNetComposition(
  slips: CapturedPayslip[],
  month: string,
  facts: ReadonlyMap<string, PayslipCompositionFact> = new Map(),
) {
  const inMonth = slips.filter((p) => p.month === month);
  const regular = inMonth.filter((p) => p.kind === 'regular');
  const special = inMonth.filter((p) => p.kind === 'special');
  const sum = (list: CapturedPayslip[]) => list.reduce((n, p) => n + payslipPayNetCents(p), 0);
  const specialGross = inMonth
    .map((p) => slipSpecialGross(p, facts.get(p.id), new Map()).cents)
    .filter((value) => value > 0);
  return {
    month,
    recorded: inMonth.length > 0,
    runningCents: regular.length ? sum(regular) : null,
    specialCents: special.length ? sum(special) : 0,
    totalCents: inMonth.length ? sum(inMonth) : null,
    specialSlipIds: special.map((p) => p.id),
    containsSpecial: special.length > 0 || specialGross.length > 0,
    specialGrossCents: specialGross.length ? specialGross.reduce((n, v) => n + v, 0) : null,
    openMappingSlipIds: regular.filter((p) => facts.get(p.id)?.openMappingTask).map((p) => p.id),
  };
}

/**
 * Average of the running net pay over the recorded months without a special payment. Months with
 * `containsSpecial` are excluded and counted, so a label can say so (never a doubled running pay).
 */
export function runningNetAverage(
  rows: readonly Pick<
    ReturnType<typeof payrollNetComposition>,
    'recorded' | 'runningCents' | 'containsSpecial' | 'openMappingSlipIds'
  >[],
) {
  const unclear = (r: (typeof rows)[number]) => r.openMappingSlipIds.length > 0;
  const used = rows.filter(
    (r) => r.recorded && r.runningCents !== null && !r.containsSpecial && !unclear(r),
  );
  return {
    averageCents: used.length
      ? roundDivCents(
          used.reduce((n, r) => n + (r.runningCents ?? 0), 0),
          used.length,
        )
      : null,
    months: used.length,
    excludedMonths: rows.filter((r) => r.recorded && r.containsSpecial).length,
    /** Months whose unmapped earning lines may hide a special payment (not counted either). */
    openMappingMonths: rows.filter((r) => r.recorded && !r.containsSpecial && unclear(r)).length,
  };
}

/** Recorded amounts only: no extrapolation to fourteen payments or invented missing months. */
export function payrollReport(
  slips: CapturedPayslip[],
  month: string,
  sourceSpecialGross: ReadonlyMap<string, number | null> = new Map(),
  compositionFacts: ReadonlyMap<string, PayslipCompositionFact> = new Map(),
) {
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
    const specialAmounts = current.map((p) => {
      const found = slipSpecialGross(p, compositionFacts.get(p.id), sourceSpecialGross);
      return found.complete ? found.cents : null;
    });
    return {
      year: y,
      months: new Set(current.map((p) => p.month)).size,
      ...totals,
      specialGrossCents: specialAmounts.some((value) => value === null)
        ? null
        : specialAmounts.reduce<number>((sum, value) => sum + (value ?? 0), 0),
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
    // Every month carries all its slips (running and special); nothing is dropped or split.
    timeline: months.map((m) => {
      const inMonth = slips.filter((p) => p.month === m);
      const allowanceCents = inMonth.reduce((n, p) => n + salaryAllowanceCents(p), 0);
      const totals = payrollTotals(inMonth);
      return {
        month: m,
        composition: payrollNetComposition(slips, m, compositionFacts),
        ...totals,
        payGrossCents: totals.grossCents + allowanceCents,
        payNetCents: totals.salaryNetCents + allowanceCents,
        recorded: inMonth.length > 0,
      };
    }),
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
