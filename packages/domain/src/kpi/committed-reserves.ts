import { cents } from '../money/cents';
import { emergencyTargetCents } from './ratios';

/** Committed reserves, with reserve accounts covering the emergency target first. */
export interface CommittedReservesInput {
  futureEnvelopeAvailableCents: ReadonlyArray<number>;
  reserveAccounts: ReadonlyArray<{ balanceCents: number; onBudget: boolean }>;
  emergency: { averageNeedCents: number; targetMonths: number };
}

export interface CommittedReserves {
  futureEnvelopesCents: number;
  reserveAccountsCents: number;
  emergencyTargetCents: number;
  targetShortfallCents: number;
  nettedOverlapCents: number;
  committedCents: number;
}

export function committedReserves(input: CommittedReservesInput): CommittedReserves {
  input.futureEnvelopeAvailableCents.forEach(cents);
  input.reserveAccounts.forEach((a) => cents(a.balanceCents));
  cents(input.emergency.averageNeedCents);
  cents(input.emergency.targetMonths);
  const futureEnvelopesCents = cents(
    input.futureEnvelopeAvailableCents.reduce((s, v) => s + Math.max(0, v), 0),
  );
  const reserveOn = cents(
    input.reserveAccounts
      .filter((a) => a.onBudget)
      .reduce((s, a) => s + Math.max(0, a.balanceCents), 0),
  );
  const reserveOff = cents(
    input.reserveAccounts
      .filter((a) => !a.onBudget)
      .reduce((s, a) => s + Math.max(0, a.balanceCents), 0),
  );
  const reserveAccountsCents = cents(reserveOn + reserveOff);
  const target = emergencyTargetCents(input.emergency);
  const targetShortfallCents = Math.max(0, target - reserveAccountsCents);
  const surplusOn = Math.max(0, reserveOn - Math.max(0, target - reserveOff));
  const nettedOverlapCents = Math.min(futureEnvelopesCents, surplusOn);
  return {
    futureEnvelopesCents,
    reserveAccountsCents,
    emergencyTargetCents: target,
    targetShortfallCents,
    nettedOverlapCents,
    committedCents: cents(
      reserveAccountsCents + targetShortfallCents + (futureEnvelopesCents - nettedOverlapCents),
    ),
  };
}
