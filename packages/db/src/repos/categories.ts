import { randomUUID } from 'node:crypto';
import { and, asc, eq, getTableColumns, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import {
  account,
  assignmentRule,
  booking,
  bookingSplit,
  category,
  categoryGroup,
  categoryTarget,
  CLASSLESS_KINDS,
  envelopeMonth,
  expectedPayment,
  payee,
  plannedEvent,
  savingsGoal,
  type CATEGORY_CLASSES,
  type CATEGORY_KINDS,
  type TARGET_KINDS,
} from '../schema';
import { insertTracked, nowIso, updateTracked, withGroup, type AuditContext } from './audit';
import { createEntity, getEntity, updateEntity } from './entities';
import { setAssigned } from './envelopes';
import { CategoryRuleError, EntityNotFoundError } from './errors';
import { runInTransaction, type Executor } from './types';

/**
 * Categories and groups (Einstellungen › Kategorien): create, edit, hide, sort, targets, and the
 * two restructuring moves the YNAB migration needs, merge and split-off. Every action is one audit
 * group, so one "Rückgängig" reverts it completely. Moving splits between categories is allowed on
 * reconciled bookings too: the category is not part of what Kontostand prüfen checked.
 */

type CategoryRow = typeof category.$inferSelect;
export type CategoryClass = (typeof CATEGORY_CLASSES)[number];
export type CategoryKind = (typeof CATEGORY_KINDS)[number];

export interface CategoryFields {
  name: string;
  groupId: string;
  icon?: string | null;
  class?: CategoryClass | null;
  kind?: CategoryKind;
  stage?: number | null;
  cardAccountId?: string | null;
  rolloverOverspending?: boolean;
}

export interface TargetInput {
  kind: (typeof TARGET_KINDS)[number];
  amountCents: number;
  everyMonths?: number;
  targetDate?: string | null;
  dueDay?: number | null;
}

/** One emoji (with modifiers, ZWJ sequences, flags), at most 16 UTF-16 units. */
const EMOJI =
  /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator})(?:\p{Emoji}|\p{Emoji_Modifier}|\u200d|\ufe0f|[\u{E0020}-\u{E007F}])*$/u;

const cleanName = (name: string) => {
  const trimmed = name.replace(/\s+/g, ' ').trim();
  if (trimmed === '') throw new CategoryRuleError('Eine Kategorie braucht einen Namen.');
  return trimmed;
};

/** Class, kind, card, stage and icon must fit together (the CHECKs of the table, with reasons). */
function assertCategory(db: Executor, c: Omit<CategoryFields, 'name'> & { id?: string }): void {
  const kind = c.kind ?? 'variable';
  const classless = (CLASSLESS_KINDS as readonly string[]).includes(kind);
  if (classless && c.class) throw new CategoryRuleError('Diese Art hat keine Klasse.');
  if (!classless && !c.class)
    throw new CategoryRuleError('Jede Ausgabenkategorie gehört zu Bedarf, Wunsch oder Zukunft.');
  if (c.stage != null && !(Number.isInteger(c.stage) && c.stage >= 1 && c.stage <= 9))
    throw new CategoryRuleError('Die Stufe liegt zwischen 1 und 9.');
  if (c.icon != null && (c.icon.length > 16 || !EMOJI.test(c.icon)))
    throw new CategoryRuleError('Als Symbol passt genau ein Emoji.');
  if (!getEntity(db, categoryGroup, c.groupId))
    throw new EntityNotFoundError('category_group', c.groupId);
  if ((kind === 'card_payment') !== (c.cardAccountId != null))
    throw new CategoryRuleError('Eine Kartenzahlung gehört zu genau einer Kreditkarte.');
  if (c.cardAccountId != null) {
    const card = getEntity(db, account, c.cardAccountId);
    if (!card || card.type !== 'credit_card')
      throw new CategoryRuleError('Eine Kartenzahlung gehört zu einem Kreditkartenkonto.');
    const other = db
      .select({ id: category.id })
      .from(category)
      .where(and(eq(category.cardAccountId, c.cardAccountId), isNull(category.deletedAt)))
      .get();
    if (other && other.id !== c.id)
      throw new CategoryRuleError('Diese Karte hat schon eine Kartenzahlung.');
  }
}

