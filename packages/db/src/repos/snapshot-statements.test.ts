import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { installStatementCache, type StatementCacheStats } from './snapshot-statements';

let db: Database.Database;
let stats: StatementCacheStats;
let release: () => void;
beforeEach(() => {
  db = new Database(':memory:');
  db.exec('create table t (id integer primary key, name text, cents integer)');
  db.exec("insert into t values (1, 'a', 10), (2, 'b', 20), (3, 'c', 30)");
  stats = { executed: 0, reused: 0 };
  release = installStatementCache(db, stats);
});
afterEach(() => db.close());

it('answers a repeated read with the same text and parameters from the first answer', () => {
  const read = () => db.prepare('select id, cents from t where cents > ? order by id').all(10);
  expect(read()).toEqual([
    { id: 2, cents: 20 },
    { id: 3, cents: 30 },
  ]);
  expect(read()).toEqual(read());
  expect(stats).toEqual({ executed: 1, reused: 2 });
  db.prepare('select id from t where cents > ?').all(20);
  expect(stats.executed).toBe(2);
});

it('keeps raw and object answers, `get` and `all` apart', () => {
  const sql = 'select id, name from t order by id';
  expect(db.prepare(sql).raw().all()).toEqual([
    [1, 'a'],
    [2, 'b'],
    [3, 'c'],
  ]);
  expect(db.prepare(sql).all()[0]).toEqual({ id: 1, name: 'a' });
  expect(db.prepare(sql).raw().get()).toEqual([1, 'a']);
  expect(db.prepare(sql).get()).toEqual({ id: 1, name: 'a' });
  expect(stats.executed).toBe(4);
  expect(db.prepare(sql).raw().all()).toHaveLength(3);
  expect(stats.executed).toBe(4);
});

it('hands out copies: a caller editing its rows cannot change the next answer', () => {
  const sql = 'select id, name from t order by id';
  const first = db.prepare(sql).all() as { id: number; name: string }[];
  first[0]!.name = 'changed';
  first.pop();
  const rawFirst = db.prepare(sql).raw().all() as unknown[][];
  rawFirst[0]![1] = 'changed';
  expect(db.prepare(sql).all()).toEqual([
    { id: 1, name: 'a' },
    { id: 2, name: 'b' },
    { id: 3, name: 'c' },
  ]);
  expect(db.prepare(sql).raw().all()[0]).toEqual([1, 'a']);
});

it('never caches writes, volatile functions, pragmas or other statement modes', () => {
  expect(db.prepare('update t set cents = cents + 1').run().changes).toBe(3);
  expect(db.prepare('update t set cents = cents + 1').run().changes).toBe(3);
  db.prepare('select total_changes() as n').get();
  db.prepare('select total_changes() as n').get();
  db.prepare("select datetime('now') as n").get();
  db.prepare("select datetime('now') as n").get();
  expect(stats).toEqual({ executed: 0, reused: 0 });
  const plucked = db.prepare('select name from t order by id');
  expect(plucked.pluck().all()).toEqual(['a', 'b', 'c']);
  expect(db.prepare('select name from t order by id').all()).toHaveLength(3);
  expect(stats.executed).toBe(1);
});

it('does not cache named or blob parameters', () => {
  db.prepare('select id from t where name = @name').all({ name: 'a' });
  db.prepare('select id from t where name = @name').all({ name: 'a' });
  db.prepare('select id from t where name = ?').all(Buffer.from('a'));
  expect(stats).toEqual({ executed: 0, reused: 0 });
});

it('separates parameters that only differ in type or concatenation', () => {
  db.prepare('select ? as v').get('1');
  db.prepare('select ? as v').get(1);
  expect(db.prepare('select ? as v').get('1')).toEqual({ v: '1' });
  expect(db.prepare('select ? as v').get(1)).toEqual({ v: 1 });
  expect(stats.executed).toBe(2);
});

it('restores the plain connection on release', () => {
  release();
  db.prepare('select cents from t where id = 1').get();
  db.prepare('select cents from t where id = 1').get();
  expect(stats).toEqual({ executed: 0, reused: 0 });
});
