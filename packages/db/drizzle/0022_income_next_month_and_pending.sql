ALTER TABLE `booking` ADD `income_next_month` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `bank_sync_candidate` ADD `bank_status` text DEFAULT 'booked' NOT NULL;