function liveCategory(db: Executor, id: string): CategoryRow {
  const row = getEntity(db, category, id);
  if (!row) throw new EntityNotFoundError('category', id);
  return row;
}

const nextSort = (db: Executor, groupId: string) =>
  (db
    .select({ max: sql<number | null>`MAX(${category.sortOrder})` })
    .from(category)
    .where(and(eq(category.groupId, groupId), isNull(category.deletedAt)))
    .get()?.max ?? -1) + 1;

export function createCategory(db: Executor, input: CategoryFields, ctx: AuditContext) {
  const name = cleanName(input.name);
  return runInTransaction(db, (tx) => {
    assertCategory(tx, input);
    return createEntity(
      tx,
      category,
      { ...input, name, kind: input.kind ?? 'variable', sortOrder: nextSort(tx, input.groupId) },
      ctx,
    );
  });
}

export const ADVANCE_CATEGORY_NAME = 'Auslagen';
export const ADVANCE_GROUP_NAME = 'Durchlaufposten';

/**
 * The envelope a contact share runs through (concept §3.4). Returns the live one (visible first) or
 * creates it on demand: kind advance, stage 2 (Laufender Monat), in the group "Durchlaufposten"
 * (reused when it exists). One transaction, so two parallel first contact shares create one category.
 */
export function ensureAdvanceCategory(db: Executor, ctx: AuditContext) {
  return runInTransaction(db, (tx) => {
    const existing = tx
      .select()
      .from(category)
      .where(and(eq(category.kind, 'advance'), isNull(category.deletedAt)))
      .orderBy(sql`${category.hiddenAt} IS NOT NULL`, asc(category.sortOrder))
      .get();
    if (existing) return { category: existing, created: false };
    const group =
      tx
        .select()
        .from(categoryGroup)
        .where(and(eq(categoryGroup.name, ADVANCE_GROUP_NAME), isNull(categoryGroup.deletedAt)))
        .get() ?? createCategoryGroup(tx, ADVANCE_GROUP_NAME, ctx);
    const created = createCategory(
      tx,
      { name: ADVANCE_CATEGORY_NAME, groupId: group.id, class: null, kind: 'advance', stage: 2 },
      ctx,
    );
    return { category: created, created: true };
  });
}

export function updateCategory(
  db: Executor,
  id: string,
  patch: Partial<CategoryFields>,
  ctx: AuditContext,
) {
  return runInTransaction(db, (tx) => {
    const current = liveCategory(tx, id);
    // A card payment envelope stays one: its kind and card follow the card, not the owner.
    if (
      current.kind === 'card_payment' &&
      ((patch.kind !== undefined && patch.kind !== 'card_payment') ||
        (patch.cardAccountId !== undefined && patch.cardAccountId !== current.cardAccountId))
    )
      throw new CategoryRuleError('Die Art einer Kartenzahlung lässt sich nicht ändern.');
    const next = { ...current, ...patch, name: cleanName(patch.name ?? current.name) };
    assertCategory(tx, next);
    // A category that changes group goes to the end of the new group.
    const sortOrder =
      patch.groupId && patch.groupId !== current.groupId ? nextSort(tx, patch.groupId) : undefined;
    return updateEntity(tx, category, id, { ...patch, name: next.name, sortOrder }, ctx);
  });
}

/** Hide or show a category. Hidden envelopes keep their money and still count in every figure. */
export function setCategoryHidden(db: Executor, id: string, hidden: boolean, ctx: AuditContext) {
  return runInTransaction(db, (tx) => {
    const current = liveCategory(tx, id);
    if (hidden === (current.hiddenAt !== null)) return current;
    return updateEntity(tx, category, id, { hiddenAt: hidden ? nowIso() : null }, ctx);
  });
}

export function createCategoryGroup(db: Executor, name: string, ctx: AuditContext) {
  const clean = cleanName(name);
  return runInTransaction(db, (tx) => {
    const max = tx
      .select({ max: sql<number | null>`MAX(${categoryGroup.sortOrder})` })
      .from(categoryGroup)
      .where(isNull(categoryGroup.deletedAt))
      .get()?.max;
    return createEntity(tx, categoryGroup, { name: clean, sortOrder: (max ?? -1) + 1 }, ctx);
  });
}

