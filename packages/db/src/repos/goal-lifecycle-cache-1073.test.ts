import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { accounts } from './entities';
import { undo } from './audit';
import { createBooking } from './bookings';
import { assignMany, moveMoney } from './budget';
import { createCategory, createCategoryGroup } from './categories';
import { createGoal, listGoals } from './goals';
import { readEntries, readEntriesUncached, resetGoalAuditCache } from './goal-lifecycle';

/**
 * #1073: the goal lifecycle reads parsed audit entries from a per-connection, rowid-incremental
 * cache. The cache must never change a result: after every kind of audit change the warm result
 * equals the result of a full read (cache dropped), which is what every call did before.
 */
const MONTH = '2026-10';
const TODAY = '2026-10-03';
const ACTOR = { actor: 'synthetic-goal-1073' };
let opened: OpenedDatabase;
let db: OpenedDatabase['db'];
let categoryId: string;
let otherCategoryId: string;
const categoryId2 = () => otherCategoryId;

const day = (value: string) => vi.setSystemTime(new Date(`${value}T10:00:00Z`));
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  day('2026-10-01');
  opened = createTestDatabase();
  // The audit clock must share the synthetic day, as in goal-lifecycle-plan-rate-604.test.ts.
  opened.sqlite.function('strftime', { varargs: true }, (...args) => {
    if (args.length !== 2 || args[0] !== '%Y-%m-%dT%H:%M:%fZ' || args[1] !== 'now')
      throw new Error('Unexpected synthetic clock request');
    return new Date().toISOString();
  });
  db = opened.db;
  accounts.create(
    db,
    {
      id: 'cash-1073',
      name: 'Synthetic budget',
      type: 'checking',
      role: 'budget',
      onBudget: true,
      currency: 'EUR',
      openingDate: '2026-10-01',
      openingBalanceCents: 500000,
    },
    ACTOR,
  );
  const group = createCategoryGroup(db, 'Synthetic goals', ACTOR);
  const category = createCategory(
    db,
    { name: 'Synthetic envelope', groupId: group.id, class: 'future', kind: 'saving', stage: 3 },
    ACTOR,
  );
  categoryId = category.id;
  otherCategoryId = createCategory(
    db,
    { name: 'Synthetic other', groupId: group.id, class: 'need', kind: 'variable', stage: 2 },
    ACTOR,
  ).id;
  createGoal(
    db,
    {
      name: 'Synthetic goal',
      categoryId,
      targetCents: 120000,
      targetDate: '2026-12-31',
      startMonth: MONTH,
    },
    ACTOR,
    MONTH,
    '2026-10-01',
  );
});
afterEach(() => {
  opened.close();
  vi.useRealTimers();
});

const warm = () => listGoals(db, MONTH, { today: TODAY });
const full = () => {
  resetGoalAuditCache(db);
  return listGoals(db, MONTH, { today: TODAY });
};
const latestGroup = () =>
  opened.sqlite
    .prepare('SELECT group_id FROM audit_log ORDER BY rowid DESC LIMIT 1')
    .pluck()
    .get() as string;
const audits = () =>
  opened.sqlite.prepare('SELECT count(*) FROM audit_log').pluck().get() as number;

