import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createTestDatabase } from './client';
import { account, booking, bookingSplit, category, categoryGroup, price, security } from './schema';

describe('database', () => {
  it('applies the migrations and enforces foreign keys', () => {
    const { db, close } = createTestDatabase();
    const tables = db.all<{ name: string }>(
      sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '\\_\\_%' ESCAPE '\\' AND name NOT LIKE 'sqlite_%'`,
    );
    expect(tables.length).toBeGreaterThanOrEqual(28);
    expect(() =>
      db
        .insert(booking)
        .values({ id: 'b1', accountId: 'missing', date: '2026-01-01', amountCents: -100 })
        .run(),
    ).toThrow(/FOREIGN KEY/);
    close();
  });

  it('rejects values outside the fixed sets (CHECK constraints)', () => {
    const { db, close } = createTestDatabase();
    expect(() =>
      db
        .insert(account)
        .values({ id: 'a1', name: 'x', role: 'wallet' as never, openingDate: '2023-10-01' })
        .run(),
    ).toThrow(/CHECK/);
    db.insert(categoryGroup).values({ id: 'g', name: 'Wohnen' }).run();
    expect(() =>
      db
        .insert(category)
        .values({ id: 'c', name: 'Miete', groupId: 'g', class: 'luxury' as never })
        .run(),
    ).toThrow(/CHECK/);
    close();
  });

  it('keeps one price per product and day', () => {
    const { db, close } = createTestDatabase();
    db.insert(security).values({ id: 's', name: 'ETF', kind: 'etf' }).run();
    const row = {
      securityId: 's',
      date: '2026-01-01',
      priceMicro: 100_000_000,
      source: 'manual' as const,
    };
    db.insert(price).values(row).run();
    expect(() => db.insert(price).values(row).run()).toThrow(/UNIQUE|PRIMARY/);
    close();
  });

  it('import keys are unique per account, other accounts may reuse them', () => {
    const { db, close } = createTestDatabase();
    for (const id of ['a1', 'a2']) {
      db.insert(account).values({ id, name: id, role: 'budget', openingDate: '2023-10-01' }).run();
    }
    const base = { date: '2026-01-01', amountCents: -100, importKey: 'k1' };
    db.insert(booking)
      .values({ id: 'b1', accountId: 'a1', ...base })
      .run();
    expect(() =>
      db
        .insert(booking)
        .values({ id: 'b2', accountId: 'a1', ...base })
        .run(),
    ).toThrow(/UNIQUE/);
    db.insert(booking)
      .values({ id: 'b3', accountId: 'a2', ...base })
      .run();
    db.insert(bookingSplit).values({ id: 's1', bookingId: 'b1', amountCents: -100 }).run();
    close();
  });
});
