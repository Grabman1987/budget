import type { EnvelopeSummary } from './budget-api';

function exact(value: number) {
  if (!Number.isSafeInteger(value))
    throw new RangeError('Plan overview requires safe integer cents');
  return value;
}
const sum = (values: readonly number[]) =>
  values.reduce((total, value) => exact(total + exact(value)), 0);

/** The envelope chain, distinct from summary.carryInCents (prior unassigned money). */
export function monthOverviewAmounts(
  rows: readonly Pick<
    EnvelopeSummary,
    'carryCents' | 'assignedCents' | 'activityCents' | 'availableCents'
  >[],
) {
  return {
    carryCents: sum(rows.map((row) => row.carryCents)),
    assignedCents: sum(rows.map((row) => row.assignedCents)),
    activityCents: sum(rows.map((row) => row.activityCents)),
    availableCents: sum(rows.map((row) => row.availableCents)),
  };
}

/** Existing targetNeed figures only: excess in one envelope never funds another target. */
export function nextMonthPreparation(
  rows: readonly Pick<EnvelopeSummary, 'target' | 'assignedCents' | 'goalCents' | 'needCents'>[],
) {
  const targets = rows.filter((row) => row.target != null);
  for (const row of targets) {
    exact(row.assignedCents);
    if (exact(row.goalCents) < 0 || exact(row.needCents) < 0)
      throw new RangeError('Canonical target goals and needs must be non-negative');
  }
  const goalCents = sum(targets.map((row) => row.goalCents));
  const coveredCents = sum(
    targets.map((row) => Math.min(Math.max(row.assignedCents, 0), row.goalCents)),
  );
  const missingCents = sum(targets.map((row) => row.needCents));
  const excessCents = sum(
    targets.map((row) => Math.max(0, exact(row.assignedCents - row.goalCents))),
  );
  // Floor, so even a one-cent remaining need cannot be presented as 100% prepared.
  const percent =
    goalCents === 0 ? null : Number((BigInt(coveredCents) * 100n) / BigInt(goalCents));
  return {
    targetCount: targets.length,
    goalCents,
    coveredCents,
    missingCents,
    excessCents,
    percent,
  };
}
