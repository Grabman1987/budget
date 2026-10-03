CREATE TABLE `bank_sync_account` (
	`id` text PRIMARY KEY NOT NULL,
	`consent_id` text NOT NULL,
	`secret` text NOT NULL,
	`label` text NOT NULL,
	`currency` text NOT NULL,
	`account_id` text,
	`from_date` text,
	`last_sync_at` text,
	FOREIGN KEY (`consent_id`) REFERENCES `bank_sync_consent`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `bank_sync_candidate` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`dedupe_key` text NOT NULL,
	`date` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`currency` text NOT NULL,
	`memo` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "bank_sync_candidate_date_chk" CHECK("bank_sync_candidate"."date" GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bank_sync_candidate_key_uq` ON `bank_sync_candidate` (`account_id`,`dedupe_key`);--> statement-breakpoint
CREATE TABLE `bank_sync_consent` (
	`id` text PRIMARY KEY NOT NULL,
	`initiator` text NOT NULL,
	`state_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	`secret` text,
	`label` text NOT NULL,
	`valid_until` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`last_attempt_at` text,
	`last_success_at` text,
	`next_run_at` text NOT NULL,
	`failures` integer DEFAULT 0 NOT NULL,
	`lease_until` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bank_sync_consent_state_hash_unique` ON `bank_sync_consent` (`state_hash`);