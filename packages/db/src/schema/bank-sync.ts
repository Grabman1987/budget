import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { account } from './accounts';
import { cents, id, isoDay } from './common';

/** Protocol state is separate from owner-editable ledger data. Secrets are AES-GCM. */
export const bankSyncConsent = sqliteTable('bank_sync_consent', {
  id: id(),
  initiator: text('initiator').notNull(),
  stateHash: text('state_hash').notNull().unique(),
  expiresAt: text('expires_at').notNull(),
  usedAt: text('used_at'),
  secret: text('secret'),
  label: text('label').notNull(),
  validUntil: text('valid_until'),
  status: text('status').notNull().default('pending'),
  lastAttemptAt: text('last_attempt_at'),
  lastSuccessAt: text('last_success_at'),
  nextRunAt: text('next_run_at').notNull(),
  failures: integer('failures').notNull().default(0),
  leaseUntil: text('lease_until'),
});

export const bankSyncAccount = sqliteTable('bank_sync_account', {
  id: id(),
  consentId: text('consent_id')
    .notNull()
    .references(() => bankSyncConsent.id),
  secret: text('secret').notNull(),
  label: text('label').notNull(),
  currency: text('currency').notNull(),
  accountId: text('account_id').references(() => account.id),
  fromDate: text('from_date'),
  lastSyncAt: text('last_sync_at'),
  requestDay: text('request_day'),
  requestCount: integer('request_count').notNull().default(0),
});

/** Staged transactions never affect balances. Their inbox decision is the confirmation state. */
export const bankSyncCandidate = sqliteTable(
  'bank_sync_candidate',
  {
    id: id(),
    accountId: text('account_id')
      .notNull()
      .references(() => account.id),
    dedupeKey: text('dedupe_key').notNull(),
    date: text('date').notNull(),
    amountCents: cents('amount_cents').notNull(),
    currency: text('currency').notNull(),
    memo: text('memo').notNull(),
  },
  (t) => [
    uniqueIndex('bank_sync_candidate_key_uq').on(t.accountId, t.dedupeKey),
    isoDay('bank_sync_candidate_date_chk', t.date),
  ],
);
