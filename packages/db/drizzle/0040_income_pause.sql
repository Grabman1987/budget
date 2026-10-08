CREATE TABLE `income_pause` (
	`id` text PRIMARY KEY NOT NULL,
	`expected_payment_id` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`expected_payment_id`) REFERENCES `expected_payment`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "income_pause_start_date_chk" CHECK("income_pause"."start_date" GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
	CONSTRAINT "income_pause_end_date_chk" CHECK("income_pause"."end_date" GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
	CONSTRAINT "income_pause_range_chk" CHECK("income_pause"."start_date" <= "income_pause"."end_date")
);
--> statement-breakpoint
CREATE INDEX `income_pause_source_idx` ON `income_pause` (`expected_payment_id`,`start_date`,`end_date`);