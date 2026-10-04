import {
  monthOf,
  type IncomeGroup,
  type OverviewCategory,
  type OverviewData,
  type OverviewIncomeType,
  type OverviewSplit,
} from '@budget/domain';
import { and, eq, isNull } from 'drizzle-orm';
import {
  account,
  booking,
  bookingSplit,
  category,
  categoryGroup,
  incomeType,
  INCOME_TYPES,
  payee,
} from '../schema';
import { assertEurBudgetAccounts } from './account-invariants';
import type { Executor } from './types';

const SPECIAL_TYPE_ID: string = INCOME_TYPES.special.id;

const groupOf = (typeId: string | null): IncomeGroup =>
  typeId === INCOME_TYPES.capital.id
    ? 'capital'
    : typeId === INCOME_TYPES.refund.id
      ? 'refund'
      : 'household';

/**
 * Income and spending splits of the live budget accounts:
 * - a split between two budget accounts is neutral and left out; so is a split of a transfer to or
 *   from an account outside the budget without a category (money moved, not earned or spent);
 * - a categorised split of a spending category is spending (refunds are negative), of an income
 *   category positive income; card-payment and advance (Auslagen) categories only pass money on;
 * - an uncategorised inflow without a contact is income, an uncategorised outflow is spending
 *   without a category;
 * - the app's own payees (opening balance, balance corrections) are left out.
 */
export function overviewData(db: Executor): OverviewData {
  assertEurBudgetAccounts(db);
  const onBudget = new Map(
    db
      .select({ id: account.id, onBudget: account.onBudget })
      .from(account)
      .where(isNull(account.deletedAt))
      .all()
      .map((a) => [a.id, a.onBudget]),
  );
  const cats = db
    .select({
      id: category.id,
      name: category.name,
      groupId: category.groupId,
      groupName: categoryGroup.name,
      class: category.class,
      kind: category.kind,
    })
    .from(category)
    .innerJoin(categoryGroup, eq(categoryGroup.id, category.groupId))
    .where(and(isNull(category.deletedAt), isNull(categoryGroup.deletedAt)))
    .all();
  const catById = new Map(cats.map((c) => [c.id, c]));
  const types: OverviewIncomeType[] = db
    .select()
    .from(incomeType)
    .where(isNull(incomeType.deletedAt))
    .all()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'de'))
    .map((t) => ({
      id: t.id,
      name: t.name,
      group: groupOf(t.id),
      special: t.id === SPECIAL_TYPE_ID,
    }));

  const rows = db
    .select({
      bookingId: booking.id,
      accountId: booking.accountId,
      date: booking.date,
      bookingTransferId: booking.transferId,
      splitTransferId: bookingSplit.transferId,
      amountCents: bookingSplit.amountCents,
      categoryId: bookingSplit.categoryId,
      contactId: bookingSplit.contactId,
      incomeTypeId: bookingSplit.incomeTypeId,
      payeeId: booking.payeeId,
      payeeName: payee.name,
      payeeSystem: payee.systemKind,
      refundCategoryId: payee.defaultCategoryId,
      openingDate: account.openingDate,
    })
    .from(bookingSplit)
    .innerJoin(booking, eq(booking.id, bookingSplit.bookingId))
    .innerJoin(account, eq(account.id, booking.accountId))
    .leftJoin(payee, eq(payee.id, booking.payeeId))
    .where(and(isNull(booking.deletedAt), isNull(account.deletedAt)))
    .all();

  // The account on the other leg of a transfer (a whole booking or a single split).
  const legs = new Map<string, { bookingId: string; accountId: string }[]>();
  for (const r of rows)
    for (const t of [r.bookingTransferId, r.splitTransferId]) {
      if (!t) continue;
      const list = legs.get(t) ?? [];
      if (!list.some((l) => l.bookingId === r.bookingId))
        list.push({ bookingId: r.bookingId, accountId: r.accountId });
      legs.set(t, list);
    }

  const splits: OverviewSplit[] = [];
  for (const r of rows) {
    if (onBudget.get(r.accountId) !== true || r.payeeSystem !== null || r.date < r.openingDate)
      continue;
    const transferId = r.splitTransferId ?? r.bookingTransferId;
    const partner =
      transferId === null
        ? null
        : (legs.get(transferId)?.find((l) => l.bookingId !== r.bookingId)?.accountId ?? null);
    if (partner !== null && onBudget.get(partner) === true) continue;
    const base = {
      bookingId: r.bookingId,
      date: r.date,
      payeeId: r.payeeId,
      payeeName: r.payeeName,
    };
    const explicit = r.categoryId === null ? undefined : catById.get(r.categoryId);
    const refundTarget =
      r.incomeTypeId === INCOME_TYPES.refund.id &&
      r.contactId === null &&
      transferId === null &&
      (r.categoryId === null || explicit?.kind === 'income') &&
      r.refundCategoryId !== null
        ? catById.get(r.refundCategoryId)
        : undefined;
    const cat = refundTarget?.class ? refundTarget : explicit;
    if (cat) {
      if (cat.class !== null)
        splits.push({
          ...base,
          kind: 'spend',
          amountCents: -r.amountCents,
          categoryId: cat.id,
          incomeTypeId: null,
          incomeGroup: null,
        });
      else if (
        transferId === null &&
        cat.kind === 'income' &&
        r.amountCents > 0 &&
        r.contactId === null
      )
        splits.push({
          ...base,
          kind: 'income',
          amountCents: r.amountCents,
          categoryId: null,
          incomeTypeId: r.incomeTypeId,
          incomeGroup: groupOf(r.incomeTypeId),
        });
      continue;
    }
    if (transferId !== null || r.contactId !== null) continue;
    if (r.amountCents > 0)
      splits.push({
        ...base,
        kind: 'income',
        amountCents: r.amountCents,
        categoryId: null,
        incomeTypeId: r.incomeTypeId,
        incomeGroup: groupOf(r.incomeTypeId),
      });
    else if (r.amountCents < 0)
      splits.push({
        ...base,
        kind: 'spend',
        amountCents: -r.amountCents,
        categoryId: null,
        incomeTypeId: null,
        incomeGroup: null,
      });
  }

  const categories: OverviewCategory[] = cats.flatMap((c) =>
    c.class === null
      ? []
      : [{ id: c.id, name: c.name, groupId: c.groupId, groupName: c.groupName, class: c.class }],
  );
  const first = splits.reduce<string | null>((m, s) => {
    const month = monthOf(s.date);
    return m === null || month < m ? month : m;
  }, null);
  return { categories, incomeTypes: types, splits, firstMonth: first };
}