describe('goal lifecycle audit cache (#1073)', () => {
  it('equals a full read after every kind of audit change, with real proven lifecycles', () => {
    resetGoalAuditCache(db);
    expect(warm()).toEqual(full());
    day('2026-10-02');
    assignMany(db, MONTH, [{ categoryId, assignedCents: 120000 }], ACTOR);
    expect(warm()).toEqual(full());
    expect(full()[0]!.lifecycle).toMatchObject({
      state: 'reached',
      reachedOn: '2026-10-02',
      evidence: 'proven',
    });
    day('2026-10-03');
    const spend = createBooking(
      db,
      {
        accountId: 'cash-1073',
        date: '2026-10-03',
        amountCents: -30000,
        splits: [{ categoryId, amountCents: -30000 }],
      },
      ACTOR,
    );
    expect(warm()).toEqual(full());
    expect(full()[0]!.lifecycle).toMatchObject({ state: 'completed', reason: 'expense' });
    // Undo is an audit entry like any other: the incremental result must follow it.
    undo(db, { groupId: (spend as { groupId?: string }).groupId ?? latestGroup() }, ACTOR);
    expect(warm()).toEqual(full());
    expect(full()[0]!.lifecycle).toMatchObject({ state: 'reached', completedOn: null });
    moveMoney(db, MONTH, categoryId, categoryId2(), 10000, ACTOR);
    expect(warm()).toEqual(full());
  });

  it('reads the new rows only: the second warm read does not re-read what it has', () => {
    warm();
    const before = audits();
    const statements: string[] = [];
    const prepare = opened.sqlite.prepare.bind(opened.sqlite);
    opened.sqlite.prepare = ((sql: string) => {
      statements.push(sql);
      return prepare(sql);
    }) as typeof opened.sqlite.prepare;
    warm();
    opened.sqlite.prepare = prepare;
    expect(audits()).toBe(before);
    // One cheap prefix check, then one read of the (empty) tail: never the table's JSON again.
    const reads = statements.filter((s) =>
      /SELECT rowid AS sequence[\s\S]*FROM audit_log WHERE rowid >/.test(s),
    );
    expect(reads).toHaveLength(1);
    // The prefix check counts all rows minus the tail: no scan of the table up to the last rowid.
    expect(statements.some((s) => /count\(\*\) FROM audit_log WHERE rowid <=/.test(s))).toBe(false);
  });

  it('does not keep rows of a rolled-back transaction, even when their rowids are reused', () => {
    warm();
    try {
      db.transaction((tx) => {
        assignMany(tx, MONTH, [{ categoryId, assignedCents: 90000 }], ACTOR);
        listGoals(tx, MONTH, { today: TODAY }); // the cache sees the uncommitted rows
        throw new Error('rollback');
      });
    } catch (error) {
      expect((error as Error).message).toBe('rollback');
    }
    // A different write now reuses the rowids of the rolled-back entries.
    assignMany(db, MONTH, [{ categoryId, assignedCents: 30000 }], ACTOR);
    expect(warm()).toEqual(full());
  });

  it('falls back to a full read when a cached row disappears', () => {
    assignMany(db, MONTH, [{ categoryId, assignedCents: 20000 }], ACTOR);
    warm();
    const last = opened.sqlite.prepare('SELECT max(rowid) FROM audit_log').pluck().get();
    opened.sqlite.prepare('DELETE FROM audit_log WHERE rowid = ?').run(last);
    expect(warm()).toEqual(full());
  });

  it('returns exactly what the uncached read returns, for every watermark', () => {
    resetGoalAuditCache(db);
    for (const cents of [10000, 20000, 30000]) {
      assignMany(db, MONTH, [{ categoryId, assignedCents: cents }], ACTOR);
      readEntries(db); // cache follows each append
    }
    const last = opened.sqlite.prepare('SELECT max(rowid) FROM audit_log').pluck().get() as number;
    for (const after of [0, 1, Math.floor(last / 2), last - 1, last, last + 5]) {
      expect(readEntries(db, after)).toEqual(readEntriesUncached(db, after));
    }
    // Entries are shared and read-only: the lazy day is a plain value, also after serialising.
    const [first] = readEntries(db, 0);
    expect(JSON.parse(JSON.stringify(first)).day).toBe(first!.day);
    expect(first!.day).toBe('2026-10-01');
  });

  it('lets the uncached read decide when a row beyond the cache is malformed', () => {
    resetGoalAuditCache(db);
    readEntries(db);
    const last = opened.sqlite.prepare('SELECT max(rowid) FROM audit_log').pluck().get() as number;
    opened.sqlite
      .prepare(
        `INSERT INTO audit_log (id, action, entity_type, entity_id, before_json, after_json)
         VALUES ('bad-1073', 'create', 'unrelated', 'x', NULL, '{not json')`,
      )
      .run();
    // After the bad row nothing is malformed: the old read succeeds, so must the cached one.
    expect(readEntries(db, last + 1)).toEqual(readEntriesUncached(db, last + 1));
    // The bad row lies after the watermark: both throw the same way.
    expect(() => readEntriesUncached(db, last)).toThrow();
    expect(() => readEntries(db, last)).toThrow();
    // A row at or before the watermark is not read by the old query either.
    expect(readEntries(db, last + 1)).toEqual([]);
  });
});
