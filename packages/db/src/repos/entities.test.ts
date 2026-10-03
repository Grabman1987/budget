import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { account, category, categoryGroup, contact, security } from '../schema';
import { history, undo, updateTracked } from './audit';
import { createBooking } from './bookings';
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
import { BookingInvariantError, EntityNotFoundError } from './errors';

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
    // SQLite rounds milliseconds; the JS update clock may be one millisecond behind that default.
    db.update(contact)
      .set({ updatedAt: '2000-01-01T00:00:00.000Z' })
      .where(eq(contact.id, id))
      .run();
    const rowBefore = getEntity(db, contact, id)!;
    const updated = updateEntity(db, contact, id, { name: 'B', note: 'x' }, ctx);
    expect(updated.name).toBe('B');
    expect(updated.updatedAt > rowBefore.updatedAt).toBe(true);
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
  it('rejects budget accounts in foreign currency but accepts off-budget USD', () => {
    expect(() =>
      accounts.create(
        db,
        {
          id: 'bad-usd',
          name: 'USD budget',
          type: 'checking',
          role: 'budget',
          onBudget: true,
          currency: 'USD',
          openingDate: '2023-10-01',
        },
        ctx,
      ),
    ).toThrow(/Euro/i);
    expect(accounts.get(db, 'bad-usd')).toBeUndefined();

    const usd = accounts.create(
      db,
      {
        id: 'usd-tracking',
        name: 'USD tracking',
        type: 'checking',
        role: 'budget',
        onBudget: false,
        currency: 'USD',
        openingDate: '2023-10-01',
      },
      ctx,
    );
    expect(usd).toMatchObject({ currency: 'USD', onBudget: false });
    expect(() => accounts.update(db, usd.id, { onBudget: true }, ctx)).toThrow(/Euro/i);
    expect(accounts.get(db, usd.id)).toMatchObject({ currency: 'USD', onBudget: false });

    // A legacy invalid row can still be repaired by leaving the budget.
    db.update(account).set({ onBudget: true }).where(eq(account.id, usd.id)).run();
    expect(() => accounts.update(db, usd.id, { onBudget: false }, ctx)).not.toThrow();
    expect(accounts.get(db, usd.id)).toMatchObject({ currency: 'USD', onBudget: false });
  });

  it('defaults omitted currency to EUR for an on-budget account', () => {
    const row = createEntity(
      db,
      account,
      {
        id: 'default-eur',
        name: 'Euro account',
        type: 'checking',
        role: 'budget',
        onBudget: true,
        openingDate: '2023-10-01',
      },
      ctx,
    );
    expect(row.currency).toBe('EUR');
  });

  it('refuses to restore or undo/redo into an unsupported on-budget currency', () => {
    const usd = accounts.create(
      db,
      {
        id: 'usd-deleted',
        name: 'USD tracking',
        type: 'checking',
        role: 'budget',
        onBudget: false,
        currency: 'USD',
        openingDate: '2023-10-01',
      },
      ctx,
    );
    accounts.softDelete(db, usd.id, ctx);
    db.update(account).set({ onBudget: true }).where(eq(account.id, usd.id)).run();
    expect(() => accounts.restore(db, usd.id, ctx)).toThrow(/Euro/i);
    expect(accounts.get(db, usd.id)).toBeUndefined();

    const redone = accounts.create(
      db,
      {
        id: 'usd-redo',
        name: 'USD tracking',
        type: 'checking',
        role: 'budget',
        onBudget: false,
        currency: 'USD',
        openingDate: '2023-10-01',
      },
      ctx,
    );
    updateTracked(
      db,
      account,
      [redone.id],
      { onBudget: true },
      { ...ctx, groupId: 'legacy-invalid' },
    );
    const reverted = undo(db, { groupId: 'legacy-invalid' }, ctx);
    expect(accounts.get(db, redone.id)).toMatchObject({ onBudget: false, currency: 'USD' });
    expect(() => undo(db, { groupId: reverted.groupId }, ctx)).toThrow(/Euro/i);
    expect(() => undo(db, { groupId: reverted.groupId }, ctx, { force: true })).toThrow(/Euro/i);
    expect(accounts.get(db, redone.id)).toMatchObject({ onBudget: false, currency: 'USD' });
  });

  it('does not reinterpret live booking cents when changing an account currency or undoing it', () => {
    const usd = accounts.create(
      db,
      {
        id: 'usd-with-booking',
        name: 'USD tracking',
        type: 'checking',
        role: 'budget',
        onBudget: false,
        currency: 'USD',
        openingDate: '2023-10-01',
      },
      ctx,
    );
    createBooking(
      db,
      {
        accountId: usd.id,
        date: '2026-06-01',
        amountCents: 1000,
        splits: [{ amountCents: 1000, categoryId: null }],
      },
      ctx,
    );
    expect(() => accounts.update(db, usd.id, { currency: 'EUR' }, ctx)).toThrow(
      /currency|Währung/i,
    );
    expect(accounts.get(db, usd.id)?.currency).toBe('USD');

    const empty = accounts.create(
      db,
      {
        id: 'eur-empty',
        name: 'EUR tracking',
        type: 'checking',
        role: 'budget',
        onBudget: false,
        currency: 'EUR',
        openingDate: '2023-10-01',
      },
      ctx,
    );
    accounts.update(db, empty.id, { currency: 'USD' }, ctx);
    createBooking(
      db,
      {
        accountId: empty.id,
        date: '2026-06-01',
        amountCents: 1000,
        splits: [{ amountCents: 1000, categoryId: null }],
      },
      ctx,
    );
    const currencyChange = history(db, 'account', empty.id).find((e) => e.action === 'update')!;
    expect(() => undo(db, { auditId: currencyChange.id }, ctx)).toThrow(/currency|Währung/i);
    expect(() => undo(db, { auditId: currencyChange.id }, ctx, { force: true })).toThrow(
      /currency|Währung/i,
    );
    expect(accounts.get(db, empty.id)?.currency).toBe('USD');
  });

  it('refuses to restore an off-budget account whose currency no longer matches live bookings', () => {
    const usd = accounts.create(
      db,
      {
        id: 'usd-restore-mismatch',
        name: 'USD tracking',
        type: 'checking',
        role: 'budget',
        onBudget: false,
        currency: 'USD',
        openingDate: '2023-10-01',
      },
      ctx,
    );
    createBooking(
      db,
      {
        accountId: usd.id,
        date: '2026-06-01',
        amountCents: 1000,
        splits: [{ amountCents: 1000, categoryId: null }],
      },
      ctx,
    );
    accounts.softDelete(db, usd.id, ctx);
    db.update(account).set({ currency: 'EUR' }).where(eq(account.id, usd.id)).run();
    expect(() => accounts.restore(db, usd.id, ctx)).toThrow(BookingInvariantError);
    expect(accounts.get(db, usd.id)).toBeUndefined();
  });

  it('creates accounts with role and terms and lists them by sort_order', () => {
    accounts.create(
      db,
      {
        id: 'b',
        name: 'Giro',
        type: 'checking',
        role: 'budget',
        onBudget: true,
        openingDate: '2023-10-01',
        sortOrder: 2,
      },
      ctx,
    );
    accounts.create(
      db,
      {
        id: 'a',
        name: 'Kredit',
        type: 'loan',
        role: 'debt',
        onBudget: false,
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
      {
        id: 'c',
        name: 'Anlage',
        type: 'brokerage',
        role: 'investment',
        onBudget: false,
        openingDate: '2023-10-01',
        sortOrder: 3,
      },
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
