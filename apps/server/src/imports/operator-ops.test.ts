import {
  applyMoves,
  category,
  createTestDatabase,
  envelopeMonth,
  getAssigned,
  importRun,
  listAuditGroups,
  moveMoney,
  parseGroupsFile,
  planGroupMoves,
  undoAuditGroups,
  type Db,
} from '@budget/db';
import type { TargetModel } from '@budget/import-ynab';
import { and, eq, isNull } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { ImportStateError, revertImport, writeImport } from './commit';

/**
 * The operator round trip on a synthetic ledger: the owner moved money in an imported plan, the
 * import has to be reverted and imported again (`docs/ops.md`, "Revert a run when the owner has
 * budgeted on top of it"). Names and amounts are made up.
 */

const SINCE = '2024-01-01T00:00:00.000Z';
const OCT = '2026-10';
const NOV = '2026-11';
const owner = { actor: 'owner' };
const operator = { actor: 'operator' };

let db: Db;

const target = (): TargetModel => ({
  startMonth: '2026-09',
  months: ['2026-09', OCT, NOV],
  accounts: [
    {
      id: 'acc',
      ynabName: 'Synthetic checking',
      name: 'Synthetic checking',
      type: 'checking',
      onBudget: true,
      closedAt: null,
      openingDate: '2026-09-01',
      openingBalanceCents: 500_000,
      adjustments: [],
    },
  ],
  categories: ['Alpha', 'Beta', 'Gamma', 'Delta'].map((name) => ({
    id: `cat-${name}`,
    name,
    group: 'Synthetic group',
    kind: 'variable' as const,
    class: 'need' as const,
    hidden: false,
    cardAccountId: null,
    sources: [name],
  })),
  bookings: [],
  assigned: {
    [OCT]: { 'cat-Alpha': 100_000, 'cat-Beta': 60_000, 'cat-Gamma': 30_000, 'cat-Delta': 0 },
    [NOV]: { 'cat-Alpha': 90_000, 'cat-Beta': 50_000 },
  },
  openingCarry: {},
  contacts: [],
  expectedPayments: [],
  targets: [],
  moved: [],
  shifts: [],
});

function importRunOf(runId: string, committedAt: string) {
  db.insert(importRun).values({ id: runId, source: 'ynab', status: 'staged' }).run();
  const written = writeImport(db, {
    runId,
    target: target(),
    keys: new Map(),
    previous: { accounts: {}, categories: {} },
    deleteMissing: false,
    actor: 'tester',
    today: '2026-10-02',
  });
  db.update(importRun)
    .set({ status: 'committed', committedAt })
    .where(eq(importRun.id, runId))
    .run();
  return written.ids;
}

/** Assigned amounts of live categories by name and month. */
function assignedByName() {
  const names = new Map(
    db
      .select({ id: category.id, name: category.name })
      .from(category)
      .where(isNull(category.deletedAt))
      .all()
      .map((c) => [c.id, c.name]),
  );
  const out: Record<string, number> = {};
  for (const r of getAssigned(db))
    if (names.has(r.categoryId) && r.assignedCents !== 0)
      out[`${names.get(r.categoryId)} ${r.month}`] = r.assignedCents;
  return out;
}

beforeEach(() => {
  db = createTestDatabase().db;
});

describe('operator round trip: moves, list-groups, undo-group, revert, re-import, move-money', () => {
  it('reverts an import the owner budgeted on and re-applies the moves by name', () => {
    const ids = importRunOf('run-1', '2026-10-01T10:00:00.000Z');
    const imported = assignedByName();
    expect(imported['Alpha 2026-10']).toBe(100_000);

    // The owner's moves in the app: each its own audit group (the API's `moveMoney`).
    const move = (month: string, from: string, to: string, cents: number) =>
      moveMoney(
        db,
        month,
        ids.categories[`cat-${from}`]!,
        ids.categories[`cat-${to}`]!,
        cents,
        owner,
      );
    move(OCT, 'Alpha', 'Beta', 12_345);
    move(OCT, 'Beta', 'Gamma', 2_000);
    move(OCT, 'Gamma', 'Delta', 31_000); // Delta had no row: the move creates it
    move(NOV, 'Alpha', 'Beta', 5_000);
    const budgeted = assignedByName();
    expect(budgeted['Delta 2026-10']).toBe(31_000);

    // The revert is refused while the owner's assignments sit on the run's categories.
    expect(() => revertImport(db, 'run-1', 'operator')).toThrow(ImportStateError);

    // list-groups: only the four moves, no import group, in the file format.
    const listed = listAuditGroups(db, { since: SINCE, entity: 'envelope_month' });
    expect(listed).toHaveLength(4);
    expect(listed.every((g) => !g.groupId.startsWith('import:'))).toBe(true);
    const file = parseGroupsFile(
      JSON.parse(JSON.stringify(listed.map(({ groupId, ts, moves }) => ({ groupId, ts, moves })))),
    );
    expect(file[0]!.moves).toEqual([
      { category: 'Alpha', month: OCT, deltaCents: -12_345 },
      { category: 'Beta', month: OCT, deltaCents: 12_345 },
    ]);

    // undo-group: all four, one transaction. A dry run first changes nothing.
    const groupIds = listed.map((g) => g.groupId);
    expect(undoAuditGroups(db, groupIds, operator, { dryRun: true })).toHaveLength(4);
    expect(assignedByName()).toEqual(budgeted);
    expect(undoAuditGroups(db, groupIds, operator).map((d) => d.groupId)).toEqual(
      [...groupIds].reverse(),
    );
    expect(assignedByName()).toEqual(imported);
    expect(listAuditGroups(db, { since: SINCE, entity: 'envelope_month' })).toEqual([]);

    // The revert is no longer blocked; then the same export is imported again (new categories).
    revertImport(db, 'run-1', 'operator');
    expect(assignedByName()).toEqual({});
    importRunOf('run-2', '2026-10-02T10:00:00.000Z');
    expect(assignedByName()).toEqual(imported);
    const newAlpha = db
      .select({ id: category.id })
      .from(category)
      .where(and(eq(category.name, 'Alpha'), isNull(category.deletedAt)))
      .get()!.id;
    expect(newAlpha).not.toBe(ids.categories['cat-Alpha']);

    // move-money --file: the moves are applied again by category name, one audit group each.
    const plan = planGroupMoves(file);
    expect(plan.skipped).toEqual([]);
    expect(plan.moves).toHaveLength(4);
    const done = applyMoves(db, plan, operator);
    expect(new Set(done.map((d) => d.groupId)).size).toBe(4);
    expect(assignedByName()).toEqual(budgeted);

    // Each re-applied move is a group of its own that the app's undo machinery can list again.
    const again = listAuditGroups(db, { since: SINCE, entity: 'envelope_month' }).filter(
      (g) => g.actor === 'operator',
    );
    expect(again.map((g) => g.moves)).toEqual(listed.map((g) => g.moves));
    expect(
      db
        .select()
        .from(envelopeMonth)
        .where(and(eq(envelopeMonth.categoryId, newAlpha), eq(envelopeMonth.month, OCT)))
        .get()?.assignedCents,
    ).toBe(100_000 - 12_345);
  }, 60_000);
});
