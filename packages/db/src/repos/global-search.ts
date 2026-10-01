import { and, asc, isNull, or, sql } from 'drizzle-orm';
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
export function globalSearch(db: Executor, query: string): GlobalSearchResult[] {
  const text = query.trim();
  if (text.length < 2 || text.length > 200) return [];
  const variants = [
    ...new Set([
      text,
      text.toLowerCase(),
      text.toUpperCase(),
      text.charAt(0).toUpperCase() + text.slice(1).toLowerCase(),
    ]),
  ];
  const patterns = variants.map((v) => `%${v.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
  const results: GlobalSearchResult[] = [];
  for (const [kind, table] of [
    ['account', account],
    ['category', category],
    ['payee', payee],
    ['contact', contact],
  ] as const) {
    const rows = db
      .select({ id: table.id, name: table.name })
      .from(table)
      .where(
        and(
          isNull(table.deletedAt),
          or(...patterns.map((p) => sql`${table.name} LIKE ${p} ESCAPE '\\'`)),
        ),
      )
      .orderBy(asc(table.name), asc(table.id))
      .limit(GLOBAL_SEARCH_LIMIT)
      .all();
    results.push(...rows.map((row) => ({ kind, id: row.id, label: row.name, detail: null })));
  }
  results.push(
    ...queryBookings(db, { text, limit: GLOBAL_SEARCH_LIMIT }).items.map((b) => ({
      kind: 'booking' as const,
      id: b.id,
      label: b.payeeName ?? b.transferAccountName ?? b.memo ?? 'Buchung',
      detail: `${b.date.slice(8, 10)}.${b.date.slice(5, 7)}.${b.date.slice(0, 4)} · ${b.accountName}${b.memo ? ` · ${b.memo}` : ''}`,
    })),
  );
  return results;
}
