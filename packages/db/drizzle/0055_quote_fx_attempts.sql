CREATE TABLE `market_attempt` (
	`id` text PRIMARY KEY NOT NULL,
	`security_id` text NOT NULL,
	`source` text NOT NULL,
	`attempted_at` text NOT NULL,
	`outcome` text NOT NULL,
	`http_status` integer,
	`detail` text,
	FOREIGN KEY (`security_id`) REFERENCES `security`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "market_attempt_outcome_chk" CHECK("market_attempt"."outcome" IN ('ok', 'network', 'timeout', 'rate_limited', 'not_found', 'http', 'parse', 'empty', 'currency_mismatch', 'not_configured'))
);
--> statement-breakpoint
CREATE INDEX `market_attempt_security_idx` ON `market_attempt` (`security_id`,`attempted_at`);--> statement-breakpoint
ALTER TABLE `price` ADD `source_currency` text;--> statement-breakpoint
ALTER TABLE `price` ADD `source_price_micro` integer;--> statement-breakpoint
ALTER TABLE `price` ADD `fx_rate_micro` integer;--> statement-breakpoint
ALTER TABLE `security` ADD `quote_fx_currency` text;