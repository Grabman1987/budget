import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { envelopeMonth } from '../schema';
import { history, undo } from './audit';
import { assignedByMonth, getAssigned, setAssigned } from './envelopes';
import { seedBasics, testCtx as ctx } from './test-helpers';

let opened: OpenedDatabase;
let db: OpenedDatabase['db'];

beforeEach(() => {
  opened = createTestDatabase();
  db = opened.db;
  seedBasics(db);
});
afterEach(() => opened.close());

describe('envelopes', () => {
  it('upserts assigned amounts with audit before/after', () => {
    setAssigned(db, 'miete', '2026-01', 80_000, ctx);
    setAssigned(db, 'miete', '2026-01', 85_000, ctx);
    expect(getAssigned(db)).toEqual([
      { categoryId: 'miete', month: '2026-01', assignedCents: 85_000 },
    ]);
    const [upd, create] = history(db, 'envelope_month', 'miete:2026-01');
    expect(create).toMatchObject({
      action: 'create',
      before: null,
      after: { assigned_cents: 80_000 },
    });
    expect(upd).toMatchObject({
      action: 'update',
      before: { assigned_cents: 80_000 },
      after: { assigned_cents: 85_000 },
    });
  });

  it('writes nothing for an unchanged value or a first zero', () => {
    setAssigned(db, 'miete', '2026-01', 0, ctx);
    expect(db.select().from(envelopeMonth).all()).toHaveLength(0);
    setAssigned(db, 'miete', '2026-01', 100, ctx);
    setAssigned(db, 'miete', '2026-01', 100, ctx);
    expect(history(db, 'envelope_month', 'miete:2026-01')).toHaveLength(1);
    setAssigned(db, 'miete', '2026-01', 0, ctx); // an existing row is set to 0, not skipped
    expect(getAssigned(db)[0]?.assignedCents).toBe(0);
  });

  it('filters by month and builds a month to category map', () => {
    setAssigned(db, 'miete', '2026-01', 1, ctx);
    setAssigned(db, 'essen', '2026-01', 2, ctx);
    setAssigned(db, 'miete', '2026-02', 3, ctx);
    expect(getAssigned(db, '2026-02')).toEqual([
      { categoryId: 'miete', month: '2026-02', assignedCents: 3 },
    ]);
    expect(getAssigned(db, '2026-01').map((r) => r.categoryId)).toEqual(['essen', 'miete']);
    expect(assignedByMonth(db)).toEqual({
      '2026-01': { miete: 1, essen: 2 },
      '2026-02': { miete: 3 },
    });
  });

  it('undo of a create hides the row and a later set revives it', () => {
    setAssigned(db, 'miete', '2026-01', 500, ctx);
    undo(db, { auditId: history(db, 'envelope_month', 'miete:2026-01')[0]!.id }, ctx);
    expect(getAssigned(db)).toEqual([]);
    expect(assignedByMonth(db)).toEqual({});
    setAssigned(db, 'miete', '2026-01', 700, ctx);
    expect(getAssigned(db)).toEqual([
      { categoryId: 'miete', month: '2026-01', assignedCents: 700 },
    ]);
    // undo the revival: hidden again
    undo(db, { auditId: history(db, 'envelope_month', 'miete:2026-01')[0]!.id }, ctx);
    expect(getAssigned(db)).toEqual([]);
  });

  it('validates month and integer cents', () => {
    expect(() => setAssigned(db, 'miete', '2026-13', 1, ctx)).toThrow(/month/);
    expect(() => setAssigned(db, 'miete', '2026-1', 1, ctx)).toThrow(/month/);
    expect(() => setAssigned(db, 'miete', '2026-01', 1.5, ctx)).toThrow(/integer/);
  });
});
