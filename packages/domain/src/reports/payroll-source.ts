import { payslipComponents } from '../salary/series';
import type { SalaryPayslip, WageComponentRule } from '../salary/types';
import { payrollTotals } from './payroll-projects';

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
