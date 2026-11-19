import { snapshotSchema, type Snapshot } from '@budget/domain';
import { isLiquidityAccount, isPaymentAccount } from './liquidity-account';
import { forecastBudgetValues, forecastInputs, loadFacts } from './rule-inputs';
import type { Executor } from './types';

/** Capture the same dated EUR budget cash and scheduled legs as Heute. */
export function scenarioBaseline(db: Executor, asOf: string): Snapshot {
  const facts = loadFacts(db, asOf);
  const accounts = facts.accounts.filter((account) => isLiquidityAccount(account, asOf));
  if (accounts.length === 0) throw new RangeError('No EUR budget account for a scenario baseline');
  const byAccount = forecastBudgetValues(
    db,
    asOf,
    accounts.map((account) => account.id),
  );
  const forecast = forecastInputs(facts, asOf, { byAccount });
  const missingFx = forecast.missingFx[0];
  if (missingFx)
    throw new RangeError(
      `Missing ${missingFx.currency} forecast rate for ${missingFx.paymentId} on ${missingFx.dueDate}`,
    );
  if (forecast.variableMonthlyCents > 0 && accounts.length > 1)
    throw new RangeError('Forecast variable spending has no per-account allocation');

  return snapshotSchema.parse({
    asOf,
    through: forecast.through,
    accounts: accounts.map((account) => ({
      id: account.id,
      balanceCents: byAccount[account.id],
      onBudget: account.onBudget,
      role: account.role,
      closedAt: account.closedAt,
      openingDate: account.openingDate,
      currency: account.currency,
      variableMonthlyCents: forecast.variableMonthlyCents,
      paymentAccount: isPaymentAccount(account, asOf),
    })),
    // Preserve the scenario schema's existing day-zero obligation convention.
    items: [...forecast.dayZeroItems, ...forecast.accountItems.filter((item) => item.day > asOf)]
      .filter((item) => item.day <= forecast.through)
      .flatMap((item) => {
        if (item.accountId === null)
          throw new RangeError(`Unassigned forecast account for ${item.source.id}`);
        if (item.linkedBookingMismatch)
          throw new RangeError(`Linked booking disagrees with forecast for ${item.source.id}`);
        if (item.day === asOf && item.cents === 0) return [];
        return [
          {
            id: JSON.stringify([item.source.kind, item.source.id, item.source.dueDay]),
            accountId: item.accountId,
            day: item.day,
            cents: item.cents,
            kind: item.kind,
            expected: item.expected,
            paymentId: item.ref?.paymentId,
            source: item.source,
          },
        ];
      }),
    loans: [],
    savingsPlans: [],
  });
}