export function renameCategoryGroup(db: Executor, id: string, name: string, ctx: AuditContext) {
  return updateEntity(db, categoryGroup, id, { name: cleanName(name) }, ctx);
}

/** Remove an empty group (soft delete). */
export function deleteCategoryGroup(db: Executor, id: string, ctx: AuditContext): void {
  runInTransaction(db, (tx) => {
    if (!getEntity(tx, categoryGroup, id)) throw new EntityNotFoundError('category_group', id);
    const used = tx
      .select({ id: category.id })
      .from(category)
      .where(and(eq(category.groupId, id), isNull(category.deletedAt)))
      .get();
    if (used) throw new CategoryRuleError('Die Gruppe enthält noch Kategorien.');
    updateTracked(tx, categoryGroup, [id], { deletedAt: nowIso() }, ctx, 'delete');
  });
}

/**
 * Drag sort: the groups in the given order, each with its categories in order. A category listed
 * under another group moves there. Unlisted rows keep their place. One audit group.
 */
export function sortCategories(
  db: Executor,
  groups: ReadonlyArray<{ id: string; categoryIds: readonly string[] }>,
  ctx: AuditContext,
): { groupId: string } {
  const grouped = withGroup(ctx);
  runInTransaction(db, (tx) => {
    groups.forEach((g, gi) => {
      if (!getEntity(tx, categoryGroup, g.id))
        throw new EntityNotFoundError('category_group', g.id);
      updateTracked(tx, categoryGroup, [g.id], { sortOrder: gi }, grouped);
      g.categoryIds.forEach((id, ci) => {
        liveCategory(tx, id);
        updateTracked(tx, category, [id], { groupId: g.id, sortOrder: ci }, grouped);
      });
    });
  });
  return { groupId: grouped.groupId };
}

/**
 * Set the target of a category from `validFrom` (`YYYY-MM`) on: a new version, or the version of
 * that month replaced. `null` removes every version (the history stays in the audit log).
 */
export function setCategoryTarget(
  db: Executor,
  categoryId: string,
  target: TargetInput | null,
  validFrom: string,
  ctx: AuditContext,
): void {
  const grouped = withGroup(ctx);
  runInTransaction(db, (tx) => {
    liveCategory(tx, categoryId);
    const versions = tx
      .select()
      .from(categoryTarget)
      .where(eq(categoryTarget.categoryId, categoryId))
      .all();
    if (target === null) {
      for (const v of versions.filter((v) => v.deletedAt === null))
        updateTracked(tx, categoryTarget, [v.id], { deletedAt: nowIso() }, grouped, 'delete');
      return;
    }
    if (target.kind === 'by_date' && !target.targetDate)
      throw new CategoryRuleError('Ein Ziel bis zu einem Datum braucht das Datum.');
    const values = {
      kind: target.kind,
      amountCents: target.amountCents,
      everyMonths: target.everyMonths ?? 1,
      targetDate: target.targetDate ?? null,
      dueDay: target.dueDay ?? null,
    };
    const same = versions.find((v) => v.validFrom === validFrom);
    if (same) updateTracked(tx, categoryTarget, [same.id], { ...values, deletedAt: null }, grouped);
    else
      insertTracked(
        tx,
        categoryTarget,
        { id: randomUUID(), categoryId, validFrom, ...values },
        grouped,
      );
  });
}

/** Tables whose `category_id` follows a merged category (besides splits and budget months). */
const REFERENCES = [
  [payee, 'defaultCategoryId'],
  [expectedPayment, 'categoryId'],
  [savingsGoal, 'categoryId'],
  [plannedEvent, 'categoryId'],
  [assignmentRule, 'categoryId'],
] as const;

export interface MergeResult {
  groupId: string;
  movedSplits: number;
  movedMonths: number;
}

/**
 * Merge `sourceIds` into `targetId` (n:1, as the YNAB mapping does): every split, every assigned
 * month, the opening envelope and every reference move to the target; the sources' targets and
 * the sources themselves are soft-deleted. One audit group, so one undo restores everything.
 * Totals per month (assigned, activity, income, cash) stay the same; only the carry of the merged
 * envelope can differ where one source was overspent and another had money left (netting).
 * Card payment envelopes belong to their card and cannot be merged.
 */
