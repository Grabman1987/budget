/** Pending-inclusive valuation correction; never a booking or confirmed account balance. */
export function bankTransferTransitCents(
  debitDate: string,
  receiptDate: string,
  amountCents: number,
  asOf: string,
): number {
  return (debitDate <= asOf ? amountCents : 0) - (receiptDate <= asOf ? amountCents : 0);
}
