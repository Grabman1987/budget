/**
 * Category kinds a Kontoprüfung Ausgleich may carry: plain spending envelopes. Pass-through or
 * non-spending kinds (advance, income, card_payment, debt, invest) would corrupt envelopes,
 * receivables or the card cover.
 */
export const RECONCILE_ADJUST_CATEGORY_KINDS = [
  'fixed',
  'periodic',
  'variable',
  'project',
  'saving',
] as const;

export function isReconcileAdjustCategoryKind(kind: string): boolean {
  return (RECONCILE_ADJUST_CATEGORY_KINDS as readonly string[]).includes(kind);
}