export function mergeCategories(
  db: Executor,
  sourceIds: readonly string[],
  targetId: string,
  ctx: AuditContext,
): MergeResult {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const target = liveCategory(tx, targetId);
    const sources = [...new Set(sourceIds)]
      .filter((id) => id !== targetId)
      .map((id) => liveCategory(tx, id));
    if (sources.length === 0)
      throw new CategoryRuleError('Wähle mindestens eine andere Kategorie.');
    if ([target, ...sources].some((c) => c.kind === 'card_payment'))
      throw new CategoryRuleError('Kartenzahlungen gehören zu ihrer Karte und bleiben getrennt.');
    // Spending never ends up as income (only income categories can merge into one).
    if (target.kind === 'income' && sources.some((c) => c.kind !== 'income'))
      throw new CategoryRuleError(
        'In eine Einnahmen-Kategorie lassen sich nur Einnahmen zusammenführen.',
      );
    let movedSplits = 0;
    let movedMonths = 0;
    let opening = target.openingAvailableCents;
    for (const source of sources) {
      const splits = tx
        .select({ id: bookingSplit.id })
        .from(bookingSplit)
        .where(eq(bookingSplit.categoryId, source.id))
        .all();
      for (const s of splits)
        updateTracked(tx, bookingSplit, [s.id], { categoryId: targetId }, grouped);
      movedSplits += splits.length;
      const months = tx
        .select()
        .from(envelopeMonth)
        .where(and(eq(envelopeMonth.categoryId, source.id), isNull(envelopeMonth.deletedAt)))
        .all();
      for (const m of months) {
        const into = tx
          .select({ cents: envelopeMonth.assignedCents, deletedAt: envelopeMonth.deletedAt })
          .from(envelopeMonth)
          .where(and(eq(envelopeMonth.categoryId, targetId), eq(envelopeMonth.month, m.month)))
          .get();
        const base = into && into.deletedAt === null ? into.cents : 0;
        setAssigned(tx, targetId, m.month, base + m.assignedCents, grouped);
        updateTracked(
          tx,
          envelopeMonth,
          [source.id, m.month],
          { assignedCents: 0, deletedAt: nowIso() },
          grouped,
          'delete',
        );
        movedMonths += 1;
      }
      opening += source.openingAvailableCents;
      for (const [table, prop] of REFERENCES) {
        const column = getTableColumns(table)[prop as keyof typeof table.$inferSelect];
        const rows = tx.select({ id: table.id }).from(table).where(eq(column, source.id)).all();
        for (const r of rows) updateTracked(tx, table, [r.id], { [prop]: targetId }, grouped);
      }
      const targets = tx
        .select({ id: categoryTarget.id })
        .from(categoryTarget)
        .where(and(eq(categoryTarget.categoryId, source.id), isNull(categoryTarget.deletedAt)))
        .all();
      for (const t of targets)
        updateTracked(tx, categoryTarget, [t.id], { deletedAt: nowIso() }, grouped, 'delete');
      updateTracked(
        tx,
        category,
        [source.id],
        { openingAvailableCents: 0, deletedAt: nowIso() },
        grouped,
        'delete',
      );
    }
    updateTracked(tx, category, [targetId], { openingAvailableCents: opening }, grouped);
    return { groupId: grouped.groupId, movedSplits, movedMonths };
  });
}

export interface SplitOffFilter {
  payeeId?: string;
  accountId?: string;
  from?: string;
  to?: string;
  /** Text in the memo of the split or booking, or in the payee name. */
  q?: string;
}

export interface SplitOffCandidate {
  splitId: string;
  bookingId: string;
  date: string;
  accountId: string;
  payeeName: string | null;
  memo: string | null;
  amountCents: number;
}

