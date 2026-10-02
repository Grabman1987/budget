import { monthOf, monthsBetween, splitEffect } from '@budget/domain';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { account, payee } from '../schema';
import { budgetLedger } from './queries';
import type { Executor } from './types';

export interface PayeeActivityBooking {
  id: string;
  date: string;
  payeeId: string | null;
  status: string;
  /** Positive for net eligible consumption, negative for net refund. */
  spendCents: number;
  categories: { id: string; name: string; spendCents: number }[];
}

export interface PayeeActivity {
  bookings: PayeeActivityBooking[];
  payees: { id: string; name: string; deleted: boolean }[];
  excludedUnclassifiedOutflowCents: number;
  statuses: string[];
}

function addExact(a: number, b: number): number {
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b))
    throw new RangeError('Payee report source is outside safe integer cents');
  const result = a + b;
  if (!Number.isSafeInteger(result))
    throw new RangeError('Payee report exceeds safe integer cents');
  return result;
}

/**
 * Full-ledger source for recipient analysis. The classification is the same splitEffect used by
 * the budget read model; the account opening boundary is applied per split, as budgetMonths does.
 */
export function payeeActivity(db: Executor, range: { from: string; to: string }): PayeeActivity {
  const ledger = budgetLedger(db);
  const accounts = new Map(ledger.accounts.map((row) => [row.id, row]));
  const categories = new Map(ledger.categories.map((row) => [row.id, row]));
  const onBudget = new Map(ledger.accounts.map((row) => [row.id, row.onBudget]));
  const live = new Set(ledger.categories.map((row) => row.id));
  const grouped = new Map<
    string,
    {
      id: string;
      date: string;
      payeeId: string | null;
      status: string;
      spendCents: number;
      categories: Map<string, number>;
    }
  >();
  let excludedUnclassifiedOutflowCents = 0;
  const statuses = new Set<string>();

  for (const split of ledger.splits) {
    const accountRow = accounts.get(split.accountId);
    if (
      !accountRow ||
      split.date < accountRow.openingDate ||
      split.date < range.from ||
      split.date > range.to
    )
      continue;
    const effect = splitEffect(split, onBudget, live);
    if (effect.kind === 'activity') {
      const category = categories.get(effect.categoryId);
      if (category?.class !== 'need' && category?.class !== 'want') continue;
      if (split.amountCents === 0) continue;
      const bookingId = split.bookingId;
      if (!bookingId) throw new Error('Budget ledger split is missing its booking identity');
      const key = bookingId;
      let row = grouped.get(key);
      if (!row) {
        row = {
          id: bookingId,
          date: split.date,
          payeeId: split.payeeId ?? null,
          status: split.status ?? 'confirmed',
          spendCents: 0,
          categories: new Map(),
        };
        grouped.set(key, row);
      }
      // Ledger outflows are negative. Negation preserves signed refunds as negative consumption.
      row.spendCents = addExact(row.spendCents, -split.amountCents);
      const categoryTotal = addExact(
        row.categories.get(effect.categoryId) ?? 0,
        -split.amountCents,
      );
      row.categories.set(effect.categoryId, categoryTotal);
      statuses.add(row.status);
    } else if (
      effect.kind === 'income' &&
      split.amountCents < 0 &&
      (split.categoryId === null || !live.has(split.categoryId))
    ) {
      excludedUnclassifiedOutflowCents = addExact(
        excludedUnclassifiedOutflowCents,
        -split.amountCents,
      );
    }
  }
  const bookings = [...grouped.values()]
    .map((row) => ({
      ...row,
      categories: [...row.categories]
        .map(([id, spendCents]) => ({
          id,
          name: categories.get(id)?.name ?? 'Gelöschte Kategorie',
          spendCents,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, 'de')),
    }))
    .sort((a, b) =>
      b.date > a.date ? 1 : b.date < a.date ? -1 : b.id > a.id ? 1 : b.id < a.id ? -1 : 0,
    );
  const payees = db
    .select({ id: payee.id, name: payee.name, deletedAt: payee.deletedAt })
    .from(payee)
    .orderBy(asc(payee.name), asc(payee.id))
    .all()
    .map((row) => ({ id: row.id, name: row.name, deleted: row.deletedAt !== null }));
  return { bookings, payees, excludedUnclassifiedOutflowCents, statuses: [...statuses].sort() };
}

export function payeeAvailableMonths(db: Executor, throughMonth: string): string[] {
  const rows = db
    .select({ openingDate: account.openingDate })
    .from(account)
    .where(and(isNull(account.deletedAt), eq(account.onBudget, true)))
    .all();
  const first = rows.map((row) => monthOf(row.openingDate)).sort()[0];
  if (!first || first > throughMonth) return [];
  return monthsBetween(first, throughMonth);
}
