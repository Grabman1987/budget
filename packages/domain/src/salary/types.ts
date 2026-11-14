import type { CapturedPayslip } from '../reports/payroll-projects';
import type { StatutorySplit, WageLineSection } from '../reports/payslip-text';

/**
 * Salary development (#1066). Five components per payslip month; only base, special and variable
 * form the development figure. Benefits in kind and reimbursements are reported beside it and
 * never move a development figure.
 */
export const SALARY_COMPONENTS = [
  'base',
  'special',
  'variable',
  'benefit_in_kind',
  'reimbursement',
] as const;
export type SalaryComponent = (typeof SALARY_COMPONENTS)[number];
/** The components that make up the development figure. */
export const DEVELOPMENT_COMPONENTS = ['base', 'special', 'variable'] as const;
export type ComponentCents = Record<SalaryComponent, number>;

export const zeroComponents = (): ComponentCents => ({
  base: 0,
  special: 0,
  variable: 0,
  benefit_in_kind: 0,
  reimbursement: 0,
});
export const developmentOf = (c: ComponentCents) => c.base + c.special + c.variable;

/** One stored wage line as the salary module needs it. */
export interface SalaryWageLine {
  code: string | null;
  label: string;
  section: WageLineSection;
  /** Month the line is paid for when printed (back pay); null otherwise. */
  referenceMonth: string | null;
  amountCents: number;
}
/** A payslip with its legacy fields and, when it was read, its wage lines. */
export interface SalaryPayslip extends CapturedPayslip {
  /** Employer contact, resolved through merges (#871) by the reader. */
  employerContactId: string | null;
  /** The wage reading (#1066); null when the payslip has none. */
  wage: {
    lineCheck: 'ok' | 'gross_mismatch' | 'no_gross';
    split: StatutorySplit | null;
    lines: SalaryWageLine[];
  } | null;
}
/** Owner mapping wage type → component (`label_norm` via `normalizeWageLabel`). */
export interface WageComponentRule {
  employerContactId: string | null;
  wageCode: string | null;
  labelNorm: string | null;
  component: SalaryComponent;
  /** Tie-break between equally specific rules: the newest wins, then the smallest id. */
  updatedAt?: string | null;
  id?: string | null;
}

/** Normalised wage label for owner mappings: NFKC, lowercase, no leading `*`, single blanks. */
export const normalizeWageLabel = (label: string) =>
  label
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\*+\s*/, '');
