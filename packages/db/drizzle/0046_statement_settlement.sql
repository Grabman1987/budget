CREATE TABLE `statement_settlement_config` (
 `card_account_id` text PRIMARY KEY NOT NULL REFERENCES `account`(`id`),
 `funding_account_id` text NOT NULL REFERENCES `account`(`id`),
 `enabled` integer NOT NULL CHECK (`enabled` IN (0,1)),
 `created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
 `updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
 `deleted_at` text,
 CHECK (`card_account_id` != `funding_account_id`)
);
--> statement-breakpoint
CREATE TABLE `statement_settlement` (
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
--> statement-breakpoint
CREATE UNIQUE INDEX `statement_settlement_source_uq` ON `statement_settlement` (`source_intake_id`) WHERE `deleted_at` IS NULL AND `state` NOT IN ('withdrawn','superseded');
--> statement-breakpoint
CREATE UNIQUE INDEX `statement_settlement_identity_uq` ON `statement_settlement` (`card_account_id`,`reference`,`issue_date`) WHERE `deleted_at` IS NULL AND `state` NOT IN ('withdrawn','superseded');
--> statement-breakpoint
CREATE UNIQUE INDEX `statement_settlement_transfer_uq` ON `statement_settlement` (`transfer_id`) WHERE `deleted_at` IS NULL AND `state`='represented';
--> statement-breakpoint
CREATE UNIQUE INDEX `statement_settlement_legacy_uq` ON `statement_settlement` (`legacy_payment_id`,`legacy_due_date`) WHERE `deleted_at` IS NULL AND `state` NOT IN ('withdrawn','superseded');
--> statement-breakpoint
CREATE TABLE `statement_bonus` (
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
 `bonus_cents` integer NOT NULL CHECK (typeof(`bonus_cents`)='integer' AND `bonus_cents`>0 AND `bonus_cents`<=9007199254740991),
 `credit_date` text NOT NULL CHECK (`credit_date` GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
 `state` text NOT NULL CHECK (`state` IN ('ready','represented','already_net','withdrawn','superseded')),
 `evidence_json` text NOT NULL CHECK (json_valid(`evidence_json`) AND length(CAST(`evidence_json` AS BLOB))<=65536),
 `supersedes_id` text REFERENCES `statement_bonus`(`id`),
 `booking_id` text REFERENCES `booking`(`id`),
 CHECK ((`state`='represented' AND `representation_kind` IS NOT NULL AND `representation_kind` IN ('created','linked') AND `booking_id` IS NOT NULL AND `action_group_id` IS NOT NULL) OR (`state`!='represented' AND `representation_kind` IS NULL AND `booking_id` IS NULL AND `action_group_id` IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `statement_bonus_source_uq` ON `statement_bonus` (`source_intake_id`) WHERE `deleted_at` IS NULL AND `state` NOT IN ('withdrawn','superseded');
--> statement-breakpoint
CREATE UNIQUE INDEX `statement_bonus_identity_uq` ON `statement_bonus` (`card_account_id`,`reference`,`issue_date`) WHERE `deleted_at` IS NULL AND `state` NOT IN ('withdrawn','superseded');
--> statement-breakpoint
CREATE UNIQUE INDEX `statement_bonus_booking_uq` ON `statement_bonus` (`booking_id`) WHERE `deleted_at` IS NULL AND `state`='represented';
--> statement-breakpoint
CREATE TABLE `statement_settlement_delivery` (
 `key` text PRIMARY KEY NOT NULL, `operation` text NOT NULL, `request_hash` text NOT NULL,
 `response_json` text NOT NULL CHECK (json_valid(`response_json`) AND length(CAST(`response_json` AS BLOB))<=65536),
 `created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
