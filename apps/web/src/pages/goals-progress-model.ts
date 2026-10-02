import type { GoalView } from '../budget/goals-api';

export interface GoalSource {
  id: string;
  name: string;
  kind: 'category' | 'account';
  cls: string | null;
}
export interface GoalReportRow {
  id: string;
  name: string;
  targetDate: string | null;
  note: string | null;
  source: GoalSource | null;
  /** Only available with one unique, live, proven EUR source. Unknown rows carry no figures. */
  progress: GoalView | null;
  reason: string | null;
}
interface CategorySource {
  id: string;
  name: string;
  class: string | null;
}
interface AccountSource {
  id: string;
  name: string;
  currency: string;
}
const safe = (n: number) => Number.isSafeInteger(n);
const nullableSafe = (n: number | null) => n === null || safe(n);

/** Structural availability only: every financial figure and status remains the existing API's. */
export function goalReportRows(
  goals: GoalView[],
  categories: CategorySource[],
  accounts: AccountSource[],
): GoalReportRow[] {
  const counts = new Map<string, number>();
  for (const g of goals) {
    for (const key of [
      g.categoryId && `category:${g.categoryId}`,
      g.accountId && `account:${g.accountId}`,
    ]) {
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return goals.map((g) => {
    const cat = categories.find((c) => c.id === g.categoryId);
    const account = accounts.find((a) => a.id === g.accountId);
    let source: GoalSource | null = null;
    let reason: string | null = null;
    if (g.categoryId !== null && g.accountId !== null)
      reason = 'Kategorie und Konto zugleich verknüpft; Quelle nicht eindeutig.';
    else if (g.categoryId === null && g.accountId === null)
      reason = 'Keine Kategorie oder kein Konto verknüpft.';
    else if (g.categoryId !== null) {
      if (!cat) reason = 'Verknüpfte Kategorie fehlt oder wurde gelöscht.';
      else source = { id: cat.id, name: cat.name, kind: 'category', cls: cat.class };
    } else if (!account) reason = 'Verknüpftes Konto fehlt oder wurde gelöscht.';
    else {
      source = { id: account.id, name: account.name, kind: 'account', cls: null };
      if (account.currency !== 'EUR')
        reason = 'Kontowährung ist nicht als EUR belegt; Betrag und Fortschritt nicht verfügbar.';
    }
    if (source && !reason && (counts.get(`${source.kind}:${source.id}`) ?? 0) > 1)
      reason =
        'Mehrere Sparziele verwenden dieselbe Quelle; eigene Mittel je Ziel sind nicht zugeordnet.';
    const amounts = [g.targetCents, g.savedCents, g.remainingCents, g.averageRateCents];
    if (
      !reason &&
      (!amounts.every(safe) ||
        !nullableSafe(g.neededMonthlyCents) ||
        !nullableSafe(g.monthsLeft) ||
        g.targetCents <= 0 ||
        g.savedCents < 0 ||
        g.remainingCents < 0 ||
        (g.monthsLeft !== null && g.monthsLeft < 0) ||
        (g.neededMonthlyCents !== null && g.neededMonthlyCents < 0) ||
        !(g.forecastMonth === null || /^\d{4}-(0[1-9]|1[0-2])$/.test(g.forecastMonth)) ||
        !['reached', 'on_track', 'behind'].includes(g.status))
    )
      reason = 'Fortschrittswerte sind nicht vollständig oder nicht sicher verfügbar.';
    return {
      id: g.id,
      name: g.name,
      targetDate: g.targetDate,
      note: g.note,
      source,
      progress: reason ? null : g,
      reason,
    };
  });
}
