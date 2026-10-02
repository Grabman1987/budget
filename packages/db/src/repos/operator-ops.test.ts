import { sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { auditLog } from '../schema';
import { undo } from './audit';
import {
  applyMoves,
  listAuditGroups,
  moveMoneyByNames,
  OperatorInputError,
  parseGroupsFile,
  planGroupMoves,
  resolveCategoryNames,
  undoAuditGroups,
} from './operator-ops';
import { assignMany, moveMoney } from './budget';
import { categories, createEntity } from './entities';
import { getAssigned } from './envelopes';
import { seedBasics } from './test-helpers';
import { categoryGroup } from '../schema';

const owner = { actor: 'owner' };
const operator = { actor: 'operator' };
const SINCE = '2024-01-01T00:00:00.000Z';
const MONTH = '2026-10';

let opened: OpenedDatabase;
let db: OpenedDatabase['db'];

beforeEach(() => {
  opened = createTestDatabase();
  db = opened.db;
  seedBasics(db);
  categories.create(db, { id: 'extra', name: 'Extra', groupId: 'g', class: 'want' }, owner);
  assignMany(
    db,
    MONTH,
    [
      { categoryId: 'miete', assignedCents: 50_000 },
      { categoryId: 'essen', assignedCents: 30_000 },
      { categoryId: 'reise', assignedCents: 10_000 },
    ],
    { actor: 'import-sim', groupId: 'import:synthetic-run' },
  );
  // The fixture's own entries are old; only what a test does counts as recent.
  db.run(sql`update audit_log set ts = '2020-01-01T00:00:00.000Z'`);
});
afterEach(() => opened.close());

const assigned = () =>
  Object.fromEntries(getAssigned(db, MONTH).map((r) => [r.categoryId, r.assignedCents]));
const auditCount = () => db.select().from(auditLog).all().length;

describe('listAuditGroups', () => {
  it('lists moves with category, month and delta, skips import groups, and orders oldest first', () => {
    moveMoney(db, MONTH, 'miete', 'essen', 2_500, owner);
    moveMoney(db, MONTH, 'reise', 'miete', 1_000, owner);
    const groups = listAuditGroups(db, { since: SINCE, entity: 'envelope_month' });
    expect(groups).toHaveLength(2);
    expect(groups.every((g) => !g.groupId.startsWith('import:'))).toBe(true);
    expect(groups[0]).toMatchObject({
      actor: 'owner',
      entries: 2,
      moves: [
        { category: 'Miete', month: MONTH, deltaCents: -2_500 },
        { category: 'Essen', month: MONTH, deltaCents: 2_500 },
      ],
    });
    expect(groups[0]!.summary).toEqual(['Miete 2026-10 −25,00 €', 'Essen 2026-10 +25,00 €']);
    expect(groups[1]!.moves.map((m) => m.deltaCents)).toEqual([-1_000, 1_000]);
  });

  it('honours since, until and entity, and shows other entities as counts', () => {
    moveMoney(db, MONTH, 'miete', 'essen', 100, owner);
    const [move] = listAuditGroups(db, { since: SINCE });
    createEntity(
      db,
      categoryGroup,
      { id: 'g2', name: 'Extra' },
      { actor: 'owner', groupId: 'other' },
    );
    db.run(
      sql`update audit_log set ts = '2026-10-01T10:00:00.000Z' where group_id = ${move!.groupId}`,
    );
    db.run(sql`update audit_log set ts = '2026-10-05T10:00:00.000Z' where group_id = 'other'`);
    const ids = (o: Parameters<typeof listAuditGroups>[1]) =>
      listAuditGroups(db, o).map((g) => g.groupId);
    expect(ids({ since: '2026-10-01T00:00:00Z' })).toEqual([move!.groupId, 'other']);
    expect(ids({ since: '2026-10-02T00:00:00Z' })).toEqual(['other']);
    expect(ids({ since: SINCE, until: '2026-10-02T00:00:00Z' })).toEqual([move!.groupId]);
    expect(ids({ since: SINCE, entity: 'envelope_month' })).toEqual([move!.groupId]);
    expect(listAuditGroups(db, { since: SINCE }).find((g) => g.groupId === 'other')).toMatchObject({
      moves: [],
      summary: ['1× category_group create'],
    });
    expect(() => listAuditGroups(db, { since: 'yesterday' })).toThrow(OperatorInputError);
  });

  it('leaves out undone groups, the records of undos, and lists a redone group again', () => {
    const a = moveMoney(db, MONTH, 'miete', 'essen', 100, owner).groupId;
    const b = moveMoney(db, MONTH, 'reise', 'extra', 200, owner).groupId;
    const first = undo(db, { groupId: a }, owner);
    expect(listAuditGroups(db, { since: SINCE }).map((g) => g.groupId)).toEqual([b]);
    undo(db, { groupId: first.groupId }, owner); // redo
    expect(listAuditGroups(db, { since: SINCE }).map((g) => g.groupId)).toEqual([a, b]);
  });

  it('nets repeated lines of one category and month', () => {
    const { groupId } = { groupId: 'multi' };
    assignMany(db, MONTH, [{ categoryId: 'miete', assignedCents: 49_000 }], {
      actor: 'owner',
      groupId,
    });
    assignMany(db, MONTH, [{ categoryId: 'miete', assignedCents: 48_500 }], {
      actor: 'owner',
      groupId,
    });
    expect(listAuditGroups(db, { since: SINCE })[0]!.moves).toEqual([
      { category: 'Miete', month: MONTH, deltaCents: -1_500 },
    ]);
  });
});

describe('undoAuditGroups', () => {
  it('undoes newest first in one transaction and refuses import runs and unknown groups', () => {
    const a = moveMoney(db, MONTH, 'miete', 'essen', 1_000, owner).groupId;
    const b = moveMoney(db, MONTH, 'miete', 'essen', 500, owner).groupId;
    // Listed oldest first on purpose: both moves touch the same rows, so only newest-first works.
    const done = undoAuditGroups(db, [a, b], operator);
    expect(done.map((d) => d.groupId)).toEqual([b, a]);
    expect(assigned()).toEqual({ miete: 50_000, essen: 30_000, reise: 10_000 });
    expect(
      db
        .select()
        .from(auditLog)
        .all()
        .filter((e) => e.action === 'undo'),
    ).toSatisfy(
      (undos: { actor: string }[]) =>
        undos.length > 0 && undos.every((u) => u.actor === 'operator'),
    );
    expect(() => undoAuditGroups(db, ['import:synthetic-run'], operator)).toThrow(/revert/);
    expect(() => undoAuditGroups(db, ['nope'], operator)).toThrow(/not found/);
    expect(() => undoAuditGroups(db, [], operator)).toThrow(OperatorInputError);
  });

  it('is all or nothing: one refused group undoes none, like POST /api/undo', () => {
    const a = moveMoney(db, MONTH, 'miete', 'essen', 1_000, owner).groupId;
    const b = moveMoney(db, MONTH, 'reise', 'essen', 500, owner).groupId;
    undo(db, { groupId: b }, owner);
    const before = auditCount();
    const state = assigned();
    expect(() => undoAuditGroups(db, [a, b], operator)).toThrow(/changed after this entry/);
    expect(auditCount()).toBe(before);
    expect(assigned()).toEqual(state);
  });

  it('a dry run reports the groups, refuses like the real run and writes nothing', () => {
    const a = moveMoney(db, MONTH, 'miete', 'essen', 1_000, owner).groupId;
    const before = auditCount();
    expect(undoAuditGroups(db, [a], operator, { dryRun: true })).toEqual([
      { groupId: a, entries: 2, undoGroupId: '' },
    ]);
    expect(auditCount()).toBe(before);
    expect(assigned()['miete']).toBe(49_000);
    undo(db, { groupId: a }, owner);
    expect(() => undoAuditGroups(db, [a], operator, { dryRun: true })).toThrow(/changed after/);
  });
});

describe('resolveCategoryNames', () => {
  it('matches trimmed and case-insensitive, ignores deleted categories, reports unknown and ambiguous', () => {
    categories.create(db, { id: 'dupe1', name: 'Doppelt', groupId: 'g', class: 'need' }, owner);
    categories.create(db, { id: 'dupe2', name: 'doppelt', groupId: 'g', class: 'need' }, owner);
    categories.create(db, { id: 'alt', name: 'Archiv', groupId: 'g', class: 'need' }, owner);
    categories.softDelete(db, 'alt', owner);
    const { ids, problems } = resolveCategoryNames(db, [
      ' MIETE ',
      'Nirgends',
      'Doppelt',
      'Archiv',
    ]);
    expect([...ids]).toEqual([['miete', 'miete']]);
    expect(problems).toEqual({ unknown: ['Nirgends', 'Archiv'], ambiguous: ['Doppelt'] });
  });
});

describe('moveMoneyByNames / applyMoves', () => {
  it('moves like "Geld verschieben": one audit group per move, actor operator', () => {
    const outcome = moveMoneyByNames(
      db,
      { month: MONTH, from: ' miete', to: 'ESSEN', cents: 2_000 },
      operator,
    );
    expect(assigned()).toEqual({ miete: 48_000, essen: 32_000, reise: 10_000 });
    const entries = db
      .select()
      .from(auditLog)
      .all()
      .filter((e) => e.groupId === outcome.groupId);
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.actor)).toEqual(['operator', 'operator']);
    // The app's own undo takes it back.
    undo(db, { groupId: outcome.groupId }, owner);
    expect(assigned()['miete']).toBe(50_000);
  });

  it('fails before any write on an unknown or ambiguous name, or a bad input', () => {
    categories.create(db, { id: 'dupe1', name: 'Doppelt', groupId: 'g', class: 'need' }, owner);
    categories.create(db, { id: 'dupe2', name: 'DOPPELT', groupId: 'g', class: 'need' }, owner);
    const before = auditCount();
    const moves = (...list: [string, string][]) =>
      list.map(([from, to]) => ({ month: MONTH, from, to, cents: 100 }));
    expect(() =>
      applyMoves(
        db,
        { moves: moves(['Miete', 'Essen'], ['Miete', 'Nirgends']), assignments: [] },
        operator,
      ),
    ).toThrow(/unknown: "Nirgends"/);
    expect(() =>
      applyMoves(
        db,
        { moves: moves(['Miete', 'Essen'], ['Doppelt', 'Essen']), assignments: [] },
        operator,
      ),
    ).toThrow(/ambiguous: "Doppelt"/);
    expect(() =>
      applyMoves(db, { moves: moves(['Miete', 'miete']), assignments: [] }, operator),
    ).toThrow(/same category/);
    expect(() =>
      applyMoves(
        db,
        { moves: [{ month: '2026-13', from: 'Miete', to: 'Essen', cents: 1 }], assignments: [] },
        operator,
      ),
    ).toThrow(/YYYY-MM/);
    expect(() =>
      applyMoves(
        db,
        { moves: [{ month: MONTH, from: 'Miete', to: 'Essen', cents: 0 }], assignments: [] },
        operator,
      ),
    ).toThrow(/positive/);
    expect(auditCount()).toBe(before);
  });

  it('applies a batch in one transaction and a dry run writes nothing', () => {
    const plan = {
      moves: [
        { month: MONTH, from: 'Miete', to: 'Essen', cents: 1_000 },
        { month: MONTH, from: 'Essen', to: 'Reise', cents: 4_000 },
      ],
      assignments: [],
    };
    const before = auditCount();
    const dry = applyMoves(db, plan, operator, { dryRun: true });
    expect(dry.map((d) => d.groupId)).toEqual(['', '']);
    expect(auditCount()).toBe(before);
    const done = applyMoves(db, plan, operator);
    expect(new Set(done.map((d) => d.groupId)).size).toBe(2);
    expect(assigned()).toEqual({ miete: 49_000, essen: 27_000, reise: 14_000 });
    // A refusal by the domain rules (here the "Zu verteilen" guard of an assignment) rolls the
    // moves before it back too.
    const state = assigned();
    const before2 = auditCount();
    expect(() =>
      applyMoves(
        db,
        {
          moves: [{ month: MONTH, from: 'Miete', to: 'Essen', cents: 100 }],
          assignments: [{ month: MONTH, category: 'Reise', deltaCents: 100_000_000 }],
        },
        operator,
      ),
    ).toThrow(/frei|Zu verteilen/);
    expect(assigned()).toEqual(state);
    expect(auditCount()).toBe(before2);
  });
});

