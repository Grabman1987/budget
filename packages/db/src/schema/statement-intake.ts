import { sql } from 'drizzle-orm';
import { check, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { account } from './accounts';
import { receipt } from './bookings';
import { id, oneOf, timestamps } from './common';
export const statementIntake = sqliteTable(
  'statement_intake',
  {
    id: id(),
    sha256: text('sha256').notNull(),
    receiptId: text('receipt_id')
      .notNull()
      .references(() => receipt.id),
    accountId: text('account_id')
      .notNull()
      .references(() => account.id),
    status: text('status', { enum: ['pending', 'reviewed', 'rejected'] })
      .notNull()
      .default('pending'),
    proposalJson: text('proposal_json').notNull(),
    reviewedJson: text('reviewed_json'),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('statement_intake_sha256_uq').on(t.sha256),
    oneOf('statement_intake_status_chk', t.status, ['pending', 'reviewed', 'rejected']),
    check(
      'statement_intake_sha_chk',
      sql`length(${t.sha256}) = 64 AND ${t.sha256} NOT GLOB '*[^0-9a-f]*'`,
    ),
    check(
      'statement_intake_review_chk',
      sql`(${t.status} = 'reviewed' AND ${t.reviewedJson} IS NOT NULL) OR (${t.status} != 'reviewed' AND ${t.reviewedJson} IS NULL)`,
    ),
  ],
);
