ALTER TABLE `bank_sync_account` ADD `balance_cents` integer;--> statement-breakpoint
ALTER TABLE `bank_sync_account` ADD `balance_date` text;--> statement-breakpoint
ALTER TABLE `bank_sync_account` ADD `balance_fetched_at` text;