describe('planGroupMoves / parseGroupsFile', () => {
  const line = (category: string, deltaCents: number, month = MONTH) => ({
    category,
    month,
    deltaCents,
  });

  it('maps two balanced lines to from/to/cents and reports the rest', () => {
    const plan = planGroupMoves([
      { groupId: 'g1', moves: [line('Essen', 700), line('Miete', -700)] },
      { groupId: 'g2', moves: [line('Essen', 700), line('Miete', -600)] },
      { groupId: 'g3', moves: [line('Essen', 300), line('Miete', -100), line('Reise', -200)] },
      { groupId: 'g4', moves: [line('Essen', 500, '2026-10'), line('Miete', -500, '2026-11')] },
      { groupId: 'g5', moves: [line('Essen', 100), line('essen ', -100)] },
    ]);
    expect(plan.moves).toEqual([
      { month: MONTH, from: 'Miete', to: 'Essen', cents: 700, sourceGroupId: 'g1' },
    ]);
    expect(plan.assignments).toEqual([]);
    expect(plan.skipped.map((s) => [s.groupId, s.month, s.reason, s.netCents])).toEqual([
      ['g2', MONTH, 'unbalanced', 100],
      ['g3', MONTH, 'not_a_move', 0],
      ['g4', '2026-10', 'unbalanced', 500],
      ['g4', '2026-11', 'unbalanced', -500],
    ]);
  });

  it('assigns the lines of unbalanced groups individually with allowUnbalanced', () => {
    const groups = [
      { groupId: 'g1', moves: [line('Essen', 700), line('Miete', -600)] },
      { groupId: 'g2', moves: [line('Reise', 250)] },
    ];
    const plan = planGroupMoves(groups, { allowUnbalanced: true });
    expect(plan.skipped).toEqual([]);
    expect(plan.moves).toEqual([]);
    expect(plan.assignments.map((a) => [a.category, a.deltaCents])).toEqual([
      ['Essen', 700],
      ['Miete', -600],
      ['Reise', 250],
    ]);
    applyMoves(db, plan, operator);
    expect(assigned()).toEqual({ miete: 49_400, essen: 30_700, reise: 10_250 });
    const groupsOfWrites = listAuditGroups(db, { since: SINCE }).filter(
      (g) => g.actor === 'operator',
    );
    expect(groupsOfWrites).toHaveLength(3);
  });

  it('rejects malformed files with a pointer to the entry', () => {
    expect(parseGroupsFile([{ groupId: 'x', ts: 't', moves: [line('A', 1)] }])).toHaveLength(1);
    expect(() => parseGroupsFile({})).toThrow(/array/);
    expect(() => parseGroupsFile([{}])).toThrow(/entry 1/);
    expect(() => parseGroupsFile([{ moves: [line('A', 1.5)] }])).toThrow(
      /entry 1, move 1.*integer/,
    );
    expect(() => parseGroupsFile([{ moves: [line('A', 1, '2026-1')] }])).toThrow(/YYYY-MM/);
    expect(() => parseGroupsFile([{ moves: [line(' ', 1)] }])).toThrow(/name/);
  });
});
