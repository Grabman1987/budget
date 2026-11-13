import {
  normalizeWageLabel,
  type SalaryComponent,
  type SalaryPayslip,
  type SalaryWageLine,
  type WageComponentRule,
} from './types';

/**
 * Component of one wage line. `none`: not compensation (deductions, statutory corrections, memo
 * and unknown lines; unknown lines that hide an earning surface as a failed line check instead).
 * `unmapped`: compensation the owner has not assigned yet; never guessed.
 *
 * Order: built-in rules for unambiguous cases first (reimbursement section; 13th/14th salary
 * payslip; bonus payroll document), then the most specific owner mapping (employer before every
 * employer, code and label before code before label), then the parser's benefit-in-kind section.
 */
export type LineComponent = SalaryComponent | 'unmapped' | 'none';

export function classifyWageLine(
  line: SalaryWageLine,
  slip: Pick<SalaryPayslip, 'kind' | 'specialType' | 'documentType' | 'employerContactId'>,
  rules: readonly WageComponentRule[],
): LineComponent {
  if (line.section === 'reimbursement') return 'reimbursement';
  if (line.section !== 'earning' && line.section !== 'benefit_in_kind') return 'none';
  if (
    slip.kind === 'special' &&
    (slip.specialType === 'salary13' || slip.specialType === 'salary14')
  )
    return 'special';
  if (slip.documentType === 'bonus') return 'variable';
  const owner = ownerRule(line, slip.employerContactId, rules);
  if (owner) return owner.component;
  if (line.section === 'benefit_in_kind') return 'benefit_in_kind';
  return 'unmapped';
}

function ownerRule(
  line: SalaryWageLine,
  employer: string | null,
  rules: readonly WageComponentRule[],
): WageComponentRule | undefined {
  const label = normalizeWageLabel(line.label);
  let best: WageComponentRule | undefined,
    bestScore = -1;
  for (const rule of rules) {
    if (rule.employerContactId !== null && rule.employerContactId !== employer) continue;
    if (rule.wageCode !== null && rule.wageCode !== line.code) continue;
    if (rule.labelNorm !== null && rule.labelNorm !== label) continue;
    if (rule.wageCode === null && rule.labelNorm === null) continue;
    const score =
      (rule.employerContactId !== null ? 4 : 0) +
      (rule.wageCode !== null ? 2 : 0) +
      (rule.labelNorm !== null ? 1 : 0);
    if (score > bestScore) {
      best = rule;
      bestScore = score;
    }
  }
  return best;
}
