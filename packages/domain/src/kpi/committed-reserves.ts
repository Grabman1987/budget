/**
 * Committed reserves ("gebundene Rücklagen", SPEC "Financial terms"): money that is spoken for and
 * must not be spent or invested. Owner decision 2026-11-17: available in future-class (Zukunft)
 * envelopes + balances of accounts with role reserve + the emergency target (rule R02). The sweep
 * buffer is not part of it. Integer cents; a negative envelope or account balance commits nothing.
 */
export interface CommittedReservesInput {
  /** Available cents of each envelope of class future (current month, carry included). */
  futureEnvelopeAvailableCents: ReadonlyArray<number>;
  /** Balance of each account with role reserve. */
  reserveAccountCents: ReadonlyArray<number>;
  /** Emergency target of R02 (months of need spending x the agreed months); 0 when no rule. */
  emergencyTargetCents: number;
}

export interface CommittedReserves {
  futureEnvelopesCents: number;
  reserveAccountsCents: number;
  emergencyTargetCents: number;
  committedCents: number;
}

const positiveSum = (xs: ReadonlyArray<number>): number =>
  xs.reduce((a, v) => a + Math.max(0, v), 0);

export function committedReserves(input: CommittedReservesInput): CommittedReserves {
  const futureEnvelopesCents = positiveSum(input.futureEnvelopeAvailableCents);
  const reserveAccountsCents = positiveSum(input.reserveAccountCents);
  const emergencyTargetCents = Math.max(0, input.emergencyTargetCents);
  return {
    futureEnvelopesCents,
    reserveAccountsCents,
    emergencyTargetCents,
    committedCents: futureEnvelopesCents + reserveAccountsCents + emergencyTargetCents,
  };
}
