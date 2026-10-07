import { cents, formatDecimal, matchesSearch } from '@budget/domain';
import { and, asc, inArray, isNull } from 'drizzle-orm';
import { account, category, contact, payee } from '../schema';
import type { Executor } from './types';
import { queryBookings } from './ledger-queries';

export type SearchKind = 'account' | 'category' | 'payee' | 'contact' | 'booking';
export interface GlobalSearchResult {
  kind: SearchKind;
  id: string;
  label: string;
  detail: string | null;
}
export const GLOBAL_SEARCH_LIMIT = 5;

/** Small read-only result set; each entity gets its own bound so bookings cannot crowd it out. */
export function globalSearch(
  db: Executor,
  query: string,
  history: Pick<GlobalSearchResult, 'kind' | 'id'>[] = [],
): GlobalSearchResult[] {
  const text = query.trim();
  if ((text.length > 0 && text.length < 2) || text.length > 200) return [];
  const results: GlobalSearchResult[] = [];
  const rank = (ids: string[], id: string) => {
    const index = ids.indexOf(id);
    return index < 0 ? ids.length : index;
  };
  for (const [kind, table] of [
    ['account', account],
    ['category', category],
    ['payee', payee],
    ['contact', contact],
  ] as const) {
    const ids = history.filter((r) => r.kind === kind).map((r) => r.id);
    if (!text && !ids.length) continue;
    const rows = db
      .select({ id: table.id, name: table.name })
      .from(table)
      .where(
        and(
          isNull(table.deletedAt),
          kind === 'account' ? isNull(account.closedAt) : undefined,
          text ? undefined : inArray(table.id, ids),
        ),
      )
      .orderBy(asc(table.name), asc(table.id))
      .all()
      // ponytail: scan lookup names in memory; add an index if the owner's catalog outgrows this.
      .filter((row) => !text || matchesSearch(row.name, text))
      .sort((a, b) => rank(ids, a.id) - rank(ids, b.id))
      .slice(0, text ? GLOBAL_SEARCH_LIMIT : 8);
    results.push(...rows.map((row) => ({ kind, id: row.id, label: row.name, detail: null })));
  }
  // ponytail: search the latest 200 bookings; use indexed server search if the recent window grows.
  const chosen = history.filter((r) => r.kind === 'booking').map((r) => r.id);
  // An empty palette without recent bookings needs none: skip the 200-row scan on every first focus.
  const recent =
    text || chosen.length
      ? queryBookings(db, { sort: 'date', direction: 'desc', limit: 200 }).items
      : [];
  recent.sort((a, b) => rank(chosen, a.id) - rank(chosen, b.id));
  results.push(
    ...recent
      .filter(
        (b) =>
          !text ||
          [
            b.payeeName,
            b.memo,
            b.accountName,
            formatDecimal(cents(b.amountCents)),
            ...b.splits.flatMap((s) => [s.memo, s.categoryName]),
          ].some((field) => field && matchesSearch(field, text)),
      )
      .slice(0, text ? GLOBAL_SEARCH_LIMIT : Math.max(GLOBAL_SEARCH_LIMIT, chosen.length))
      .map((b) => ({
        kind: 'booking' as const,
        id: b.id,
        label: b.payeeName ?? b.transferAccountName ?? b.memo ?? 'Buchung',
        detail: `${b.date.slice(8, 10)}.${b.date.slice(5, 7)}.${b.date.slice(0, 4)} · ${formatDecimal(cents(b.amountCents))} ${b.currency} · ${b.accountName}${b.memo ? ` · ${b.memo}` : ''}`,
      })),
  );
  return results;
}
