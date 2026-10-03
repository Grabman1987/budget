ALTER TABLE `bank_sync_account` ADD `request_day` text;--> statement-breakpoint
ALTER TABLE `bank_sync_account` ADD `request_count` integer DEFAULT 0 NOT NULL;