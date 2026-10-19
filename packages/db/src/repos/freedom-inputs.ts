import { addMonths, freedomAnnualSpendCents, freedomSumCents, monthsBetween } from '@budget/domain';
import { isNull } from 'drizzle-orm';
import { account } from '../schema';
import { allocationInputsAsOf } from './allocation-inputs';
import type { Executor } from './types';

/** The current Anlagebasis selection applies to every dated valuation, including history. */
export function freedomInvestmentBasis(db: Executor, asOf: string) {
  const basis = allocationInputsAsOf(db, asOf);
  const selected = new Set(basis.universe.accountIds);
  const accounts = db
    .select()
    .from(account)
    .where(isNull(account.deletedAt))
    .all()
    .filter((row) => selected.has(row.id) && row.openingDate <= asOf)
    .map((row) => {
      const unavailable = basis.unavailable.filter((position) => position.accountId === row.id);
      return {
        id: row.id,
        name: row.name,
        valueCents: unavailable.length
          ? null
          : freedomSumCents(
              basis.positions
                .filter((position) => position.accountId === row.id)
                .map((position) => position.valueCents),
            ),
        missingPrice: unavailable.some((position) => position.reason === 'missing_price'),
        missingFxCurrencies: [
          ...new Set(
            unavailable.flatMap((position) =>
              position.reason === 'missing_fx' && position.currency ? [position.currency] : [],
            ),
          ),
        ],
      };
    });
  return {
    investedCents:
      basis.valueCents !== null && Number.isSafeInteger(basis.valueCents) ? basis.valueCents : null,
    accounts,
  };
}

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

/** Legacy role-based helper retained for compatibility; live consumers use the Anlagebasis. */
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
