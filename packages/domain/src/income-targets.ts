/** Planning estimate, never money available for assignment. All amounts are integer cents. */
export function incomeTargets(input: {
  expected: ReadonlyArray<number | null>;
  salaryRuleCents?: number | null;
  /** Exactly the preceding three complete months; null means missing history. */
  history: ReadonlyArray<number | null>;
  heldCents: number;
  previousHeldCents: number;
  envelopes: ReadonlyArray<{ categoryId: string; goalCents: number; needCents: number }>;
}) {
  const exact = (n: number) => {
    if (!Number.isSafeInteger(n)) throw new RangeError('Income target exceeds safe integer cents');
    return n;
  };
  const sum = (values: ReadonlyArray<number>) => values.reduce((a, v) => exact(a + exact(v)), 0);
  let source: 'expected' | 'salary_rule' | 'median' | 'unavailable' = 'unavailable';
  let expectedCents: number | null = null;
  if (input.expected.length) {
    if (input.expected.every((v): v is number => v !== null)) {
      expectedCents = sum(input.expected);
      source = 'expected';
    }
  } else if (input.salaryRuleCents != null) {
    expectedCents = exact(input.salaryRuleCents);
    source = 'salary_rule';
  } else if (input.history.length === 3 && input.history.every((v): v is number => v !== null)) {
    expectedCents = [...input.history].sort((a, b) => a - b)[1]!;
    source = 'median';
  }
  const targetsCents = sum(input.envelopes.map((e) => e.goalCents));
  const unfunded = input.envelopes.filter((e) => e.needCents > 0);
  const assignedIncomeCents =
    expectedCents === null
      ? null
      : exact(expectedCents - input.heldCents + input.previousHeldCents);
  return {
    source,
    expectedCents,
    assignedIncomeCents,
    targetsCents,
    heldCents: input.heldCents,
    previousHeldCents: input.previousHeldCents,
    differenceCents:
      assignedIncomeCents === null ? null : exact(assignedIncomeCents - targetsCents),
    unfundedCategoryIds: unfunded.map((e) => e.categoryId),
    unfundedCents: sum(unfunded.map((e) => e.needCents)),
  };
}
export type IncomeTargets = ReturnType<typeof incomeTargets>;
