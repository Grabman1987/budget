import { isDeepStrictEqual } from 'node:util';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  account,
  appSetting,
  assignmentRule,
  auditLog,
  booking,
  bookingSplit,
  category,
  categoryGroup,
  categoryTarget,
  expectedPayment,
  payee,
  plannedEvent,
  savingsGoal,
  CATEGORY_CLASSES,
  CATEGORY_KINDS,
  OperatorInputError,
  CategoryRuleError,
  BookingInvariantError,
  ConflictError,
  EntityNotFoundError,
  assertLedgerInvariants,
  createCategory,
  createCategoryGroup,
  deleteCategoryGroup,
  getAssigned,
  getBooking,
  getEntity,
  inflationBasketSettings,
  listEntities,
  mergeCategories,
  renameCategoryGroup,
  runInTransaction,
  setAssigned,
  setCategoryHidden,
  softDeleteEntity,
  sortCategories,
  splitOffCategory,
  updateCategory,
  updateEntity,
  updateTracked,
  withGroup,
  type AuditContext,
  type Executor,
} from '@budget/db';
import { assertContactBookingWrite } from '../../../../packages/db/src/repos/contact-invariants';
import { assertStatementBookingWrite } from '../../../../packages/db/src/repos/statement-settlement-invariants';
import { assertTradeSettlementBookingWrite } from '../../../../packages/db/src/repos/invariants';

const name = z.string().trim().min(1).max(200);
// Repository writers collapse whitespace in new names; collision checks must use the same value.
const newName = name.transform((value) => value.replace(/\s+/g, ' '));
const cents = z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER);
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const list = <T extends z.ZodType>(item: T) => z.array(item).max(100_000);
const groupEntry = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('create'), name: newName }),
  z.strictObject({ action: z.literal('rename'), group: name, name: newName }),
  z.strictObject({ action: z.literal('delete'), group: name }),
]);
const categoryEntry = z.union([
  z.strictObject({
    action: z.literal('create'),
    name: newName,
    group: name,
    kind: z.enum(CATEGORY_KINDS).optional(),
    class: z.enum(CATEGORY_CLASSES).optional(),
    icon: name.nullable().optional(),
  }),
  z.strictObject({
    category: name,
    name: newName.optional(),
    group: name.optional(),
    hidden: z.boolean().optional(),
    icon: name.nullable().optional(),
  }),
]);
const restructureSchema = z.strictObject({
  groups: list(groupEntry).optional(),
  categories: list(categoryEntry).optional(),
  order: list(z.strictObject({ group: name, categories: list(name) })).optional(),
  splits: list(
    z.strictObject({ splitId: name, category: name, unlock: z.literal(true).optional() }),
  ).optional(),
  openings: list(z.strictObject({ category: name, availableCents: cents })).optional(),
  assigned: z
    .strictObject({
      entries: list(z.strictObject({ month, category: name, assignedCents: cents })),
      expectedDeltaByMonth: z.record(month, cents),
    })
    .optional(),
  merge: list(z.strictObject({ from: name, into: name })).optional(),
  retire: list(
    z.union([z.strictObject({ category: name }), z.strictObject({ group: name })]),
  ).optional(),
});
export type RestructureFile = z.infer<typeof restructureSchema>;
export function parseRestructureFile(json: unknown): RestructureFile {
  const parsed = restructureSchema.safeParse(json);
  if (!parsed.success)
    throw new OperatorInputError(
      parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    );
  return parsed.data;
}

export interface RestructureOutcome {
  section: keyof RestructureFile;
  key: string;
  status: 'created' | 'updated' | 'deleted' | 'unchanged' | 'skipped';
  reason: string;
  detail: string;
  groupId: string;
}
class Refusal extends Error {
  constructor(
    readonly reason: string,
    message: string,
  ) {
    super(message);
  }
}
class DryRunRollback extends Error {}
const refuse = (reason: string, detail: string): never => {
  throw new Refusal(reason, detail);
};

function one<T>(rows: T[], kind: string): T {
  if (rows.length !== 1)
    refuse(
      rows.length ? `ambiguous_${kind}` : `unknown_${kind}`,
      `Expected exactly one live ${kind} with this exact name`,
    );
  return rows[0]!;
}
function groupByName(tx: Executor, value: string) {
  return one(
    listEntities(tx, categoryGroup).filter((g) => g.name === value),
    'group',
  );
}
function categoryByName(tx: Executor, value: string) {
  const groups = new Map(listEntities(tx, categoryGroup).map((g) => [g.id, g.name]));
  return one(
    listEntities(tx, category).filter(
      (c) =>
        groups.has(c.groupId) &&
        (c.name === value || `${groups.get(c.groupId)} › ${c.name}` === value),
    ),
    'category',
  );
}
function assertNameFree(tx: Executor, value: string, groupId?: string, except?: string) {
  const found =
    groupId === undefined
      ? listEntities(tx, categoryGroup).some((g) => g.id !== except && g.name === value)
      : listEntities(tx, category).some(
          (c) => c.id !== except && c.groupId === groupId && c.name === value,
        );
  if (found) refuse('name_taken', 'The destination name already exists');
}

