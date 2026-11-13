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
 * Order: the most specific owner mapping first (employer before every employer, code and label
 * before code before label). Only a line without a mapping falls back to the explicit evidence:
 * the reimbursement section or a payslip explicitly marked as 13th/14th salary. A benefit in kind
 * comes only from an owner mapping (no parser emits a structural benefit-in-kind section today;
 * a line in that section without a mapping is unmapped). Document types and labels decide nothing.
 * Equally specific mappings: the newest `updatedAt` wins, then the smallest `id`, then the
 * component name, so the result never depends on the input order.
 */
export type LineComponent = SalaryComponent | 'unmapped' | 'none';

export function classifyWageLine(
  line: SalaryWageLine,
  slip: Pick<SalaryPayslip, 'kind' | 'specialType' | 'employerContactId'>,
  rules: readonly WageComponentRule[],
): LineComponent {
  if (
    line.section !== 'earning' &&
    line.section !== 'benefit_in_kind' &&
    line.section !== 'reimbursement'
  )
    return 'none';
  const owner = ownerRule(line, slip.employerContactId, rules);
  if (owner) return owner.component;
  if (line.section === 'reimbursement') return 'reimbursement';
  // Checked before any whole-slip fallback: never folded into special pay.
  if (line.section === 'benefit_in_kind') return 'unmapped';
  if (
    slip.kind === 'special' &&
    (slip.specialType === 'salary13' || slip.specialType === 'salary14')
  )
    return 'special';
  return 'unmapped';
}
/** Equal specificity: newest `updatedAt`, then smallest `id`, then component name (stable). */
const wins = (a: WageComponentRule, b: WageComponentRule) => {
  const key = (r: WageComponentRule) => [r.updatedAt ?? '', r.id ?? '', r.component] as const;
  const [au, ai, ac] = key(a),
    [bu, bi, bc] = key(b);
  if (au !== bu) return au > bu;
  if (ai !== bi) return ai !== '' && (bi === '' || ai < bi);
  return ac < bc;
};
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
    if (score > bestScore || (score === bestScore && best && wins(rule, best))) {
      best = rule;
      bestScore = score;
    }
  }
  return best;
}
