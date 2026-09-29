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

/**
 * A chain of months of one envelope (ascending). The carry is `max(0, available)` of the previous
 * month (concept §5.3): overspending is not carried but reduces the next month's "Zu verteilen"
 * (see `budgetMonths`). With `rolloverOverspending` the negative amount is carried instead.
 */
export function envelopeSeries(
  months: ReadonlyArray<{ month: string; assignedCents: number; activityCents: number }>,
  openingCarryCents = 0,
  options: { rolloverOverspending?: boolean } = {},
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
    carry = options.rolloverOverspending ? e.availableCents : Math.max(0, e.availableCents);
  }
  return out;
}
