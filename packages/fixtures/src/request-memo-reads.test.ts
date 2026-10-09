import {
  budget,
  createTestDatabase,
  ensureDefaultRules,
  heute,
  monthOnePager,
  planMonthViews,
  readInbox,
  readInboxCount,
  reportTables,
  runWithValuationNotes,
  wholePicture,
  type Db,
} from '@budget/db';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { seedDatabase } from './seed';

/**
 * Money results must not change with the per-request reads (budget ledger, valuation inputs, rule
 * facts, ledger classification). Every read model is computed without a request memo (the plain
 * code path of scripts and tests) and inside one (as the API runs it, also twice in a row so the
 * second answer comes from the stored reads); all answers are identical, cent for cent.
 */
vi.setConfig({ testTimeout: 120_000 });

const TODAY = '2026-09-17';
let db: Db;
beforeAll(() => {
  db = createTestDatabase().db;
  seedDatabase(db);
  ensureDefaultRules(db);
}, 240_000);

const reads: Record<string, () => unknown> = {
  heute: () => heute(db, { today: TODAY, period: 'month' }),
  heutePayday: () => heute(db, { today: TODAY, period: 'payday' }),
  budgetMonths: () => budget(db, ['2026-07', '2026-08', '2026-09']),
  budgetAsOf: () => budget(db, ['2026-09'], { asOf: TODAY }),
  planMonths: () => planMonthViews(db, ['2026-08', '2026-09', '2026-10'], {}, TODAY),
  reportTables: () => reportTables(db, { today: TODAY, withNetWorth: true }),
  wholePicture: () => wholePicture(db, TODAY, '1J'),
  onePager: () => monthOnePager(db, TODAY, '2026-09'),
  inbox: () => readInbox(db, TODAY),
  inboxCount: () => readInboxCount(db, TODAY),
};

describe('request memo does not change any figure', () => {
  for (const [name, read] of Object.entries(reads))
    it(name, () => {
      const plain = JSON.parse(JSON.stringify(read())) as unknown;
      const [first, second] = runWithValuationNotes(() => [
        JSON.parse(JSON.stringify(read())) as unknown,
        JSON.parse(JSON.stringify(read())) as unknown,
      ]);
      expect(first).toEqual(plain);
      expect(second).toEqual(plain);
    });

  it('all read models in one request, in any order, give the same answers', () => {
    const plain = Object.fromEntries(
      Object.entries(reads).map(([k, read]) => [k, JSON.parse(JSON.stringify(read())) as unknown]),
    );
    const names = Object.keys(reads).reverse();
    const together = runWithValuationNotes(() =>
      Object.fromEntries(names.map((k) => [k, JSON.parse(JSON.stringify(reads[k]!())) as unknown])),
    );
    for (const k of names) expect(together[k], k).toEqual(plain[k]);
  });
});
