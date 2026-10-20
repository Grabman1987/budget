export type ManualBankStatus = 'pending' | 'confirmed';

/** Status policy for a newly captured whole cash↔bank transfer; never normalizes old rows. */
export function manualTransferStatus(
  fromType: string,
  toType: string,
  bankStatus: ManualBankStatus = 'pending',
): { cashSide: 'from' | 'to'; fromStatus: ManualBankStatus; toStatus: ManualBankStatus } | null {
  const bank = (type: string) => type === 'checking' || type === 'savings';
  if (fromType === 'cash' && bank(toType)) {
    return { cashSide: 'from', fromStatus: 'confirmed', toStatus: bankStatus };
  }
  if (bank(fromType) && toType === 'cash') {
    return { cashSide: 'to', fromStatus: bankStatus, toStatus: 'confirmed' };
  }
  return null;
}
