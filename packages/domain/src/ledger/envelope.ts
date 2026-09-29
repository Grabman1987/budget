export interface EnvelopeInput {
  /** Available amount carried in from the previous month. */
  carryCents: number;
  assignedCents: number;
  /** Signed sum of the splits of the month: spending is negative. */
  activityCents: number;
}

export interface EnvelopeMonth extends EnvelopeInput {
  availableCents: number;
  /** Amount that must be covered (triage); 0 when the envelope is not overspent. */
  overspentCents: number;
}

/** One envelope month: available = carry + assigned + activity. Overspending stays visible. */
export function envelopeMonth(input: EnvelopeInput): EnvelopeMonth {
  const availableCents = input.carryCents + input.assignedCents + input.activityCents;
  return { ...input, availableCents, overspentCents: Math.max(0, -availableCents) };
}

/** A chain of months of one envelope (ascending); the available amount rolls over. */
export function envelopeSeries(
  months: ReadonlyArray<{ month: string; assignedCents: number; activityCents: number }>,
  openingCarryCents = 0,
): Array<EnvelopeMonth & { month: string }> {
  const out: Array<EnvelopeMonth & { month: string }> = [];
  let carry = openingCarryCents;
  for (const m of months) {
    const e = envelopeMonth({
      carryCents: carry,
      assignedCents: m.assignedCents,
      activityCents: m.activityCents,
    });
    out.push({ month: m.month, ...e });
    carry = e.availableCents;
  }
  return out;
}

/** "Zu verteilen": what is left to assign. The target is 0. */
export function toBeAssigned(input: {
  carryCents: number;
  incomeCents: number;
  assignedCents: number;
}): number {
  return input.carryCents + input.incomeCents - input.assignedCents;
}
