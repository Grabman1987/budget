import type { OpenedDatabase } from '../client';
import { createBooking } from './bookings';
import { ensureDefaultRules } from './rules';

export const FREEDOM_DAY_615 = '2024-02-01';
export const FREEDOM_HISTORY_615 = '2023-10-31';

/** Literal account sums, no market data or real household records. */
export function freedomUniverseFixture615(opened: OpenedDatabase) {
  opened.sqlite.exec(`
    INSERT INTO account
      (id,name,type,role,on_budget,opening_date,opening_balance_cents,allocation_scope)
    VALUES
      ('selected','Selected brokerage','brokerage','investment',0,'2023-10-01',20000,'default'),
      ('excluded','Excluded brokerage','brokerage','investment',0,'2023-10-01',30000,'excluded'),
      ('savings','Selected savings','savings','budget',0,'2023-10-01',7000,'included'),
      ('negative','Negative settlement','brokerage','investment',0,'2023-10-01',-2000,'default'),
      ('budget','Ordinary checking','checking','budget',1,'2023-10-01',100000,'default');
    INSERT INTO asset_class (id,name) VALUES ('basis','Synthetic basis');
    INSERT INTO category_group (id,name) VALUES ('synthetic','Synthetic spending');
    INSERT INTO category (id,group_id,name,class,kind) VALUES ('need','synthetic','Synthetic need','need','variable');
  `);
  for (const month of ['2023-10', '2023-11', '2023-12', '2024-01'])
    createBooking(
      opened.db,
      {
        accountId: 'budget',
        date: `${month}-15`,
        amountCents: -100,
        splits: [{ categoryId: 'need', amountCents: -100 }],
      },
      { actor: 'synthetic-fixture' },
    );
  ensureDefaultRules(opened.db);
}
