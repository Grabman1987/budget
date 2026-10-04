CREATE TABLE `bank_payee_alias` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`raw_key` text NOT NULL,
	`payee_id` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`payee_id`) REFERENCES `payee`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bank_payee_alias_key_uq` ON `bank_payee_alias` (`source_id`,`raw_key`);--> statement-breakpoint
CREATE TABLE `bank_payee_cleanup` (
	`id` text PRIMARY KEY NOT NULL,
	`config_json` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
ALTER TABLE `booking` ADD `bank_raw_text` text;--> statement-breakpoint
ALTER TABLE `booking` ADD `bank_raw_payee` text;--> statement-breakpoint
ALTER TABLE `booking` ADD `bank_source_id` text;--> statement-breakpoint
ALTER TABLE `assignment_rule` ADD `action_json` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `assignment_rule` ADD `automatic` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `bank_sync_candidate` ADD `raw_payee` text;--> statement-breakpoint
ALTER TABLE `bank_sync_candidate` ADD `source_id` text REFERENCES bank_sync_account(id);