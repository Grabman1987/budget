import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { category, categoryGroup, contact, security } from '../schema';
import { history, undo } from './audit';
import {
  accounts,
  categories,
  createEntity,
  getEntity,
  listEntities,
  restoreEntity,
  softDeleteEntity,
  updateEntity,
} from './entities';
import { EntityNotFoundError } from './errors';

const ctx = { actor: 'tester' };
let opened: OpenedDatabase;
let db: OpenedDatabase['db'];

beforeEach(() => {
  opened = createTestDatabase();
  db = opened.db;
});
afterEach(() => opened.close());

describe('generic entities', () => {
  it('creates with a generated id, audits the create, and reads it back', () => {
    const row = createEntity(db, contact, { name: 'Partner' }, ctx);
    expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(getEntity(db, contact, row.id)?.name).toBe('Partner');
    const [entry] = history(db, 'contact', row.id);
    expect(entry).toMatchObject({ action: 'create', actor: 'tester', before: null });
  });

  it('accepts a caller-supplied id', () => {
    createEntity(db, contact, { id: 'k1', name: 'A' }, ctx);
    expect(getEntity(db, contact, 'k1')?.name).toBe('A');
  });

  it('updates, maintains updated_at, and audits before/after', () => {
    const { id } = createEntity(db, contact, { name: 'A' }, ctx);
    const rowBefore = getEntity(db, contact, id)!;
    const updated = updateEntity(db, contact, id, { name: 'B', note: 'x' }, ctx);
    expect(updated.name).toBe('B');
    expect(updated.updatedAt >= rowBefore.updatedAt).toBe(true);
    const [entry] = history(db, 'contact', id);
    expect(entry).toMatchObject({
      action: 'update',
      before: { name: 'A' },
      after: { name: 'B', note: 'x' },
    });
  });

  it('throws when updating a missing or deleted row', () => {
    expect(() => updateEntity(db, contact, 'nope', { name: 'x' }, ctx)).toThrow(
      EntityNotFoundError,
    );
    const { id } = createEntity(db, contact, { name: 'A' }, ctx);
    softDeleteEntity(db, contact, id, ctx);
    expect(() => updateEntity(db, contact, id, { name: 'x' }, ctx)).toThrow(EntityNotFoundError);
  });

  it('soft-deletes: hidden from reads unless includeDeleted, never removed', () => {
    const { id } = createEntity(db, contact, { name: 'A' }, ctx);
    createEntity(db, contact, { name: 'B' }, ctx);
    softDeleteEntity(db, contact, id, ctx);
    expect(getEntity(db, contact, id)).toBeUndefined();
    expect(getEntity(db, contact, id, { includeDeleted: true })?.deletedAt).not.toBeNull();
    expect(listEntities(db, contact)).toHaveLength(1);
    expect(listEntities(db, contact, { includeDeleted: true })).toHaveLength(2);
    expect(history(db, 'contact', id)[0]?.action).toBe('delete');
    expect(() => softDeleteEntity(db, contact, id, ctx)).toThrow(EntityNotFoundError);
  });

  it('restores a soft-deleted row and audits a restore', () => {
    const { id } = createEntity(db, contact, { name: 'A' }, ctx);
    softDeleteEntity(db, contact, id, ctx);
    const row = restoreEntity(db, contact, id, ctx);
    expect(row.deletedAt).toBeNull();
    expect(history(db, 'contact', id)[0]?.action).toBe('restore');
    expect(() => restoreEntity(db, contact, id, ctx)).toThrow(EntityNotFoundError);
  });

  it('works for other id tables (security, category_group)', () => {
    const s = createEntity(db, security, { name: 'ETF', kind: 'etf' }, ctx);
    expect(getEntity(db, security, s.id)?.terBp).toBe(0);
    const g = createEntity(db, categoryGroup, { name: 'Wohnen' }, ctx);
    createEntity(db, category, { name: 'Miete', groupId: g.id, class: 'need' }, ctx);
    expect(listEntities(db, category)).toHaveLength(1);
  });

  it('participates in undo', () => {
    const { id } = createEntity(db, contact, { name: 'A' }, ctx);
    updateEntity(db, contact, id, { name: 'B' }, ctx);
    undo(db, { auditId: history(db, 'contact', id)[0]!.id }, ctx);
    expect(getEntity(db, contact, id)?.name).toBe('A');
    undo(db, { auditId: history(db, 'contact', id).at(-1)!.id }, { actor: 'x' }, { force: true });
    expect(getEntity(db, contact, id)).toBeUndefined();
  });
});

describe('accounts and categories wrappers', () => {
  it('creates accounts with role and terms and lists them by sort_order', () => {
    accounts.create(
      db,
      { id: 'b', name: 'Giro', role: 'budget', openingDate: '2023-10-01', sortOrder: 2 },
      ctx,
    );
    accounts.create(
      db,
      {
        id: 'a',
        name: 'Kredit',
        role: 'debt',
        openingDate: '2023-10-01',
        openingBalanceCents: -100_000,
        interestRateBp: 632,
        termEnd: '2030-01-01',
        monthlyFeeCents: 500,
        sortOrder: 1,
      },
      ctx,
    );
    accounts.create(
      db,
      { id: 'c', name: 'Anlage', role: 'investment', openingDate: '2023-10-01', sortOrder: 3 },
      ctx,
    );
    const list = accounts.list(db);
    expect(list.map((a) => a.id)).toEqual(['a', 'b', 'c']);
    expect(list[0]).toMatchObject({
      role: 'debt',
      interestRateBp: 632,
      openingBalanceCents: -100_000,
      currency: 'EUR',
    });
    accounts.softDelete(db, 'b', ctx);
    expect(accounts.list(db).map((a) => a.id)).toEqual(['a', 'c']);
    expect(accounts.list(db, { includeDeleted: true })).toHaveLength(3);
    expect(accounts.get(db, 'a')?.name).toBe('Kredit');
    accounts.update(db, 'a', { name: 'Darlehen' }, ctx);
    expect(accounts.get(db, 'a')?.name).toBe('Darlehen');
    accounts.restore(db, 'b', ctx);
    expect(accounts.list(db)).toHaveLength(3);
  });

  it('lists categories by sort_order then name', () => {
    createEntity(db, categoryGroup, { id: 'g', name: 'Wohnen' }, ctx);
    categories.create(
      db,
      { id: 'c2', name: 'Strom', groupId: 'g', class: 'need', sortOrder: 1 },
      ctx,
    );
    categories.create(
      db,
      { id: 'c1', name: 'Miete', groupId: 'g', class: 'need', sortOrder: 1 },
      ctx,
    );
    categories.create(
      db,
      { id: 'c0', name: 'Urlaub', groupId: 'g', class: 'want', sortOrder: 0 },
      ctx,
    );
    expect(categories.list(db).map((c) => c.id)).toEqual(['c0', 'c1', 'c2']);
  });
});
