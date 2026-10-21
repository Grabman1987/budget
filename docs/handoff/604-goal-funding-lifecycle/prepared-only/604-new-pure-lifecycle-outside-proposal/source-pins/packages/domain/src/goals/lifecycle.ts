/** Proven committed source states, not a new financial calculation. */
export interface GoalLifecyclePoint {
  sequence: number;
  day: string;
  availableCents: number;
  /** A surviving real expense, strictly later than the previous committed state. */
  expenses: readonly { bookingId: string; splitId: string; day: string }[];
}

export interface GoalLifecycle {
  state: 'open' | 'reached' | 'completed';
  reason: 'manual' | 'expense' | null;
  reachedOn: string | null;
  completedOn: string | null;
  evidence: 'proven' | 'unavailable';
}

/** An expense is evaluated before the new state: reaching and spending in one group is not proof. */
export function goalLifecycle(input: {
  startMonth: string;
  asOf: string;
  targetCents: number;
  currentAvailableCents: number;
  manualCompletedOn: string | null;
  points: readonly GoalLifecyclePoint[];
  complete: boolean;
}): GoalLifecycle {
  const baseline: GoalLifecycle = {
    state: input.startMonth <= input.asOf.slice(0, 7) && input.currentAvailableCents >= input.targetCents ? 'reached' : 'open',
    reason: null,
    reachedOn: null,
    completedOn: null,
    evidence: input.complete ? 'proven' : 'unavailable',
  };
  if (input.manualCompletedOn !== null && input.manualCompletedOn <= input.asOf)
    return { ...baseline, state: 'completed', reason: 'manual', completedOn: input.manualCompletedOn };
  if (!input.complete) return baseline;
  let previousSequence = -1;
  for (const point of input.points) {
    if (!Number.isSafeInteger(point.sequence) || !Number.isSafeInteger(point.availableCents) || point.sequence <= previousSequence)
      return { ...baseline, evidence: 'unavailable' };
    previousSequence = point.sequence;
  }
  let reachedOn: string | null = null;
  let completedOn: string | null = null;
  for (const point of input.points) {
    if (point.day < `${input.startMonth}-01` || point.day > input.asOf) continue;
    if (reachedOn !== null) {
      for (const expense of point.expenses) {
        if (expense.day >= reachedOn && expense.day <= input.asOf && (completedOn === null || expense.day < completedOn))
          completedOn = expense.day;
      }
    }
    if (point.availableCents >= input.targetCents && reachedOn === null) reachedOn = point.day;
  }
  if (completedOn !== null)
    return { state: 'completed', reason: 'expense', reachedOn, completedOn, evidence: 'proven' };
  return { ...baseline, state: reachedOn !== null ? 'reached' : baseline.state, reachedOn };
}

export interface GoalAuditLink {
  id: string;
  sequence: number;
  undoOfId: string | null;
}

/** Resolve actual Undo/Redo ancestry. Missing/branched ancestry is not invented history. */
export function activeGoalAuditEntries(entries: readonly GoalAuditLink[]): Set<string> | null {
  const roots = new Map<string, { root: string; enabled: boolean }>();
  const referenced = new Set<string>();
  const active = new Set<string>();
  let last = -1;
  for (const entry of entries) {
    if (!Number.isSafeInteger(entry.sequence) || entry.sequence <= last || roots.has(entry.id)) return null;
    last = entry.sequence;
    if (entry.undoOfId === null) {
      roots.set(entry.id, { root: entry.id, enabled: true });
      active.add(entry.id);
      continue;
    }
    const parent = roots.get(entry.undoOfId);
    if (!parent || referenced.has(entry.undoOfId)) return null;
    referenced.add(entry.undoOfId);
    const enabled = !parent.enabled;
    roots.set(entry.id, { root: parent.root, enabled });
    if (enabled) active.add(parent.root);
    else active.delete(parent.root);
  }
  return active;
}
