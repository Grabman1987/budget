import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { account } from './accounts';
import { id, isoDay, timestamps } from './common';

/**
 * Variable conditions of a loan: the nominal annual rate (basis points) that applies from a day on,
 * versioned like the other dated settings. The rate stored on the account is valid until the first
 * change. One live change per loan and day; a soft delete keeps the row for undo.
 */
export const loanRateChange = sqliteTable(
  'loan_rate_change',
  {
    id: id(),
    accountId: text('account_id')
      .notNull()
      .references(() => account.id),
    validFrom: text('valid_from').notNull(),
    rateBp: integer('rate_bp').notNull(),
    ...timestamps(),
  },
  (t) => [
    isoDay('loan_rate_change_day_chk', t.validFrom),
    check('loan_rate_change_rate_chk', sql`${t.rateBp} BETWEEN 0 AND 100000`),
    uniqueIndex('loan_rate_change_live_uq')
      .on(t.accountId, t.validFrom)
      .where(sql`${t.deletedAt} IS NULL`),
    index('loan_rate_change_account_idx').on(t.accountId, t.validFrom),
  ],
);

/**
 * A named what-if of one loan (Sondertilgung once or recurring, rate change, higher installment).
 * `measures_json` is validated by the domain schema before every write; money is integer cents.
 */
export const loanScenario = sqliteTable(
  'loan_scenario',
  {
    id: id(),
    accountId: text('account_id')
      .notNull()
      .references(() => account.id),
    name: text('name').notNull(),
    measuresJson: text('measures_json').notNull(),
    ...timestamps(),
  },
  (t) => [
    check('loan_scenario_measures_chk', sql`json_valid(${t.measuresJson})`),
    index('loan_scenario_account_idx').on(t.accountId),
  ],
);