/** Splits of live bookings in `categoryId` matching the filter, newest first (at most 500). */
export function splitOffCandidates(
  db: Executor,
  categoryId: string,
  filter: SplitOffFilter,
): SplitOffCandidate[] {
  const conditions: (SQL | undefined)[] = [
    eq(bookingSplit.categoryId, categoryId),
    isNull(booking.deletedAt),
    filter.payeeId ? eq(booking.payeeId, filter.payeeId) : undefined,
    filter.accountId ? eq(booking.accountId, filter.accountId) : undefined,
    filter.from ? sql`${booking.date} >= ${filter.from}` : undefined,
    filter.to ? sql`${booking.date} <= ${filter.to}` : undefined,
  ];
  if (filter.q) {
    const text = `%${filter.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    conditions.push(
      or(
        sql`${bookingSplit.memo} LIKE ${text} ESCAPE '\\'`,
        sql`${booking.memo} LIKE ${text} ESCAPE '\\'`,
        sql`${payee.name} LIKE ${text} ESCAPE '\\'`,
      ),
    );
  }
  return db
    .select({
      splitId: bookingSplit.id,
      bookingId: booking.id,
      date: booking.date,
      accountId: booking.accountId,
      payeeName: payee.name,
      memo: sql<string | null>`COALESCE(${bookingSplit.memo}, ${booking.memo})`,
      amountCents: bookingSplit.amountCents,
    })
    .from(bookingSplit)
    .innerJoin(booking, eq(booking.id, bookingSplit.bookingId))
    .leftJoin(payee, eq(payee.id, booking.payeeId))
    .where(and(...conditions))
    .orderBy(sql`${booking.date} DESC`, asc(bookingSplit.id))
    .limit(500)
    .all();
}

/**
 * Split off: move the chosen splits of `categoryId` into an existing category or a new one
 * (created in the same audit group). Budget months stay where they are: money follows by an
 * explicit move in Plan › Monat.
 */
export function splitOffCategory(
  db: Executor,
  categoryId: string,
  splitIds: readonly string[],
  into:
    | { targetId: string }
    | {
        newCategory: CategoryFields;
        /** Target of the new category, stored in the same audit group. */
        target?: { target: TargetInput | null; validFrom: string };
      },
  ctx: AuditContext,
): { groupId: string; targetId: string; moved: number } {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    liveCategory(tx, categoryId);
    let targetId: string;
    if ('targetId' in into) targetId = liveCategory(tx, into.targetId).id;
    else {
      targetId = createCategory(tx, into.newCategory, grouped).id;
      if (into.target)
        setCategoryTarget(tx, targetId, into.target.target, into.target.validFrom, grouped);
    }
    if (targetId === categoryId) throw new CategoryRuleError('Wähle eine andere Kategorie.');
    const ids = [...new Set(splitIds)];
    const rows = ids.length
      ? tx
          .select({ id: bookingSplit.id })
          .from(bookingSplit)
          .innerJoin(booking, eq(booking.id, bookingSplit.bookingId))
          // Only splits of live bookings: a deleted booking is not re-categorised behind the back.
          .where(
            and(
              inArray(bookingSplit.id, ids),
              eq(bookingSplit.categoryId, categoryId),
              isNull(booking.deletedAt),
            ),
          )
          .all()
      : [];
    if (rows.length !== ids.length || ids.length === 0)
      throw new CategoryRuleError(
        'Die gewählten Buchungen gehören nicht (mehr) zu dieser Kategorie.',
      );
    for (const r of rows)
      updateTracked(tx, bookingSplit, [r.id], { categoryId: targetId }, grouped);
    return { groupId: grouped.groupId, targetId, moved: rows.length };
  });
}

export interface CategoryListing extends CategoryRow {
  splitCount: number;
}

/** Live groups and categories (hidden ones too) in list order, with the number of splits. */
export function categoryTree(db: Executor) {
  const groups = db
    .select()
    .from(categoryGroup)
    .where(isNull(categoryGroup.deletedAt))
    .orderBy(asc(categoryGroup.sortOrder), asc(categoryGroup.name))
    .all();
  const counts = new Map(
    db
      .select({ id: bookingSplit.categoryId, n: sql<number>`COUNT(*)`.mapWith(Number) })
      .from(bookingSplit)
      .innerJoin(booking, eq(booking.id, bookingSplit.bookingId))
      .where(isNull(booking.deletedAt))
      .groupBy(bookingSplit.categoryId)
      .all()
      .map((r) => [r.id, r.n]),
  );
  const categories: CategoryListing[] = db
    .select()
    .from(category)
    .where(isNull(category.deletedAt))
    .orderBy(asc(category.sortOrder), asc(category.name))
    .all()
    .map((c) => ({ ...c, splitCount: counts.get(c.id) ?? 0 }));
  const targets = db
    .select()
    .from(categoryTarget)
    .where(isNull(categoryTarget.deletedAt))
    .orderBy(asc(categoryTarget.validFrom))
    .all();
  return { groups, categories, targets };
}
