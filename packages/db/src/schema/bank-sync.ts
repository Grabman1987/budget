import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { account } from './accounts';
import { cents, id, isoDay, timestamps } from './common';
import { payee } from './budget';

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
  balanceCents: cents('balance_cents'),
  balanceDate: text('balance_date'),
  balanceFetchedAt: text('balance_fetched_at'),
  requestDay: text('request_day'),
  requestCount: integer('request_count').notNull().default(0),
});

/** Provider identity survives posting and deletion; pending rows remain candidates until confirmed. */
export const bankSyncCandidate = sqliteTable(
  'bank_sync_candidate',
  {
    id: id(),
    accountId: text('account_id')
      .notNull()
      .references(() => account.id),
    dedupeKey: text('dedupe_key').notNull(),
    bankStatus: text('bank_status', { enum: ['booked', 'pending'] })
      .notNull()
      .default('booked'),
    date: text('date').notNull(),
    amountCents: cents('amount_cents').notNull(),
    currency: text('currency').notNull(),
    memo: text('memo').notNull(),
    rawPayee: text('raw_payee'),
    sourceId: text('source_id').references(() => bankSyncAccount.id),
  },
  (t) => [
    uniqueIndex('bank_sync_candidate_key_uq').on(t.accountId, t.dedupeKey),
    isoDay('bank_sync_candidate_date_chk', t.date),
  ],
);

export const bankPayeeCleanup = sqliteTable('bank_payee_cleanup', {
  id: text('id').primaryKey(),
  configJson: text('config_json').notNull(),
  ...timestamps(),
});
export const bankPayeeAlias = sqliteTable(
  'bank_payee_alias',
  {
    id: text('id').primaryKey(),
    sourceId: text('source_id').notNull(),
    rawKey: text('raw_key').notNull(),
    payeeId: text('payee_id')
      .notNull()
      .references(() => payee.id),
    ...timestamps(),
  },
  (t) => [uniqueIndex('bank_payee_alias_key_uq').on(t.sourceId, t.rawKey)],
);
