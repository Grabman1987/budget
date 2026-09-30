import {
  account,
  assertLedgerInvariants,
  auditLog,
  booking,
  bookingSplit,
  budget,
  category,
  categoryGroup,
  CLASSLESS_KINDS,
  contact,
  createEntity,
  deleteBooking,
  envelopeMonth,
  insertManyTracked,
  BookingInvariantError,
  importRun,
  incomeType,
  payee,
  project,
  ReconciledLockedError,
  runInTransaction,
  setAssigned,
  SYSTEM_PAYEE_IDS,
  transfer,
  undo,
  updateTracked,
  type Executor,
  type GroupedContext,
} from '@budget/db';
import { budgetMonths } from '@budget/domain';
import { budgetInputOf, type TargetBooking, type TargetModel } from '@budget/import-ynab';
import { and, desc, eq, gt, gte, inArray, isNotNull, isNull, ne, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

/**
 * The target layer of a YNAB import run (`docs/migration/ynab-export.md` §Import run and checks):
 * everything is written in one transaction under the audit group `import:<run id>`, so the run is
 * reverted as a whole by `undo`. Bookings carry `source: 'migration'`, the run id and an import
 * key; a later run of a newer export skips the keys it already finds (also soft-deleted ones: a
 * booking the owner deleted is not imported again), updates status and flag of the same keys and
 * lists the bookings of earlier runs its export no longer has (`missing`), which are deleted only
 * when the owner confirms. The dry run is the same write in a transaction that is rolled back, so
 * its report is exactly what the commit would do.
 */

export const importGroup = (runId: string): string => `import:${runId}`;

/** Mapping ids (accounts, target categories) → database ids, carried from run to run. */
export interface IdMap {
  accounts: Record<string, string>;
  categories: Record<string, string>;
}

export interface MissingBooking {
  id: string;
  accountId: string;
  date: string;
  amountCents: number;
  payee: string | null;
}

export interface ChangeReport {
  bookings: {
    added: number;
    unchanged: number;
    /** Same key, status or flag changed. */
    updated: number;
    /** A transfer leg whose other leg exists already (or was deleted): left alone. */
    skipped: number;
    /** Imported by earlier runs, not in this export; deleted only with `deleteMissing`. */
    missing: MissingBooking[];
    deleted: number;
  };
  accounts: { created: number; reused: number; updated: number };
  categories: { created: number; reused: number; updated: number };
  payees: { created: number };
  assigned: { changed: number };
  /** Spending categories without a class in the mapping got "Bedarf". */
  classDefaulted: number;
}

/** The app's budget after the write against the target model's own budget (Gate 2 in the DB). */
export interface LedgerDifference {
  month: string;
  /** Target category id; absent for "Zu verteilen". */
  category?: string;
  expectedCents: number;
  actualCents: number;
}

export interface WriteInput {
  runId: string;
  target: TargetModel;
  /** Raw booking id → import key (`importKeys`). */
  keys: ReadonlyMap<string, string>;
  /** Ids of the latest committed run. */
  previous: IdMap;
  deleteMissing: boolean;
  actor: string;
}

export interface WriteResult {
  report: ChangeReport;
  ids: IdMap;
  ledger: LedgerDifference[];
}

const ROLE = {
  checking: 'budget',
  cash: 'budget',
  savings: 'reserve',
  credit_card: 'budget',
  loan: 'debt',
  brokerage: 'investment',
  crypto: 'investment',
  p2p: 'investment',
  receivable: 'receivable',
  other_asset: 'investment',
  other_liability: 'debt',
} as const;
const FLAG = {
  Red: 'red',
  Orange: 'orange',
  Yellow: 'yellow',
  Green: 'green',
  Blue: 'blue',
  Purple: 'purple',
} as const;
const HIDDEN_GROUP = 'Hidden Categories';
const CHUNK = 500;

const norm = (name: string) => name.replace(/\s+/g, ' ').trim();
const nameKey = (name: string) => norm(name).toLowerCase();

type Named = typeof payee | typeof contact | typeof project | typeof categoryGroup;

/** Live rows of a table with a name, looked up by name (ignoring case); missing ones are created. */
function namedRows(tx: Executor, table: Named, ctx: GroupedContext) {
  const t = table as typeof project;
  const rows = new Map(
    tx
      .select({ id: t.id, name: t.name })
      .from(t)
      .where(isNull(t.deletedAt))
      .all()
      .map((r) => [nameKey(r.name), r.id]),
  );
  let created = 0;
  return {
    get created() {
      return created;
    },
    id(name: string, extra: Record<string, unknown> = {}): string {
      const found = rows.get(nameKey(name));
      if (found) return found;
      const id = randomUUID();
      createEntity(tx, t, { id, name: norm(name), ...extra }, ctx);
      rows.set(nameKey(name), id);
      created += 1;
      return id;
    },
  };
}

/** The ids of the latest committed run of a source, for re-imports. */
export function previousIds(db: Executor, exceptRunId?: string): IdMap {
  const row = db
    .select({ summaryJson: importRun.summaryJson })
    .from(importRun)
    .where(
      and(
        eq(importRun.status, 'committed'),
        exceptRunId ? ne(importRun.id, exceptRunId) : undefined,
      ),
    )
    .orderBy(desc(importRun.committedAt))
    .get();
  const ids = row?.summaryJson ? (JSON.parse(row.summaryJson) as { ids?: IdMap }).ids : undefined;
  return ids ?? { accounts: {}, categories: {} };
}

/** Write the target model (see the module comment). Runs inside the caller's transaction. */
export function writeImport(tx: Executor, input: WriteInput): WriteResult {
  const { runId, target, keys } = input;
  const ctx: GroupedContext = { actor: input.actor, groupId: importGroup(runId) };
  const report: ChangeReport = {
    bookings: { added: 0, unchanged: 0, updated: 0, skipped: 0, missing: [], deleted: 0 },
    accounts: { created: 0, reused: 0, updated: 0 },
    categories: { created: 0, reused: 0, updated: 0 },
    payees: { created: 0 },
    assigned: { changed: 0 },
    classDefaulted: 0,
  };
  const ids: IdMap = { accounts: { ...input.previous.accounts }, categories: {} };
  const live = <T extends typeof account | typeof category>(table: T, id: string | undefined) =>
    id === undefined
      ? undefined
      : tx
          .select()
          .from(table as typeof account)
          .where(and(eq(table.id, id), isNull(table.deletedAt)))
          .get();

  // Accounts: reused from the previous run, else created; opening values follow the export.
  target.accounts.forEach((a, index) => {
    const found = live(account, input.previous.accounts[a.id]);
    if (found) {
      report.accounts.reused += 1;
      const patch = { openingBalanceCents: a.openingBalanceCents, openingDate: a.openingDate };
      if (updateTracked(tx, account, [found.id], patch, ctx)) report.accounts.updated += 1;
      ids.accounts[a.id] = found.id;
      return;
    }
    const id = randomUUID();
    createEntity(
      tx,
      account,
      {
        id,
        name: norm(a.name),
        type: a.type,
        role: a.type === 'savings' && !a.onBudget ? 'reserve' : ROLE[a.type],
        onBudget: a.onBudget,
        openingBalanceCents: a.openingBalanceCents,
        openingDate: a.openingDate,
        closedAt: a.closedAt,
        sortOrder: index,
      },
      ctx,
    );
    ids.accounts[a.id] = id;
    report.accounts.created += 1;
  });
  const accountId = (id: string) => ids.accounts[id] as string;

  // Groups and categories.
  const created: string[] = [];
  const groups = namedRows(tx, categoryGroup, ctx);
  const now = new Date().toISOString();
  target.categories.forEach((c, index) => {
    const opening = target.openingCarry[c.id] ?? 0;
    const found = live(category, input.previous.categories[c.id]);
    if (found) {
      report.categories.reused += 1;
      if (updateTracked(tx, category, [found.id], { openingAvailableCents: opening }, ctx))
        report.categories.updated += 1;
      ids.categories[c.id] = found.id;
      return;
    }
    const classless = (CLASSLESS_KINDS as readonly string[]).includes(c.kind);
    if (!classless && c.class === null) report.classDefaulted += 1;
    const id = randomUUID();
    createEntity(
      tx,
      category,
      {
        id,
        name: norm(c.name),
        groupId: groups.id(c.group.trim() === HIDDEN_GROUP ? 'Ausgeblendet' : c.group),
        kind: c.kind,
        class: classless ? null : (c.class ?? 'need'),
        cardAccountId: c.cardAccountId === null ? null : accountId(c.cardAccountId),
        openingAvailableCents: opening,
        hiddenAt: c.hidden ? now : null,
        sortOrder: index,
      },
      ctx,
    );
    ids.categories[c.id] = id;
    created.push(id);
    report.categories.created += 1;
  });
  const categoryId = (id: string | null) => (id === null ? null : (ids.categories[id] ?? null));

  // Bookings: which keys exist already (on any of the target accounts, also soft-deleted).
  const keyOf = (b: TargetBooking) => `${accountId(b.accountId)}|${keys.get(b.id) as string}`;
  const existing = new Map<string, typeof booking.$inferSelect>();
  const allKeys = [...new Set(target.bookings.map((b) => keys.get(b.id) as string))];
  for (let i = 0; i < allKeys.length; i += CHUNK)
    for (const row of tx
      .select()
      .from(booking)
      .where(inArray(booking.importKey, allKeys.slice(i, i + CHUNK)))
      .all())
      existing.set(`${row.accountId}|${row.importKey}`, row);

  // A transfer is added only with both legs; one leg alone is left out.
  const legs = new Map<string, TargetBooking[]>();
  for (const b of target.bookings)
    for (const s of b.splits)
      if (s.transferId) legs.set(s.transferId, [...(legs.get(s.transferId) ?? []), b]);
  const skip = new Set<string>();
  for (const pair of legs.values()) {
    const fresh = pair.filter((b) => !existing.has(keyOf(b)));
    if (fresh.length > 0 && fresh.length < pair.length) for (const b of fresh) skip.add(b.id);
  }

  const payees = namedRows(tx, payee, ctx);
  const contacts = namedRows(tx, contact, ctx);
  const projects = namedRows(tx, project, ctx);
  const incomeTypes = new Map(
    tx
      .select({ id: incomeType.id, name: incomeType.name })
      .from(incomeType)
      .where(isNull(incomeType.deletedAt))
      .all()
      .flatMap((r) => [
        [r.id, r.id],
        [nameKey(r.name), r.id],
      ]),
  );
  const incomeTypeId = (name: string | null) => {
    if (name === null) return null;
    const found = incomeTypes.get(name) ?? incomeTypes.get(nameKey(name));
    if (found) return found;
    const id = randomUUID();
    createEntity(tx, incomeType, { id, name: norm(name) }, ctx);
    incomeTypes.set(nameKey(name), id);
    return id;
  };
  const payeeId = (b: TargetBooking) => {
    if (b.systemPayee) return SYSTEM_PAYEE_IDS[b.systemPayee].id;
    if (b.splits.length === 1 && b.splits[0]?.transferId) return null;
    if (b.payee.trim() === '' || b.payee.startsWith('Transfer : ')) return null;
    return payees.id(b.payee, b.contact ? { contactId: contacts.id(b.contact) } : {});
  };

  // New bookings go in by chunks (one `create` entry per row, as the repository writes them); the
  // split sums and transfer pairs are checked afterwards like after any booking write.
  const kinds = new Map(
    tx
      .select({ id: category.id, kind: category.kind })
      .from(category)
      .all()
      .map((c) => [c.id, c.kind]),
  );
  const transferOf = new Map<string, string>();
  for (const [key, pair] of legs)
    if (pair.every((b) => !skip.has(b.id) && !existing.has(keyOf(b))))
      transferOf.set(key, randomUUID());
  const rows: (typeof booking.$inferInsert)[] = [];
  const splitRows: (typeof bookingSplit.$inferInsert)[] = [];
  for (const b of target.bookings) {
    const found = existing.get(keyOf(b));
    if (skip.has(b.id)) {
      report.bookings.skipped += 1;
      continue;
    }
    const flag = b.flag === '' ? null : FLAG[b.flag as keyof typeof FLAG];
    if (found) {
      const changes = found.status !== b.status || found.flag !== flag;
      if (found.deletedAt === null && found.status !== 'reconciled' && changes) {
        updateTracked(tx, booking, [found.id], { status: b.status, flag }, ctx);
        report.bookings.updated += 1;
      } else report.bookings.unchanged += 1;
      continue;
    }
    const id = randomUUID();
    const single = b.splits.length === 1;
    const project = b.splits.find((s) => s.project)?.project ?? null;
    const whole = single && b.splits[0]?.transferId ? transferOf.get(b.splits[0].transferId) : null;
    rows.push({
      id,
      accountId: accountId(b.accountId),
      date: b.date,
      amountCents: b.amountCents,
      payeeId: payeeId(b),
      memo: (single ? b.splits[0]?.memo : b.memo) || null,
      status: b.status,
      flag,
      transferId: whole ?? null,
      source: 'migration',
      importKey: keys.get(b.id) as string,
      importRunId: runId,
      projectId: project === null ? null : projects.id(project),
    });
    b.splits.forEach((s, i) => {
      const cat = categoryId(s.categoryId);
      if (cat !== null && kinds.get(cat) === 'card_payment')
        throw new BookingInvariantError(
          `Line ${b.line}: a card payment envelope takes no bookings`,
        );
      if (s.contact !== null && (cat === null || kinds.get(cat) !== 'advance'))
        throw new BookingInvariantError(
          `Line ${b.line}: a contact share needs an advance category`,
        );
      splitRows.push({
        id: randomUUID(),
        bookingId: id,
        categoryId: cat,
        amountCents: s.amountCents,
        memo: single ? null : s.memo || null,
        contactId: s.contact === null ? null : contacts.id(s.contact),
        incomeTypeId: incomeTypeId(s.incomeType),
        transferId: !single && s.transferId ? (transferOf.get(s.transferId) ?? null) : null,
        sortOrder: i,
      });
    });
    report.bookings.added += 1;
  }
  report.payees.created = payees.created;
  const transfers = [...transferOf.values()].map((id) => ({ id }));
  for (let i = 0; i < transfers.length; i += CHUNK)
    tx.insert(transfer)
      .values(transfers.slice(i, i + CHUNK))
      .run();
  insertManyTracked(tx, booking, rows, ctx);
  insertManyTracked(tx, bookingSplit, splitRows, ctx);
  assertLedgerInvariants(
    tx,
    rows.map((r) => r.id),
  );

  // Bookings of earlier runs that this export no longer has (from the start month on).
  const accountIds = Object.values(ids.accounts);
  const inExport = new Set(target.bookings.map(keyOf));
  const names = new Map(
    tx
      .select({ id: payee.id, name: payee.name })
      .from(payee)
      .all()
      .map((p) => [p.id, p.name]),
  );
  report.bookings.missing = tx
    .select()
    .from(booking)
    .where(
      and(
        eq(booking.source, 'migration'),
        isNull(booking.deletedAt),
        isNotNull(booking.importKey),
        inArray(booking.accountId, accountIds.length > 0 ? accountIds : ['']),
        gte(booking.date, `${target.startMonth}-01`),
      ),
    )
    .all()
    .filter((r) => !inExport.has(`${r.accountId}|${r.importKey}`))
    .map((r) => ({
      id: r.id,
      accountId: r.accountId,
      date: r.date,
      amountCents: r.amountCents,
      payee: r.payeeId === null ? null : (names.get(r.payeeId) ?? null),
    }));
  if (input.deleteMissing)
    for (const m of report.bookings.missing) {
      const still = tx.select().from(booking).where(eq(booking.id, m.id)).get();
      if (still?.deletedAt !== null) continue;
      try {
        deleteBooking(tx, m.id, ctx);
        report.bookings.deleted += 1;
      } catch (error) {
        if (!(error instanceof ReconciledLockedError)) throw error;
      }
    }

  // Assigned amounts per month: the export's figures, also negative ones; missing ones become 0.
  const catIds = Object.values(ids.categories);
  const assigned = new Map(
    tx
      .select()
      .from(envelopeMonth)
      .where(
        and(
          inArray(envelopeMonth.categoryId, catIds.length > 0 ? catIds : ['']),
          isNull(envelopeMonth.deletedAt),
          gte(envelopeMonth.month, target.startMonth),
        ),
      )
      .all()
      .map((r) => [`${r.categoryId}|${r.month}`, r.assignedCents]),
  );
  const wanted = new Map<string, number>();
  for (const [month, row] of Object.entries(target.assigned))
    for (const [id, cents] of Object.entries(row)) {
      const dbId = categoryId(id);
      if (dbId !== null) wanted.set(`${dbId}|${month}`, cents);
    }
  for (const key of assigned.keys()) if (!wanted.has(key)) wanted.set(key, 0);
  // Months of categories created now are new rows (bulk); the others go through `setAssigned`.
  const fresh: (typeof envelopeMonth.$inferInsert)[] = [];
  const createdIds = new Set(created);
  for (const [key, cents] of wanted) {
    if ((assigned.get(key) ?? 0) === cents) continue;
    const [dbId, month] = key.split('|') as [string, string];
    if (createdIds.has(dbId)) fresh.push({ categoryId: dbId, month, assignedCents: cents });
    else setAssigned(tx, dbId, month, cents, ctx);
    report.assigned.changed += 1;
  }
  insertManyTracked(tx, envelopeMonth, fresh, ctx);

  return { report, ids, ledger: ledgerDifferences(tx, target, ids) };
}

/** The app's `budget` after the write against `budgetMonths` of the target model. */
export function ledgerDifferences(
  tx: Executor,
  target: TargetModel,
  ids: IdMap,
): LedgerDifference[] {
  // Scheduled bookings are pending bookings in the app and count in their month like any other.
  const bookings = target.bookings.map((b) => ({ ...b, scheduled: false }));
  const expected = budgetMonths(budgetInputOf({ ...target, bookings }));
  const actual = new Map(budget(tx, target.months).map((m) => [m.month, m]));
  const out: LedgerDifference[] = [];
  for (const e of expected) {
    const a = actual.get(e.month);
    const push = (category: string | undefined, expectedCents: number, actualCents: number) => {
      if (expectedCents !== actualCents)
        out.push({ month: e.month, ...(category && { category }), expectedCents, actualCents });
    };
    push(undefined, e.toBeAssignedCents, a?.toBeAssignedCents ?? 0);
    for (const [id, env] of Object.entries(e.envelopes))
      push(id, env.availableCents, a?.envelopes[ids.categories[id] ?? '']?.availableCents ?? 0);
  }
  return out;
}

class Rollback extends Error {
  constructor(readonly result: WriteResult) {
    super('dry run');
  }
}

/** The write in a transaction that is rolled back: the report of what a commit would do. */
export function dryRunImport(db: Executor, input: WriteInput): WriteResult {
  try {
    runInTransaction(db, (tx) => {
      throw new Rollback(writeImport(tx, input));
    });
  } catch (error) {
    if (error instanceof Rollback) return error.result;
    throw error;
  }
  throw new Error('unreachable');
}

export class ImportStateError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Revert a committed run as a whole: `undo` of its audit group (refused when something it wrote
 * was changed later, unless `force`), then the import keys of its bookings are retired so the same
 * export can be committed again. Only the newest committed run can be reverted.
 */
export function revertImport(
  db: Executor,
  runId: string,
  actor: string,
  options: { force?: boolean } = {},
): void {
  runInTransaction(db, (tx) => {
    const run = tx.select().from(importRun).where(eq(importRun.id, runId)).get();
    if (!run || run.status !== 'committed')
      throw new ImportStateError('not_committed', 'Only a committed run can be reverted');
    const newer = tx
      .select({ id: importRun.id })
      .from(importRun)
      .where(
        and(
          eq(importRun.status, 'committed'),
          ne(importRun.id, runId),
          gt(importRun.committedAt, run.committedAt ?? ''),
        ),
      )
      .get();
    if (newer) throw new ImportStateError('newer_run', 'Revert the newer import run first');
    const written = tx
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(eq(auditLog.groupId, importGroup(runId)))
      .get();
    if (written) undo(tx, { groupId: importGroup(runId) }, { actor }, options);
    // Retire the keys of the run's bookings so the same export can be committed again. This is
    // bookkeeping of the run (one statement, not in the change log): the bookings stay deleted.
    tx.update(booking)
      .set({ importKey: sql`${booking.importKey} || ${`~reverted:${runId}`}` })
      .where(
        and(
          eq(booking.importRunId, runId),
          isNotNull(booking.deletedAt),
          isNotNull(booking.importKey),
        ),
      )
      .run();
    tx.update(importRun)
      .set({ status: 'reverted', revertedAt: new Date().toISOString() })
      .where(eq(importRun.id, runId))
      .run();
  });
}