/** Conservative emptiness includes retained splits: restoring a booking must retain its category. */
function assertEmpty(tx: Executor, c: typeof category.$inferSelect) {
  if (c.kind === 'card_payment')
    refuse('card_category', 'A card payment category belongs to its account');
  if (
    c.openingAvailableCents !== 0 ||
    getAssigned(tx).some((m) => m.categoryId === c.id && m.assignedCents !== 0) ||
    tx
      .select({ id: bookingSplit.id })
      .from(bookingSplit)
      .where(eq(bookingSplit.categoryId, c.id))
      .get()
  )
    refuse(
      'category_not_empty',
      'Remove all split references, nonzero assignments and opening money first',
    );
}

function hasCategoryReference(value: unknown, id: string): boolean {
  if (Array.isArray(value)) return value.some((v) => hasCategoryReference(v, id));
  if (value === null || typeof value !== 'object') return false;
  return Object.entries(value).some(
    ([key, v]) => (key === 'categoryId' && v === id) || hasCategoryReference(v, id),
  );
}
function retireCategory(tx: Executor, c: typeof category.$inferSelect, ctx: AuditContext) {
  assertEmpty(tx, c);
  const references = [
    ...listEntities(tx, payee).filter((r) => r.defaultCategoryId === c.id),
    ...listEntities(tx, expectedPayment).filter((r) => r.categoryId === c.id),
    ...listEntities(tx, savingsGoal).filter((r) => r.categoryId === c.id),
    ...listEntities(tx, plannedEvent).filter((r) => r.categoryId === c.id),
    ...listEntities(tx, categoryTarget).filter((r) => r.categoryId === c.id),
    ...listEntities(tx, assignmentRule).filter(
      (r) =>
        r.categoryId === c.id ||
        hasCategoryReference(JSON.parse(r.actionJson), c.id) ||
        hasCategoryReference(JSON.parse(r.matchJson), c.id),
    ),
  ];
  if (references.length || inflationBasketSettings(tx).has(c.id))
    refuse('category_referenced', 'Merge the category to repoint its remaining references');
  softDeleteEntity(tx, category, c.id, ctx);
}

/** Only category ids may change on splits; all booking/account fields stay byte-for-byte equal. */
function ledgerSnapshot(tx: Executor) {
  return {
    accounts: tx.select().from(account).orderBy(account.id).all(),
    bookings: tx.select().from(booking).orderBy(booking.id).all(),
    splits: tx
      .select()
      .from(bookingSplit)
      .orderBy(bookingSplit.id)
      .all()
      .map((s) => ({ ...s, categoryId: null })),
  };
}

