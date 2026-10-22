-- Disposable-copy rollback only. Disable foreign_keys BEFORE opening the transaction (as the
-- forward migrator does); deferral alone is insufficient for this table-copy/drop/rename.
-- Run this whole script in one transaction, check foreign_key_check before commit, and restore
-- foreign_keys in the caller's finally block after commit/rollback. Never run on a live database.
CREATE TEMP TABLE statement_auto_rollback_guard(n INTEGER CHECK(n=0));
INSERT INTO statement_auto_rollback_guard SELECT foreign_keys FROM pragma_foreign_keys;
-- An older rollback must never cross a later applied migration.
INSERT INTO statement_auto_rollback_guard SELECT count(*) FROM __drizzle_migrations WHERE created_at > 1792510000000;
INSERT INTO statement_auto_rollback_guard SELECT count(*) FROM statement_automation_config;
INSERT INTO statement_auto_rollback_guard SELECT count(*) FROM statement_automation_run;
INSERT INTO statement_auto_rollback_guard SELECT count(*) FROM statement_automation_row;
INSERT INTO statement_auto_rollback_guard SELECT count(*) FROM audit_log WHERE entity_type IN ('statement_automation_config','statement_automation_row');
INSERT INTO statement_auto_rollback_guard SELECT count(*) FROM statement_settlement WHERE reference IS NULL OR json_extract(origins_json,'$.origin')='machine';
PRAGMA defer_foreign_keys=ON;
DROP TABLE statement_automation_row;
DROP TABLE statement_automation_run;
DROP TABLE statement_automation_config;
CREATE TABLE `__old_statement_settlement` (
 `id` text PRIMARY KEY NOT NULL,
 `source_intake_id` text NOT NULL REFERENCES `statement_intake`(`id`),
 `receipt_id` text NOT NULL REFERENCES `receipt`(`id`),
 `source_sha256` text NOT NULL,
 `source_revision` text NOT NULL,
 `card_account_id` text NOT NULL REFERENCES `account`(`id`),
 `reference` text NOT NULL,
 `issue_date` text NOT NULL CHECK (`issue_date` GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
 `currency` text NOT NULL,
 `origins_json` text NOT NULL,
 `representation_kind` text,
 `action_group_id` text,
 `created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
 `updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
 `deleted_at` text,
 `funding_account_id` text NOT NULL REFERENCES `account`(`id`),
 `debit_date` text NOT NULL CHECK (`debit_date` GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
 `payable_cents` integer NOT NULL CHECK (typeof(`payable_cents`)='integer' AND abs(`payable_cents`)<=9007199254740991),
 `state` text NOT NULL CHECK (`state` IN ('open','represented','zero','credit_manual','withdrawn','superseded')),
 `supersedes_id` text REFERENCES `statement_settlement`(`id`),
 `legacy_payment_id` text REFERENCES `expected_payment`(`id`), `legacy_due_date` text,
 `transfer_id` text REFERENCES `transfer`(`id`),
 `from_booking_id` text REFERENCES `booking`(`id`), `to_booking_id` text REFERENCES `booking`(`id`),
 CHECK ((`state` IN ('open','represented') AND `payable_cents`>0) OR (`state`='zero' AND `payable_cents`=0) OR (`state`='credit_manual' AND `payable_cents`<0) OR `state` IN ('withdrawn','superseded')),
 CHECK ((`state`='represented' AND `representation_kind` IS NOT NULL AND `representation_kind` IN ('created','linked') AND `transfer_id` IS NOT NULL AND `from_booking_id` IS NOT NULL AND `to_booking_id` IS NOT NULL AND `from_booking_id`!=`to_booking_id` AND `action_group_id` IS NOT NULL) OR (`state`!='represented' AND `representation_kind` IS NULL AND `transfer_id` IS NULL AND `from_booking_id` IS NULL AND `to_booking_id` IS NULL AND `action_group_id` IS NULL)),
 CHECK ((`legacy_payment_id` IS NULL)=(`legacy_due_date` IS NULL))
);
INSERT INTO `__old_statement_settlement` (`id`, `source_intake_id`, `receipt_id`, `source_sha256`, `source_revision`, `card_account_id`, `reference`, `issue_date`, `currency`, `origins_json`, `representation_kind`, `action_group_id`, `created_at`, `updated_at`, `deleted_at`, `funding_account_id`, `debit_date`, `payable_cents`, `state`, `supersedes_id`, `legacy_payment_id`, `legacy_due_date`, `transfer_id`, `from_booking_id`, `to_booking_id`) SELECT `id`, `source_intake_id`, `receipt_id`, `source_sha256`, `source_revision`, `card_account_id`, `reference`, `issue_date`, `currency`, `origins_json`, `representation_kind`, `action_group_id`, `created_at`, `updated_at`, `deleted_at`, `funding_account_id`, `debit_date`, `payable_cents`, `state`, `supersedes_id`, `legacy_payment_id`, `legacy_due_date`, `transfer_id`, `from_booking_id`, `to_booking_id` FROM statement_settlement;
DROP TABLE statement_settlement;
ALTER TABLE __old_statement_settlement RENAME TO statement_settlement;
CREATE UNIQUE INDEX `statement_settlement_source_uq` ON `statement_settlement` (`source_intake_id`) WHERE `deleted_at` IS NULL AND `state` NOT IN ('withdrawn','superseded');

CREATE UNIQUE INDEX `statement_settlement_identity_uq` ON `statement_settlement` (`card_account_id`,`reference`,`issue_date`) WHERE `deleted_at` IS NULL AND `state` NOT IN ('withdrawn','superseded');

CREATE UNIQUE INDEX `statement_settlement_transfer_uq` ON `statement_settlement` (`transfer_id`) WHERE `deleted_at` IS NULL AND `state`='represented';

CREATE UNIQUE INDEX `statement_settlement_legacy_uq` ON `statement_settlement` (`legacy_payment_id`,`legacy_due_date`) WHERE `deleted_at` IS NULL AND `state` NOT IN ('withdrawn','superseded');

DELETE FROM __drizzle_migrations WHERE created_at=1792510000000;
INSERT INTO statement_auto_rollback_guard SELECT count(*) FROM pragma_foreign_key_check;
DROP TABLE statement_auto_rollback_guard;
