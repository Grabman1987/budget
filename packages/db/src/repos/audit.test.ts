import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { account, category, categoryGroup, envelopeMonth, price, security } from '../schema';
import {
  deleteTracked,
  history,
  insertManyTracked,
  insertTracked,
  readSnapshot,
  recordAudit,
  undo,
  updateTracked,
  withGroup,
} from './audit';
import { AuditError } from './errors';

const ctx = { actor: 'tester' };
let opened: OpenedDatabase;
let db: OpenedDatabase['db'];

beforeEach(() => {
  opened = createTestDatabase();
  db = opened.db;
});
afterEach(() => opened.close());

const groupRow = () => db.select().from(categoryGroup).where(eq(categoryGroup.id, 'g1')).get();

function createGroup(name = 'Wohnen') {
  insertTracked(db, categoryGroup, { id: 'g1', name }, withGroup(ctx));
}

describe('recordAudit / history', () => {
  it('stores entries and returns them newest first with parsed snapshots', () => {
    recordAudit(db, {
      action: 'create',
      entityType: 'x',
      entityId: '1',
      after: { a: 1 },
      actor: 'me',
    });
    recordAudit(db, {
      action: 'update',
      entityType: 'x',
      entityId: '1',
      before: { a: 1 },
      after: { a: 2 },
      actor: 'me',
    });
    recordAudit(db, {
      action: 'update',
      entityType: 'x',
      entityId: '2',
      after: { a: 9 },
      actor: 'me',
    });
    const h = history(db, 'x', '1');
    expect(h.map((e) => e.action)).toEqual(['update', 'create']);
    expect(h[0]?.before).toEqual({ a: 1 });
    expect(h[0]?.after).toEqual({ a: 2 });
    expect(h[1]?.before).toBeNull();
    expect(h[0]?.actor).toBe('me');
    expect(typeof h[0]?.id).toBe('string');
  });
});

