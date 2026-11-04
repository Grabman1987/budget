import { cents, type payrollTotals } from '@budget/domain';
import type { ReportCalculation } from './report-frame';

/** Use recorded payroll totals, including signed corrections and separate reimbursements. */
export function payrollCalculation(
  total: ReturnType<typeof payrollTotals>,
  label = 'Auszahlung · erfasste Gehaltszettel',
): ReportCalculation {
  return {
    label: 'Brutto zu Auszahlung',
    terms: [
      { label: 'Brutto inkl. Zusätze', value: cents(total.grossCents) },
      {
        op: total.svCents < 0 ? '+' : '-',
        label: total.svCents < 0 ? 'SV-Erstattung' : 'SV-DN',
        value: cents(Math.abs(total.svCents)),
      },
      { op: '-', label: 'Lohnsteuer', value: cents(total.taxChargeCents) },
      ...(total.taxRefundCents > 0
        ? [{ op: '+' as const, label: 'LSt-Erstattung', value: cents(total.taxRefundCents) }]
        : []),
      ...(total.otherCents !== 0
        ? [{ op: '-' as const, label: 'Sonstige Abzüge', value: cents(total.otherCents) }]
        : []),
      ...(total.reimbursementsCents !== 0
        ? [
            {
              op: '+' as const,
              label: 'Steuerfreie Erstattungen',
              value: cents(total.reimbursementsCents),
            },
          ]
        : []),
    ],
    result: { label, value: total.netCents, unit: 'money' },
  };
}
