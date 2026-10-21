import { createTestDatabase, type FreedomInvestedHistory } from '@budget/db';
import { expect, it } from 'vitest';
import { wealthRoutes } from './wealth';

it('returns one additive current/history snapshot, preserving known past when today cannot be valued', async () => {
  const opened = createTestDatabase();
  try {
    opened.sqlite.exec(`
      INSERT INTO account (id,name,type,role,on_budget,opening_date,opening_balance_cents) VALUES
        ('selected','Synthetic cash','brokerage','investment',0,'2023-10-01',12345);
      INSERT INTO security (id,name,kind,currency) VALUES ('fund','Synthetic fund','etf','EUR');
      INSERT INTO holding (id,account_id,security_id,as_of,units_e8) VALUES
        ('h','selected','fund','2023-11-15',100000000);
    `);
    const before = opened.sqlite.prepare('SELECT total_changes() AS n').get();
    const response = await wealthRoutes(opened.db, () => '2023-11-20').request('/freedom');
    expect(response.status).toBe(200);
    const view = (await response.json()) as {
      investedCents: number | null;
      investedHistory: FreedomInvestedHistory;
    };
    expect(view.investedCents).toBeNull();
    expect(view.investedHistory).toEqual({
      availableFrom: '2023-10-01',
      monthEnds: [{ date: '2023-10-31', investedCents: 12345 }],
      current: { date: '2023-11-20', investedCents: null },
    });
    expect(opened.sqlite.prepare('SELECT total_changes() AS n').get()).toEqual(before);
  } finally {
    opened.close();
  }
});
