import { addMonths, freedomAnnualSpendCents, freedomSumCents, monthsBetween } from '@budget/domain';

/** The existing R16 sources, shared with the forecast page. Refunds stay netted. */
export function freedomExpenseMonths(
  facts: {
    categories: ReadonlyArray<{ id: string; class: string | null }>;
    budgetByMonth: ReadonlyMap<
      string,
      { envelopes: Readonly<Record<string, { activityCents: number }>> }
    >;
  },
  refMonth: string,
): { month: string; consumptionCents: number | null }[] {
  return monthsBetween(addMonths(refMonth, -11), refMonth)
    .filter((month) => facts.budgetByMonth.has(month))
    .map((month) => ({
      month,
      consumptionCents: freedomSumCents(
        facts.categories
          .filter((c) => c.class === 'need' || c.class === 'want')
          .map((c) => -(facts.budgetByMonth.get(month)?.envelopes[c.id]?.activityCents ?? 0)),
      ),
    }));
}

export function freedomExpenses(
  facts: Parameters<typeof freedomExpenseMonths>[0],
  refMonth: string,
): number {
  return freedomAnnualSpendCents(
    freedomExpenseMonths(facts, refMonth).map((m) => {
      if (m.consumptionCents === null) throw new RangeError('Freedom monthly expenses unavailable');
      return m.consumptionCents;
    }),
  );
}

/** Cash plus holdings in investment-role accounts; exactly the existing R16 selection. */
export function freedomInvestmentAccounts<T extends { role: string; openingDate: string }>(
  accounts: ReadonlyArray<T>,
  day: string,
): T[] {
  return accounts.filter((a) => a.role === 'investment' && a.openingDate <= day);
}

export function freedomInvestedCents(
  accounts: ReadonlyArray<{ id: string; role: string; openingDate: string }>,
  day: string,
  byAccount: Readonly<Record<string, number | null>>,
): number | null {
  const values = freedomInvestmentAccounts(accounts, day).map((a) => byAccount[a.id]);
  if (values.some((value) => value === null)) return null;
  return freedomSumCents(values.map((value) => value ?? 0));
}
