-- Preserve all legacy identities and columns; only machine issued-date identity permits a NULL reference.
PRAGMA defer_foreign_keys = ON;
--> statement-breakpoint
CREATE TABLE `__new_statement_settlement` (
 `id` text PRIMARY KEY NOT NULL,
 `source_intake_id` text NOT NULL REFERENCES `statement_intake`(`id`),
 `receipt_id` text NOT NULL REFERENCES `receipt`(`id`),
 `source_sha256` text NOT NULL,
 `source_revision` text NOT NULL,
 `card_account_id` text NOT NULL REFERENCES `account`(`id`),
 `reference` text,
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
--> statement-breakpoint
INSERT INTO `__new_statement_settlement` (`id`, `source_intake_id`, `receipt_id`, `source_sha256`, `source_revision`, `card_account_id`, `reference`, `issue_date`, `currency`, `origins_json`, `representation_kind`, `action_group_id`, `created_at`, `updated_at`, `deleted_at`, `funding_account_id`, `debit_date`, `payable_cents`, `state`, `supersedes_id`, `legacy_payment_id`, `legacy_due_date`, `transfer_id`, `from_booking_id`, `to_booking_id`) SELECT `id`, `source_intake_id`, `receipt_id`, `source_sha256`, `source_revision`, `card_account_id`, `reference`, `issue_date`, `currency`, `origins_json`, `representation_kind`, `action_group_id`, `created_at`, `updated_at`, `deleted_at`, `funding_account_id`, `debit_date`, `payable_cents`, `state`, `supersedes_id`, `legacy_payment_id`, `legacy_due_date`, `transfer_id`, `from_booking_id`, `to_booking_id` FROM `statement_settlement`;
--> statement-breakpoint
DROP TABLE `statement_settlement`;
--> statement-breakpoint
ALTER TABLE `__new_statement_settlement` RENAME TO `statement_settlement`;
--> statement-breakpoint
CREATE UNIQUE INDEX `statement_settlement_source_uq` ON `statement_settlement` (`source_intake_id`) WHERE `deleted_at` IS NULL AND `state` NOT IN ('withdrawn','superseded');
--> statement-breakpoint
CREATE UNIQUE INDEX `statement_settlement_identity_uq` ON `statement_settlement` (`card_account_id`,`reference`,`issue_date`) WHERE `deleted_at` IS NULL AND `state` NOT IN ('withdrawn','superseded');
--> statement-breakpoint
CREATE UNIQUE INDEX `statement_settlement_transfer_uq` ON `statement_settlement` (`transfer_id`) WHERE `deleted_at` IS NULL AND `state`='represented';
--> statement-breakpoint
CREATE UNIQUE INDEX `statement_settlement_legacy_uq` ON `statement_settlement` (`legacy_payment_id`,`legacy_due_date`) WHERE `deleted_at` IS NULL AND `state` NOT IN ('withdrawn','superseded');
--> statement-breakpoint
CREATE UNIQUE INDEX statement_settlement_issued_identity_uq ON statement_settlement(card_account_id,issue_date) WHERE reference IS NULL AND deleted_at IS NULL AND state NOT IN ('withdrawn','superseded');
--> statement-breakpoint
CREATE TABLE statement_automation_config (
 account_id TEXT PRIMARY KEY NOT NULL REFERENCES account(id),
 enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
 scheduled_payment_json TEXT NOT NULL DEFAULT 'null',
 mapped_cards_json TEXT NOT NULL CHECK(json_valid(mapped_cards_json) AND length(mapped_cards_json)<=16384),
 created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 updated_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')), deleted_at TEXT
);
--> statement-breakpoint
CREATE TABLE statement_automation_run (
 id TEXT PRIMARY KEY NOT NULL, key TEXT NOT NULL,
 source_intake_id TEXT NOT NULL REFERENCES statement_intake(id),
 source_sha256 TEXT NOT NULL, source_revision TEXT NOT NULL,
 account_id TEXT NOT NULL REFERENCES account(id), identity_key TEXT NOT NULL, issue_date TEXT NOT NULL,
 config_revision TEXT NOT NULL, plan_hash TEXT NOT NULL, source_proof_json TEXT NOT NULL, result_json TEXT NOT NULL,
 action_group_id TEXT, created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX statement_automation_run_key_unique ON statement_automation_run(key);
--> statement-breakpoint
CREATE TABLE statement_automation_row (
 id TEXT PRIMARY KEY NOT NULL, run_id TEXT NOT NULL REFERENCES statement_automation_run(id),
 source_intake_id TEXT NOT NULL REFERENCES statement_intake(id), source_sha256 TEXT NOT NULL,
 row_key TEXT NOT NULL, account_id TEXT NOT NULL REFERENCES account(id),
 receipt_id TEXT NOT NULL REFERENCES receipt(id), booking_id TEXT NOT NULL REFERENCES booking(id),
 original_booking_id TEXT REFERENCES booking(id), kind TEXT NOT NULL CHECK(kind IN ('created','linked','rebate')),
 proof_json TEXT NOT NULL CHECK(json_valid(proof_json) AND length(CAST(proof_json AS BLOB))<=65536),
 action_group_id TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 updated_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')), deleted_at TEXT
);
--> statement-breakpoint
CREATE UNIQUE INDEX statement_auto_source_row_uq ON statement_automation_row(source_sha256,row_key) WHERE deleted_at IS NULL;
