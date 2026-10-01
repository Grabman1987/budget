CREATE TABLE `savings_plan` (
	`id` text PRIMARY KEY NOT NULL,
	`security_id` text NOT NULL,
	`account_id` text NOT NULL,
	`source_account_id` text,
	`amount_cents` integer NOT NULL,
	`day_of_month` integer NOT NULL,
	`valid_from` text NOT NULL,
	`valid_to` text,
	`note` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`security_id`) REFERENCES `security`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_account_id`) REFERENCES `account`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "savings_plan_valid_from_chk" CHECK("savings_plan"."valid_from" GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
	CONSTRAINT "savings_plan_valid_to_chk" CHECK("savings_plan"."valid_to" GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
	CONSTRAINT "savings_plan_amount_chk" CHECK("savings_plan"."amount_cents" > 0),
	CONSTRAINT "savings_plan_day_chk" CHECK("savings_plan"."day_of_month" BETWEEN 1 AND 31),
	CONSTRAINT "savings_plan_range_chk" CHECK("savings_plan"."valid_to" IS NULL OR "savings_plan"."valid_to" >= "savings_plan"."valid_from")
);
--> statement-breakpoint
CREATE INDEX `savings_plan_key_idx` ON `savings_plan` (`security_id`,`account_id`,`valid_from`);