/** One run, one undo group. Entry refusals roll back to a savepoint; assigned is all-or-nothing. */
export function applyRestructure(
  db: Executor,
  input: RestructureFile,
  ctx: AuditContext,
  options: { dryRun?: boolean } = {},
): RestructureOutcome[] {
  const file = parseRestructureFile(input);
  const grouped = withGroup(ctx);
  const outcomes: RestructureOutcome[] = [];
  try {
    runInTransaction(db, (tx) => {
      const before = ledgerSnapshot(tx);
      const entry = (
        section: keyof RestructureFile,
        key: string,
        body: (inner: Executor) => RestructureOutcome['status'],
      ) => {
        try {
          const status = runInTransaction(tx, body);
          outcomes.push({
            section,
            key,
            status,
            reason: '',
            detail: '',
            groupId: status === 'unchanged' ? '' : grouped.groupId,
          });
        } catch (error) {
          if (!(
            error instanceof Refusal ||
            error instanceof CategoryRuleError ||
            error instanceof BookingInvariantError ||
            error instanceof ConflictError ||
            error instanceof EntityNotFoundError
          ))
            throw error;
          outcomes.push({
            section,
            key,
            status: 'skipped',
            reason: error instanceof Refusal ? error.reason : 'refused_by_rules',
            detail: error.message,
            groupId: '',
          });
        }
      };
      for (const e of file.groups ?? [])
        entry('groups', e.action === 'create' ? e.name : e.group, (t) => {
          if (e.action === 'create') {
            const existing = listEntities(t, categoryGroup).filter((g) => g.name === e.name);
            if (existing.length) {
              one(existing, 'group');
              return 'unchanged';
            }
            createCategoryGroup(t, e.name, grouped);
            return 'created';
          }
          const g = groupByName(t, e.group);
          if (e.action === 'delete') {
            deleteCategoryGroup(t, g.id, grouped);
            return 'deleted';
          }
          if (g.name === e.name) return 'unchanged';
          assertNameFree(t, e.name, undefined, g.id);
          renameCategoryGroup(t, g.id, e.name, grouped);
          return 'updated';
        });
      for (const e of file.categories ?? [])
        entry('categories', 'action' in e ? e.name : e.category, (t) => {
          if ('action' in e) {
            const groupId = groupByName(t, e.group).id;
            assertNameFree(t, e.name, groupId);
            createCategory(
              t,
              {
                name: e.name,
                groupId,
                ...(e.kind !== undefined && { kind: e.kind }),
                ...(e.class !== undefined && { class: e.class }),
                ...(e.icon !== undefined && { icon: e.icon }),
              },
              grouped,
            );
            return 'created';
          }
          const c = categoryByName(t, e.category);
          const groupId = e.group === undefined ? c.groupId : groupByName(t, e.group).id;
          assertNameFree(t, e.name ?? c.name, groupId, c.id);
          const changed =
            (e.name !== undefined && e.name !== c.name) ||
            groupId !== c.groupId ||
            (e.icon !== undefined && e.icon !== c.icon) ||
            (e.hidden !== undefined && e.hidden !== (c.hiddenAt !== null));
          if (!changed) return 'unchanged';
          updateCategory(
            t,
            c.id,
            { name: e.name ?? c.name, groupId, ...(e.icon !== undefined && { icon: e.icon }) },
            grouped,
          );
          if (e.hidden !== undefined) setCategoryHidden(t, c.id, e.hidden, grouped);
          return 'updated';
        });
      if (file.order)
        entry('order', 'full order', (t) => {
          const groups = listEntities(t, categoryGroup),
            categories = listEntities(t, category);
          const order = file.order!.map((e) => {
            const g = groupByName(t, e.group);
            const ids = e.categories.map((n) => categoryByName(t, n));
            if (ids.some((c) => c.groupId !== g.id))
              refuse('invalid_order', 'Move categories in the categories section first');
            return { id: g.id, categoryIds: ids.map((c) => c.id) };
          });
          const ids = order.flatMap((g) => g.categoryIds);
          if (
            order.length !== groups.length ||
            new Set(order.map((g) => g.id)).size !== groups.length ||
            ids.length !== categories.length ||
            new Set(ids).size !== categories.length
          )
            refuse(
              'incomplete_order',
              'List every live group and category, including hidden ones, exactly once',
            );
          if (
            order.every(
              (g, gi) =>
                groups.find((r) => r.id === g.id)!.sortOrder === gi &&
                g.categoryIds.every(
                  (id, ci) => categories.find((r) => r.id === id)!.sortOrder === ci,
                ),
            )
          )
            return 'unchanged';
          sortCategories(t, order, grouped);
          return 'updated';
        });
      for (const e of file.splits ?? [])
        entry('splits', e.splitId, (t) => {
          const s = t.select().from(bookingSplit).where(eq(bookingSplit.id, e.splitId)).get();
          const b = s && getBooking(t, s.bookingId);
          if (!s || !b) return refuse('unknown_split', 'No live booking has this split');
          const target = categoryByName(t, e.category);
          if (s.categoryId === target.id) return 'unchanged';
          if (target.kind === 'card_payment')
            refuse(
              'card_category',
              'Card payment envelopes are funded automatically, not by split assignment',
            );
          if (s.contactId && target.kind !== 'advance')
            refuse('contact_category', 'A contact split must retain an advance category');
          if (b.status === 'reconciled' && !e.unlock)
            refuse('reconciled_locked', 'Set unlock: true for this split');
          assertContactBookingWrite(t, b.id, 'update', ['splits']);
          assertStatementBookingWrite(t, b.id, 'update', ['splits']);
          assertTradeSettlementBookingWrite(t, b.id, 'update', ['splits']);
          if (s.incomeTypeId)
            refuse('income_split', 'A typed income split cannot acquire a category');
          // splitOffCategory supports both whole and split-level transfers without replacing legs.
          if (s.categoryId)
            splitOffCategory(t, s.categoryId, [s.id], { targetId: target.id }, grouped);
          else updateTracked(t, bookingSplit, [s.id], { categoryId: target.id }, grouped);
          assertLedgerInvariants(t, [b.id]);
          return 'updated';
        });
      for (const e of file.openings ?? [])
        entry('openings', e.category, (t) => {
          const c = categoryByName(t, e.category);
          if (c.openingAvailableCents === e.availableCents) return 'unchanged';
          updateEntity(t, category, c.id, { openingAvailableCents: e.availableCents }, grouped);
          return 'updated';
        });
      if (file.assigned)
        entry('assigned', 'all months', (t) => {
          const a = file.assigned!;
          const initial = getAssigned(t);
          const seen = new Set<string>();
          const expected = new Map(
            Object.entries(a.expectedDeltaByMonth).map(([m, v]) => [m, BigInt(v)]),
          );
          const delta = new Map<string, bigint>();
          for (const e of a.entries)
            runInTransaction(t, (inner) => {
              const c = categoryByName(inner, e.category);
              const key = `${e.month}/${c.id}`;
              if (seen.has(key))
                refuse('duplicate_assignment', 'A month/category may be assigned only once');
              seen.add(key);
              const previous =
                initial.find((r) => r.month === e.month && r.categoryId === c.id)?.assignedCents ??
                0;
              delta.set(
                e.month,
                (delta.get(e.month) ?? 0n) + BigInt(e.assignedCents) - BigInt(previous),
              );
              setAssigned(inner, c.id, e.month, e.assignedCents, grouped);
            });
          if (
            [...delta.keys()].some((m) => !expected.has(m)) ||
            [...expected].some(([m, value]) => (delta.get(m) ?? 0n) !== value)
          )
            refuse(
              'assigned_invariant',
              'Every touched month needs its exact expected total assigned delta; the entire assigned section was rolled back',
            );
          return isDeepStrictEqual(initial, getAssigned(t)) ? 'unchanged' : 'updated';
        });
      for (const e of file.merge ?? [])
        entry('merge', e.from, (t) => {
          const source = categoryByName(t, e.from),
            target = categoryByName(t, e.into);
          if (source.id === target.id) refuse('same_category', 'Choose a different target');
          assertEmpty(t, source);
          const basket = inflationBasketSettings(t);
          const sourceSetting = basket.get(source.id),
            targetSetting = basket.get(target.id);
          if (sourceSetting && targetSetting && !isDeepStrictEqual(sourceSetting, targetSetting))
            refuse(
              'basket_conflict',
              'Source and destination basket policies differ; resolve them before merging',
            );
          mergeCategories(t, [source.id], target.id, grouped);
          // The shared merge rewrites live split rules. Retained rules must also be safe to restore.
          for (const rule of listEntities(t, assignmentRule, { includeDeleted: true })) {
            const actions: unknown = JSON.parse(rule.actionJson);
            if (!hasCategoryReference(actions, source.id)) continue;
            const actionJson = JSON.stringify(actions, (key, value: unknown) =>
              key === 'categoryId' && value === source.id ? target.id : value,
            );
            updateTracked(t, assignmentRule, [rule.id], { actionJson }, grouped);
          }
          if (sourceSetting) {
            // The basket writer only upserts; moving a key needs the existing audited settings writer.
            const stored = getEntity(t, appSetting, 'inflation.basket')!;
            const values = JSON.parse(stored.value) as Record<string, unknown>;
            values[target.id] = values[source.id];
            delete values[source.id];
            updateEntity(t, appSetting, stored.id, { value: JSON.stringify(values) }, grouped);
          }
          return 'deleted';
        });
      for (const e of file.retire ?? [])
        entry('retire', 'category' in e ? e.category : e.group, (t) => {
          if ('category' in e) retireCategory(t, categoryByName(t, e.category), grouped);
          else deleteCategoryGroup(t, groupByName(t, e.group).id, grouped);
          return 'deleted';
        });
      if (!isDeepStrictEqual(before, ledgerSnapshot(tx)))
        throw new Error(
          'Restructure changed protected ledger values; the entire run was rolled back',
        );
      // Catch unexpected assignment writes outside the guarded section as a run-level invariant.
      if (file.assigned) {
        const rows = tx
          .select()
          .from(auditLog)
          .where(
            and(eq(auditLog.groupId, grouped.groupId), eq(auditLog.entityType, 'envelope_month')),
          )
          .all();
        const delta = new Map<string, bigint>();
        for (const row of rows) {
          const b = row.beforeJson ? JSON.parse(row.beforeJson) : null;
          const a = row.afterJson ? JSON.parse(row.afterJson) : null;
          const m = String(a?.month ?? b?.month);
          delta.set(
            m,
            (delta.get(m) ?? 0n) +
              BigInt(a && !a.deleted_at ? a.assigned_cents : 0) -
              BigInt(b && !b.deleted_at ? b.assigned_cents : 0),
          );
        }
        const refused = outcomes.some((o) => o.section === 'assigned' && o.status === 'skipped');
        if (
          [...delta].some(
            ([m, v]) => v !== BigInt(refused ? 0 : (file.assigned!.expectedDeltaByMonth[m] ?? 0)),
          )
        )
          throw new Error('Unexpected run-level assignment delta; the entire run was rolled back');
      }
      if (options.dryRun) throw new DryRunRollback();
    });
  } catch (error) {
    if (!(error instanceof DryRunRollback)) throw error;
  }
  return options.dryRun ? outcomes.map((o) => ({ ...o, groupId: '' })) : outcomes;
}
