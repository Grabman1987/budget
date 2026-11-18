import { afterEach, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { createTestDatabase } from '../client';
import { seedBasics } from './test-helpers';
import { readStatementPurchaseBookings } from './statement-purchase-check';
const opened = createTestDatabase();
afterEach(() => opened.close());
it('reads the full cycle including pending refunds, excludes deleted and whole transfers, and exposes mixed omissions', () => {
  const db = opened.db;
  seedBasics(db);
  db.run(sql`INSERT INTO transfer(id) VALUES ('t')`);
  db.run(
    sql`INSERT INTO booking(id,account_id,date,amount_cents,currency,status) VALUES ('purchase','giro','2030-12-20',-1000,'EUR','confirmed'), ('refund','giro','2031-01-19',234,'EUR','pending'), ('new','giro','2031-01-20',-999,'EUR','confirmed'), ('mixed','giro','2031-01-01',-100,'EUR','confirmed'), ('gone','giro','2031-01-01',-100,'EUR','confirmed'), ('foreign','giro','2031-01-01',-100,'USD','confirmed')`,
  );
  db.run(sql`UPDATE booking SET deleted_at='2031-01-02' WHERE id='gone'`);
  db.run(
    sql`INSERT INTO booking(id,account_id,date,amount_cents,currency,transfer_id) VALUES ('settlement','giro','2031-01-02',9999,'EUR','t')`,
  );
  db.run(
    sql`INSERT INTO booking_split(id,booking_id,amount_cents,transfer_id) VALUES ('mixed-split','mixed',-100,'t')`,
  );
  const before = db.all(sql`SELECT * FROM audit_log`);
  const result = readStatementPurchaseBookings(db, 'giro', {
    from: '2030-12-20',
    to: '2031-01-19',
  });
  expect(result.bookings.map((b) => [b.id, b.amountCents])).toEqual([
    ['purchase', -1000],
    ['refund', 234],
  ]);
  expect(result.omitted).toBe(2);
  expect(readStatementPurchaseBookings(db, 'giro', null)).toEqual({ bookings: [], omitted: 0 });
  expect(db.all(sql`SELECT * FROM audit_log`)).toEqual(before);
});
