import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { undo } from './audit';
import { orderAccounts, orderAccountsByNames } from './account-order';
import { accounts } from './entities';
import { ConflictError, EntityNotFoundError } from './errors';

const ctx = { actor: 'tester' };
let opened: OpenedDatabase;
let db: OpenedDatabase['db'];

const make = (name: string, sortOrder: number) =>
  accounts.create(
    db,
    {
      name,
      type: 'checking',
      role: 'budget',
      onBudget: true,
      openingDate: '2026-01-01',
      sortOrder,
    },
    ctx,
  ).id;
const names = () => accounts.list(db).map((a) => a.name);

beforeEach(() => {
  opened = createTestDatabase();
  db = opened.db;
});
afterEach(() => opened.close());

describe('orderAccounts', () => {
  it('numbers the listed accounts first, the rest follows, and writes only what changed', () => {
    const a = make('A', 1);
    const b = make('B', 2);
    const c = make('C', 3);
    const result = orderAccounts(db, [c], ctx);
    expect(result.order).toEqual([c, a, b]);
    expect(result.changed).toBe(3);
    expect(names()).toEqual(['C', 'A', 'B']);
    expect(orderAccounts(db, [c, a, b], ctx).changed).toBe(0);
  });

  it('is atomic and undoes as one group', () => {
    const a = make('A', 1);
    const b = make('B', 2);
    expect(() => orderAccounts(db, [b, 'missing'], ctx)).toThrow(EntityNotFoundError);
    expect(() => orderAccounts(db, [a, a], ctx)).toThrow(ConflictError);
    expect(names()).toEqual(['A', 'B']);
    const moved = orderAccounts(db, [b, a], ctx);
    expect(names()).toEqual(['B', 'A']);
    undo(db, { groupId: moved.groupId }, ctx);
    expect(names()).toEqual(['A', 'B']);
  });

  it('normalises ties and zeros into a gapless sequence', () => {
    make('Zeta', 0);
    make('Alpha', 0);
    const c = make('Mid', 0);
    orderAccounts(db, [c], ctx);
    expect(accounts.list(db).map((a) => [a.name, a.sortOrder])).toEqual([
      ['Mid', 1],
      ['Alpha', 2],
      ['Zeta', 3],
    ]);
  });
});

describe('orderAccountsByNames', () => {
  it('orders by name, reports unknown and ambiguous names and creates nothing', () => {
    make('Geldbörse', 1);
    make('Visa', 2);
    make('Depot', 3);
    make('Dupe', 4);
    make('dupe', 5);
    const result = orderAccountsByNames(
      db,
      [' depot ', 'Geldbörse', 'Nirgends', 'Dupe', 'Depot'],
      ctx,
    );
    expect(result.unknown).toEqual(['Nirgends']);
    expect(result.ambiguous).toEqual(['Dupe']);
    expect(names()).toEqual(['Depot', 'Geldbörse', 'Visa', 'Dupe', 'dupe']);
    expect(accounts.list(db)).toHaveLength(5);
  });

  it('writes nothing in a dry run', () => {
    make('A', 1);
    make('B', 2);
    const result = orderAccountsByNames(db, ['B'], ctx, { dryRun: true });
    expect(result.changed).toBe(0);
    expect(names()).toEqual(['A', 'B']);
  });
});
