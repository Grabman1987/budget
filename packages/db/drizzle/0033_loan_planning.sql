CREATE TABLE `loan_rate_change` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`valid_from` text NOT NULL,
	`rate_bp` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "loan_rate_change_day_chk" CHECK("loan_rate_change"."valid_from" GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
	CONSTRAINT "loan_rate_change_rate_chk" CHECK("loan_rate_change"."rate_bp" BETWEEN 0 AND 100000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `loan_rate_change_live_uq` ON `loan_rate_change` (`account_id`,`valid_from`) WHERE "loan_rate_change"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `loan_rate_change_account_idx` ON `loan_rate_change` (`account_id`,`valid_from`);--> statement-breakpoint
CREATE TABLE `loan_scenario` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`name` text NOT NULL,
	`measures_json` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "loan_scenario_measures_chk" CHECK(json_valid("loan_scenario"."measures_json"))
);
--> statement-breakpoint
CREATE INDEX `loan_scenario_account_idx` ON `loan_scenario` (`account_id`);