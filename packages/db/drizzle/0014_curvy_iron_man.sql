CREATE TABLE `market_run` (
	`id` text PRIMARY KEY NOT NULL,
	`trigger` text NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text NOT NULL,
	`as_of` text NOT NULL,
	`status` text NOT NULL,
	`price_rows` integer DEFAULT 0 NOT NULL,
	`fx_rows` integer DEFAULT 0 NOT NULL,
	`failed_count` integer DEFAULT 0 NOT NULL,
	`error_classes` text,
	CONSTRAINT "market_run_trigger_chk" CHECK("market_run"."trigger" IN ('nightly', 'manual')),
	CONSTRAINT "market_run_status_chk" CHECK("market_run"."status" IN ('ok', 'partial', 'failed')),
	CONSTRAINT "market_run_as_of_chk" CHECK("market_run"."as_of" GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]')
);
--> statement-breakpoint
CREATE INDEX `market_run_finished_idx` ON `market_run` (`finished_at`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_price` (
	`security_id` text NOT NULL,
	`date` text NOT NULL,
	`price_micro` integer NOT NULL,
	`currency` text DEFAULT 'EUR' NOT NULL,
	`source` text NOT NULL,
	PRIMARY KEY(`security_id`, `date`),
	FOREIGN KEY (`security_id`) REFERENCES `security`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "price_source_chk" CHECK("__new_price"."source" IN ('yfinance', 'ariva', 'cryptocalc', 'coingecko', 'manual', 'import')),
	CONSTRAINT "price_date_chk" CHECK("__new_price"."date" GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
	CONSTRAINT "price_positive_chk" CHECK("__new_price"."price_micro" > 0)
);
--> statement-breakpoint
INSERT INTO `__new_price`("security_id", "date", "price_micro", "currency", "source") SELECT "security_id", "date", "price_micro", "currency", "source" FROM `price`;--> statement-breakpoint
DROP TABLE `price`;--> statement-breakpoint
ALTER TABLE `__new_price` RENAME TO `price`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `security` ADD `quote_url` text;--> statement-breakpoint
ALTER TABLE `security` ADD `coingecko_id` text;