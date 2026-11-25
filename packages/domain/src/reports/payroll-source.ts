import { roundDivCents } from '../wealth/int';
import { payslipComponents } from '../salary/series';
import type { SalaryPayslip, WageComponentRule } from '../salary/types';
import { payrollTotals, type PayslipCompositionFact } from './payroll-projects';

/** An unsplit receipt can include expenses; explicit expense parts must also reconcile. */
export function payrollPayoutDifference(
  captured: Pick<ReturnType<typeof payrollTotals>, 'netCents' | 'salaryNetCents'>,
  bank: {
    payoutCents: number;
    salaryCents: number;
    completePayout: boolean;
    hasRefundParts: boolean;
  },
) {
  if (bank.completePayout) {
    const payoutDifference = bank.payoutCents - captured.netCents;
    if (payoutDifference !== 0 || !bank.hasRefundParts) return payoutDifference;
  }
  return bank.salaryCents - captured.salaryNetCents;
}

/** Source facts only. Shared charges never imply a proportional net allocation. */
export function payrollSource(slip: SalaryPayslip, rules: readonly WageComponentRule[]) {
  const parts = payslipComponents(slip, rules);
  const totals = payrollTotals([slip]);
  const compensationParts = [parts.paid.base, parts.paid.special, parts.paid.variable].filter(
    (value) => value !== 0,
  );
  const split = slip.wage?.split ?? null;
  const netSplitUnknown =
    slip.wage !== null &&
    (parts.issues.length > 0 ||
      compensationParts.length > 1 ||
      (slip.kind === 'regular' && (parts.paid.special !== 0 || parts.paid.variable !== 0)) ||
      parts.backPay.length > 0 ||
      (slip.kind === 'regular' &&
        split !== null &&
        (split.svSpecialCents !== 0 || split.taxOtherCents !== 0)));
  return {
    id: slip.id,
    ...parts,
    netSplitUnknown,
    statutorySplit: split,
    sharedDeductions: {
      svCents: totals.svCents,
      taxCents: totals.taxCents,
      otherCents: totals.otherCents,
    },
    originalLines: slip.wage?.lines ?? [],
  };
}

/** Slips taken into the trailing running gross of one slip (same employer, earlier months). */
const TRAILING_SLIPS = 6;

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : roundDivCents(sorted[mid - 1]! + sorted[mid]!, 2);
};

/**
 * Composition facts per payslip with a wage reading (#1321). `specialGrossCents` is the gross of the
 * lines the owner mapped to the special component. `openMappingTask` marks a regular slip with
 * unmapped earning lines whose gross is above the median gross of the same employer's previous
 * regular slips (up to six): the combined month is then surfaced in the unknown-wage-type path.
 * Without an earlier slip there is no baseline and nothing is flagged; nothing is classified.
 */
export function payrollCompositionFacts(
  slips: readonly SalaryPayslip[],
  rules: readonly WageComponentRule[],
): Map<string, PayslipCompositionFact> {
  const facts = new Map<string, PayslipCompositionFact>();
  for (const slip of slips) {
    if (!slip.wage || slip.wage.lines.length === 0) continue;
    const parts = payslipComponents(slip, rules);
    const hasUnmappedEarning = parts.unmapped.some((u) => u.reason === 'unmapped');
    const trailing = slips
      .filter(
        (p) =>
          p.kind === 'regular' &&
          p.month < slip.month &&
          p.employerContactId === slip.employerContactId,
      )
      .sort((a, b) => (a.month < b.month ? 1 : -1))
      .slice(0, TRAILING_SLIPS)
      .map((p) => payrollTotals([p]).grossCents);
    facts.set(slip.id, {
      specialGrossCents: parts.paid.special,
      openMappingTask:
        slip.kind === 'regular' &&
        hasUnmappedEarning &&
        trailing.length > 0 &&
        payrollTotals([slip]).grossCents > median(trailing),
    });
  }
  return facts;
}
