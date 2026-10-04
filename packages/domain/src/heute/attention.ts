/** Reserve the same category's money in due-date order; received/missed payments need no cover. */
export function paymentCoverage<
  T extends {
    dueDate: string;
    categoryId: string | null;
    kind: 'inflow' | 'outflow';
    status: string;
    amountCents: number;
  },
>(
  payments: readonly T[],
  available: Readonly<Record<string, Readonly<Record<string, number>>>>,
): Array<T & { covered: boolean | null }> {
  const remaining = new Map<string, number>();
  return [...payments]
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .map((payment) => {
      if (payment.kind !== 'outflow' || !['expected', 'deviating'].includes(payment.status))
        return { ...payment, covered: null };
      const month = payment.dueDate.slice(0, 7);
      const key = `${month}:${payment.categoryId}`;
      const balance =
        remaining.get(key) ??
        (payment.categoryId ? (available[month]?.[payment.categoryId] ?? 0) : 0);
      const cost = Math.abs(payment.amountCents);
      remaining.set(key, balance - cost);
      return { ...payment, covered: payment.categoryId !== null && balance >= cost };
    });
}
interface MonthlyGoal {
  id: string;
  categoryId: string | null;
  targetDate: string | null;
  savedCents: number;
  remainingCents: number;
  neededMonthlyCents: number | null;
}

/** Dated standalone goals: compare this month's saved progress with its starting monthly need. */
export function unfundedSavingsGoals<T extends MonthlyGoal>(
  goals: readonly T[],
  previous: readonly MonthlyGoal[],
  adoptedCategoryIds: readonly string[],
): T[] {
  return goals.filter((goal) => {
    if (
      goal.remainingCents <= 0 ||
      !goal.targetDate ||
      (goal.categoryId && adoptedCategoryIds.includes(goal.categoryId))
    )
      return false;
    const before = previous.find((g) => g.id === goal.id);
    return Boolean(
      before &&
      (before.neededMonthlyCents ?? before.remainingCents) >
        Math.max(0, goal.savedCents - before.savedCents),
    );
  });
}
