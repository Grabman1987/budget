import { addDays, freedomSumCents, nextExecutionAfter, rowAppliesOn } from '@budget/domain';
import type { SavingsPlanRecord } from './savings-api';

export const BANK_NOTE =
  'Die App plant nur. Ausführung und Änderungen bei der Bank musst du selbst veranlassen.';

/** The first future occurrence across inclusive versions; overlapping versions stay unavailable. */
export function nextPlanExecution(rows: SavingsPlanRecord[], today: string) {
  const candidates = rows
    .map((row) => ({
      row,
      date: nextExecutionAfter(
        row.dayOfMonth,
        row.validFrom > today ? addDays(row.validFrom, -1) : today,
      ),
    }))
    .filter(({ row, date }) => rowAppliesOn(row, date))
    .sort((a, b) => a.date.localeCompare(b.date));
  const first = candidates[0];
  return !first || rows.filter((row) => rowAppliesOn(row, first.date)).length !== 1
    ? null
    : { date: first.date, amountCents: first.row.amountCents };
}

/** Recorded buys, including manual buys; this is not proof of bank schedule execution. */
export function planPurchases<
  T extends {
    kind: string;
    date: string;
    securityId: string;
    accountId: string;
    amountCents: number;
  },
>(rows: SavingsPlanRecord[], trades: T[], today: string) {
  const first = rows.slice().sort((a, b) => a.validFrom.localeCompare(b.validFrom))[0];
  const buys = first
    ? trades.filter(
        (t) =>
          t.kind === 'buy' &&
          t.securityId === first.securityId &&
          t.accountId === first.accountId &&
          t.date >= first.validFrom &&
          t.date <= today,
      )
    : [];
  return {
    buys,
    since: first?.validFrom ?? null,
    totalCents: freedomSumCents(buys.map((t) => t.amountCents)),
  };
}

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
