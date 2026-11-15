export const ACCOUNT_PURPOSES = ['cash', 'salary', 'settlement', 'investment', 'other'] as const;
export type AccountPurpose = (typeof ACCOUNT_PURPOSES)[number];

/** Presentation metadata only: never changes account type, role or budget membership. */
export function accountPurpose(
  account: { type: string; role?: string | undefined; purpose?: AccountPurpose | null | undefined },
  context: { salary?: boolean; settlement?: boolean } = {},
): AccountPurpose {
  if (account.purpose) return account.purpose;
  if (account.type === 'cash') return 'cash';
  if (context.salary) return 'salary';
  if (context.settlement) return 'settlement';
  if (
    ['savings', 'brokerage', 'crypto', 'p2p'].includes(account.type) ||
    account.role === 'investment'
  )
    return 'investment';
  return 'other';
}

/** Credit cards and loans retain their separate credit terms. */
export function purposeHasOverdraft(type: string, purpose: AccountPurpose): boolean {
  return type !== 'credit_card' && type !== 'loan' && purpose !== 'cash';
}