describe('tracked writes', () => {
  it('records a create with SQL column names in the snapshot', () => {
    createGroup();
    const [entry] = history(db, 'category_group', 'g1');
    expect(entry?.action).toBe('create');
    expect(entry?.before).toBeNull();
    expect(entry?.after).toMatchObject({
      id: 'g1',
      name: 'Wohnen',
      sort_order: 0,
      deleted_at: null,
    });
    expect(entry?.actor).toBe('tester');
  });

  it('records before/after on update, maintains updated_at, and skips no-op patches', () => {
    // SQL and JS clocks can differ within a millisecond; use a known earlier fixture timestamp.
    insertTracked(
      db,
      categoryGroup,
      {
        id: 'g1',
        name: 'Wohnen',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
      withGroup(ctx),
    );
    const before = groupRow();
    expect(updateTracked(db, categoryGroup, ['g1'], { name: 'Wohnen' }, ctx)).toBe(false);
    expect(
      updateTracked(db, categoryGroup, ['g1'], { name: 'Haus', sortOrder: undefined }, ctx),
    ).toBe(true);
    const h = history(db, 'category_group', 'g1');
    expect(h).toHaveLength(2);
    expect(h[0]?.before).toMatchObject({ name: 'Wohnen' });
    expect(h[0]?.after).toMatchObject({ name: 'Haus' });
    expect((groupRow()?.updatedAt ?? '') >= (before?.updatedAt ?? '')).toBe(true);
    expect(groupRow()?.updatedAt).toBe((h[0]?.after as { updated_at: string }).updated_at);
  });

  it('rejects patching key columns', () => {
    createGroup();
    expect(() => updateTracked(db, categoryGroup, ['g1'], { id: 'g2' }, ctx)).toThrow(/key/);
  });

  it('shares the group id given by the context', () => {
    insertTracked(db, categoryGroup, { id: 'g1', name: 'a' }, { actor: 'x', groupId: 'grp' });
    insertTracked(db, categoryGroup, { id: 'g2', name: 'b' }, { actor: 'x', groupId: 'grp' });
    expect(history(db, 'category_group', 'g2')[0]?.groupId).toBe('grp');
  });

  it('withGroup fills a missing group id and keeps a given one', () => {
    expect(withGroup({ actor: 'a' }).groupId).toMatch(/^[0-9a-f-]{36}$/);
    expect(withGroup({ actor: 'a', groupId: 'g' }).groupId).toBe('g');
  });
});

describe('insertManyTracked', () => {
  /** Rows and log entries without what differs by nature (generated ids, clock values). */
  const clock = new Set(['createdAt', 'updatedAt', 'created_at', 'updated_at']);
  const timeless = (o: object) => Object.entries(o).filter(([k]) => !clock.has(k));
  const comparable = (prefix: string) => ({
    rows: db
      .select()
      .from(account)
      .all()
      .filter((r) => r.id.startsWith(prefix))
      .map((r) => timeless({ ...r, id: r.id.slice(1) })),
    log: history(db, 'account', `${prefix}2`)
      .concat(history(db, 'account', `${prefix}1`))
      .map((e) => ({
        ...e,
        id: '',
        ts: '',
        entityId: e.entityId.slice(1),
        after: timeless({ ...e.after, id: '' }),
      })),
  });
  const rows = (prefix: string) => [
    // Booleans go through the column encoder; undefined takes the default, null stays NULL.
    {
      id: `${prefix}1`,
      name: 'Giro',
      type: 'checking' as const,
      role: 'budget' as const,
      onBudget: true,
      openingBalanceCents: 100,
      openingDate: '2024-01-01',
      closedAt: null,
    },
    {
      id: `${prefix}2`,
      name: 'Depot',
      type: 'brokerage' as const,
      role: 'investment' as const,
      onBudget: false,
      openingBalanceCents: 0,
      openingDate: '2024-02-01',
      note: 'n',
      sortOrder: 3,
    },
  ];

  it('writes the same rows and the same log as one insertTracked per row', () => {
    const group = { actor: 'tester', groupId: 'g' };
    for (const r of rows('a')) insertTracked(db, account, r, group);
    insertManyTracked(db, account, rows('b'), group);
    expect(comparable('b')).toEqual(comparable('a'));
    const stored = db
      .select()
      .from(account)
      .all()
      .filter((r) => r.id.startsWith('b'));
    expect(stored.map((r) => [r.onBudget, r.currency, r.closedAt])).toEqual([
      [true, 'EUR', null],
      [false, 'EUR', null],
    ]);
  });

  it('handles composite keys and is undone as a group', () => {
    insertTracked(db, categoryGroup, { id: 'g1', name: 'A' }, withGroup(ctx));
    insertTracked(
      db,
      category,
      { id: 'c1', name: 'Miete', groupId: 'g1', class: 'need' },
      withGroup(ctx),
    );
    const months = ['2026-01', '2026-02'].map((month) => ({ categoryId: 'c1', month }));
    insertManyTracked(db, envelopeMonth, months, { actor: 'tester', groupId: 'months' });
    expect(history(db, 'envelope_month', 'c1:2026-02')[0]?.after).toMatchObject({
      category_id: 'c1',
      month: '2026-02',
      assigned_cents: 0,
    });
    undo(db, { groupId: 'months' }, ctx);
    expect(
      db
        .select()
        .from(envelopeMonth)
        .all()
        .every((r) => r.deletedAt !== null),
    ).toBe(true);
  });
});

describe('undo', () => {
  it('reverts an update to the before snapshot and can be redone', () => {
    createGroup();
    updateTracked(db, categoryGroup, ['g1'], { name: 'Haus' }, ctx);
    const [upd] = history(db, 'category_group', 'g1');
    const undone = undo(db, { auditId: upd!.id }, ctx);
    expect(groupRow()?.name).toBe('Wohnen');
    expect(undone.entries).toHaveLength(1);
    const [entry] = history(db, 'category_group', 'g1');
    expect(entry?.action).toBe('undo');
    expect(entry?.undoOfId).toBe(upd!.id);
    expect(entry?.groupId).toBe(undone.groupId);

    // redo = undo the undo
    undo(db, { auditId: entry!.id }, ctx);
    expect(groupRow()?.name).toBe('Haus');
  });

  it('soft-deletes on undo of a create and restores on redo', () => {
    createGroup();
    const [created] = history(db, 'category_group', 'g1');
    undo(db, { auditId: created!.id }, ctx);
    expect(groupRow()?.deletedAt).not.toBeNull();
    const [u] = history(db, 'category_group', 'g1');
    expect(u?.before).toMatchObject({ deleted_at: null });
    undo(db, { auditId: u!.id }, ctx);
    expect(groupRow()?.deletedAt).toBeNull();
    expect(groupRow()?.name).toBe('Wohnen');
  });

  it('clears deleted_at on undo of a delete', () => {
    createGroup();
    updateTracked(
      db,
      categoryGroup,
      ['g1'],
      { deletedAt: '2026-01-01T00:00:00.000Z' },
      ctx,
      'delete',
    );
    const [del] = history(db, 'category_group', 'g1');
    expect(del?.action).toBe('delete');
    undo(db, { auditId: del!.id }, ctx);
    expect(groupRow()?.deletedAt).toBeNull();
  });

  it('reverts a whole group in reverse order under one new group id', () => {
    const c = { actor: 'tester', groupId: 'action-1' };
    insertTracked(db, categoryGroup, { id: 'g1', name: 'Wohnen' }, c);
    insertTracked(db, category, { id: 'c1', name: 'Miete', groupId: 'g1', class: 'need' }, c);
    updateTracked(db, category, ['c1'], { name: 'Miete neu' }, c);
    const result = undo(db, { groupId: 'action-1' }, ctx);
    expect(result.entries).toHaveLength(3);
    expect(new Set(result.entries.map((e) => e.groupId))).toEqual(new Set([result.groupId]));
    expect(result.groupId).not.toBe('action-1');
    // reverse order: update first, then category create, then group create
    expect(result.entries.map((e) => e.entityType)).toEqual([
      'category',
      'category',
      'category_group',
    ]);
    expect(db.select().from(category).get()?.deletedAt).not.toBeNull();
    expect(groupRow()?.deletedAt).not.toBeNull();
    // redo the whole undo
    undo(db, { groupId: result.groupId }, ctx);
    expect(groupRow()?.deletedAt).toBeNull();
    const cat = db.select().from(category).get();
    expect(cat?.deletedAt).toBeNull();
    expect(cat?.name).toBe('Miete neu');
  });

  it('refuses when the entity changed after the entry, unless forced', () => {
    createGroup();
    updateTracked(db, categoryGroup, ['g1'], { name: 'A' }, ctx);
    const [first] = history(db, 'category_group', 'g1');
    updateTracked(db, categoryGroup, ['g1'], { name: 'B' }, ctx);
    expect(() => undo(db, { auditId: first!.id }, ctx)).toThrow(AuditError);
    expect(() => undo(db, { auditId: first!.id }, ctx)).toThrow(/changed/);
    expect(groupRow()?.name).toBe('B');
    undo(db, { auditId: first!.id }, ctx, { force: true });
    expect(groupRow()?.name).toBe('Wohnen');
  });

  it('refuses to undo the same entry twice', () => {
    createGroup();
    updateTracked(db, categoryGroup, ['g1'], { name: 'A' }, ctx);
    const [upd] = history(db, 'category_group', 'g1');
    undo(db, { auditId: upd!.id }, ctx);
    expect(() => undo(db, { auditId: upd!.id }, ctx)).toThrow(AuditError);
  });

  it('is atomic: a conflict in one entry of a group reverts nothing', () => {
    const c = { actor: 'tester', groupId: 'grp' };
    insertTracked(db, categoryGroup, { id: 'g1', name: 'A' }, c);
    insertTracked(db, categoryGroup, { id: 'g2', name: 'B' }, c);
    updateTracked(db, categoryGroup, ['g1'], { name: 'A2' }, ctx); // g1 changed later, outside the group
    // reverse order: g2 create is reverted first, then g1 conflicts
    expect(() => undo(db, { groupId: 'grp' }, ctx)).toThrow(AuditError);
    expect(
      db.select().from(categoryGroup).where(eq(categoryGroup.id, 'g2')).get()?.deletedAt,
    ).toBeNull();
  });

  it('throws for unknown targets', () => {
    expect(() => undo(db, { auditId: 'nope' }, ctx)).toThrow(AuditError);
    expect(() => undo(db, { groupId: 'nope' }, ctx)).toThrow(AuditError);
  });

  it('handles composite keys (entity_id = categoryId:month)', () => {
    insertTracked(db, categoryGroup, { id: 'g1', name: 'A' }, withGroup(ctx));
    insertTracked(
      db,
      category,
      { id: 'c1', name: 'Miete', groupId: 'g1', class: 'need' },
      withGroup(ctx),
    );
    insertTracked(
      db,
      envelopeMonth,
      { categoryId: 'c1', month: '2026-01', assignedCents: 500 },
      withGroup(ctx),
    );
    updateTracked(db, envelopeMonth, ['c1', '2026-01'], { assignedCents: 900 }, ctx);
    const h = history(db, 'envelope_month', 'c1:2026-01');
    expect(h).toHaveLength(2);
    undo(db, { auditId: h[0]!.id }, ctx);
    expect(db.select().from(envelopeMonth).get()?.assignedCents).toBe(500);
    expect(readSnapshot(db, envelopeMonth, ['c1', '2026-01'])).toMatchObject({
      assigned_cents: 500,
    });
  });

  it('hard-deletes on undo of a create for tables without deleted_at, and re-inserts on redo', () => {
    insertTracked(db, security, { id: 's1', name: 'ETF', kind: 'etf' }, withGroup(ctx));
    insertTracked(
      db,
      price,
      { securityId: 's1', date: '2026-01-02', priceMicro: 1_000_000, source: 'manual' },
      withGroup(ctx),
    );
    const [created] = history(db, 'price', 's1:2026-01-02');
    undo(db, { auditId: created!.id }, ctx);
    expect(db.select().from(price).all()).toHaveLength(0);
    const [u] = history(db, 'price', 's1:2026-01-02');
    expect(u?.after).toBeNull();
    undo(db, { auditId: u!.id }, ctx);
    expect(db.select().from(price).get()?.priceMicro).toBe(1_000_000);
  });

  it('re-inserts a hard-deleted row on undo', () => {
    insertTracked(db, security, { id: 's1', name: 'ETF', kind: 'etf' }, withGroup(ctx));
    insertTracked(
      db,
      price,
      { securityId: 's1', date: '2026-01-02', priceMicro: 5, source: 'manual' },
      withGroup(ctx),
    );
    deleteTracked(db, price, ['s1', '2026-01-02'], ctx);
    expect(db.select().from(price).all()).toHaveLength(0);
    const [del] = history(db, 'price', 's1:2026-01-02');
    expect(del?.action).toBe('delete');
    expect(del?.after).toBeNull();
    undo(db, { auditId: del!.id }, ctx);
    expect(db.select().from(price).get()?.priceMicro).toBe(5);
  });
});
