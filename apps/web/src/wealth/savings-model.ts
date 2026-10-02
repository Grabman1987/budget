import { rowAppliesOn } from '@budget/domain';
import type { SavingsPlanRecord } from './savings-api';

export const BANK_NOTE =
  'Die App plant nur. Ausführung und Änderungen bei der Bank musst du selbst veranlassen.';

/** Open means editable, not necessarily effective today. Keep the inclusive version history. */
export function planGroups(plans: SavingsPlanRecord[], today: string) {
  const groups = new Map<string, SavingsPlanRecord[]>();
  for (const plan of plans) {
    const key = JSON.stringify([plan.securityId, plan.accountId]);
    const rows = groups.get(key) ?? [];
    rows.push(plan);
    groups.set(key, rows);
  }
  return [...groups.values()].map((rows) => {
    rows.sort((a, b) => b.validFrom.localeCompare(a.validFrom));
    const effective = rows.filter((row) => rowAppliesOn(row, today));
    return {
      rows,
      effective,
      ambiguous: effective.length > 1,
      current: effective.length === 1 ? effective[0] : undefined,
      future: rows.filter((row) => row.validFrom > today),
      editable: rows.find((row) => row.validTo === null),
      latest: rows[0]!,
    };
  });
}

/** Native rates are never combined across currencies or with their future replacements. */
export function currentRates(
  groups: ReturnType<typeof planGroups>,
  accounts: { id: string; currency: string }[],
) {
  const totals = new Map<string, number | null>();
  let missingAccount = false;
  for (const { effective, current } of groups) {
    if (!effective.length) continue;
    const account = accounts.find((a) => a.id === effective[0]!.accountId);
    if (!account) {
      missingAccount = true;
      totals.set('Währung unbekannt', null);
      continue;
    }
    if (!current) {
      totals.set(account.currency, null);
      continue;
    }
    const previous = totals.get(account.currency);
    const sum = (previous ?? 0) + current.amountCents;
    totals.set(account.currency, previous === null || !Number.isSafeInteger(sum) ? null : sum);
  }
  // An absent account could belong to any currency, so known currency totals may be partial too.
  if (missingAccount) for (const currency of totals.keys()) totals.set(currency, null);
  return totals;
}
