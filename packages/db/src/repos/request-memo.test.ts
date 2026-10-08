import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { account } from '../schema';
import { memoized, memoizedShared, runWithRequestMemo } from './request-memo';
import { createBooking } from './bookings';
import { explorerReport } from './overview-reports';
import { overviewData } from './report-ledger';
import { seedBasics, testCtx } from './test-helpers';

let opened: OpenedDatabase;
beforeEach(() => {
  opened = createTestDatabase();
});
afterEach(() => opened.close());

const insertAccount = (id: string) =>
  opened.db
    .insert(account)
    .values({
      id,
      name: id,
      type: 'checking',
      role: 'budget',
      onBudget: true,
      openingDate: '2026-01-01',
      openingBalanceCents: 0,
    } as never)
    .run();

describe('request memo', () => {
  it('keeps later spending available after an earlier Explorer read in the same request', () => {
    seedBasics(opened.db);
    const ids = (
      [
        ['2026-09-10', -125],
        ['2026-09-20', -375],
      ] as const
    ).map(([date, cents]) =>
      createBooking(
        opened.db,
        {
          accountId: 'giro',
          date,
          amountCents: cents,
          splits: [{ categoryId: 'reise', amountCents: cents }],
        },
        testCtx,
      ),
    );
    const query = {
      dim: 'kategorie',
      cls: 'alle',
      cols: 'monat',
      period: '2026-09..2026-09',
      meas: 'summe',
    } as const;
    runWithRequestMemo(() => {
      const first = explorerReport(opened.db, query, '2026-09-15');
      expect(first.result.rows.find((r) => r.key === 'reise')?.total).toBe(125);
      const later = explorerReport(opened.db, query, '2026-09-30');
      expect(later.result.rows.find((r) => r.key === 'reise')?.total).toBe(500);
      expect(
        overviewData(opened.db)
          .splits.map((s) => s.bookingId)
          .sort(),
      ).toEqual(ids.sort());
    });
  });

  it('computes once per request and gives the stored object to every caller (shared)', () => {
    let computed = 0;
    const read = () => memoizedShared(opened.db, 'k', () => ({ n: ++computed }));
    expect(read()).not.toBe(read()); // outside a request nothing is stored
    computed = 0;
    runWithRequestMemo(() => {
      const first = read();
      expect(read()).toBe(first);
      expect(computed).toBe(1);
    });
  });

  it('copies on `memoized`, shares on `memoizedShared`', () => {
    runWithRequestMemo(() => {
      const copy = memoized(opened.db, 'a', () => ({ v: 1 }));
      expect(memoized(opened.db, 'a', () => ({ v: 2 }))).not.toBe(copy);
      const shared = memoizedShared(opened.db, 'b', () => ({ v: 1 }));
      expect(memoizedShared(opened.db, 'b', () => ({ v: 2 }))).toBe(shared);
    });
  });

  it('drops entries when the database is written', () => {
    runWithRequestMemo(() => {
      let computed = 0;
      const read = () =>
        memoizedShared(opened.db, 'count', () => {
          computed++;
          return opened.db.select().from(account).all().length;
        });
      expect(read()).toBe(0);
      insertAccount('a');
      expect(read()).toBe(1);
      expect(read()).toBe(1);
      expect(computed).toBe(2);
    });
  });

  it('lets a read-only transaction reuse what the plain handle stored, but not after a write', () => {
    runWithRequestMemo(() => {
      let computed = 0;
      const count = (db: typeof opened.db) =>
        memoizedShared(db, 'count', () => {
          computed++;
          return db.select().from(account).all().length;
        });
      expect(count(opened.db)).toBe(0);
      opened.db.transaction((tx) => {
        expect(count(tx)).toBe(0);
        expect(computed).toBe(1); // served from the plain handle's entry
        tx.insert(account)
          .values({
            id: 'in-tx',
            name: 'in-tx',
            type: 'checking',
            role: 'budget',
            onBudget: true,
            openingDate: '2026-01-01',
            openingBalanceCents: 0,
          } as never)
          .run();
        expect(count(tx)).toBe(1); // the write moved the stamp: computed again
      });
      expect(count(opened.db)).toBe(1);
    });
  });

  it('never serves an entry of a rolled-back transaction', () => {
    runWithRequestMemo(() => {
      const count = (db: typeof opened.db) =>
        memoizedShared(db, 'count', () => db.select().from(account).all().length);
      expect(() =>
        opened.db.transaction((tx) => {
          tx.insert(account)
            .values({
              id: 'gone',
              name: 'gone',
              type: 'checking',
              role: 'budget',
              onBudget: true,
              openingDate: '2026-01-01',
              openingBalanceCents: 0,
            } as never)
            .run();
          expect(count(tx)).toBe(1);
          throw new Error('rollback');
        }),
      ).toThrow('rollback');
      expect(count(opened.db)).toBe(0);
    });
  });
});
