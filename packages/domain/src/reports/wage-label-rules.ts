/**
 * The single place that decides which tax-free reimbursement lines are remuneration.
 * Telearbeit, home office and Fahrgeld count as salary in the net salary views (owner decision
 * 2026-11-16); travel expenses stay excluded as pure reimbursement. Both kinds keep the section
 * `reimbursement` on the stored payslip, so no stored figure changes.
 */
const SALARY_ALLOWANCE = /telearbeit|home\s?office|fahrgeld/;
const TRAVEL_EXPENSE = /reisespesen|reisekosten|kilometergeld|taggeld|diaten|dienstreise.*auslagen/;

/** `plain` is a normalized (lower-case, diacritics removed) label. */
export const isReimbursementLabel = (plain: string) =>
  SALARY_ALLOWANCE.test(plain) || TRAVEL_EXPENSE.test(plain);

export const isSalaryAllowanceLabel = (label: string) =>
  SALARY_ALLOWANCE.test(label.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase());
