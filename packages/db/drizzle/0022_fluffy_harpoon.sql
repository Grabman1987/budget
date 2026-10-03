CREATE TABLE `employer_pension` (
	`id` text PRIMARY KEY NOT NULL,
	`month` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`deleted_at` text,
	CONSTRAINT "employer_pension_month_chk" CHECK("employer_pension"."month" GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]'),
	CONSTRAINT "employer_pension_amount_chk" CHECK("employer_pension"."amount_cents" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `employer_pension_month_uq` ON `employer_pension` (`month`);--> statement-breakpoint
ALTER TABLE `security` ADD `leverage_factor` integer DEFAULT 10 NOT NULL;