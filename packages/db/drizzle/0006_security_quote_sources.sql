ALTER TABLE `security` ADD `fallback_quote_id` text;--> statement-breakpoint
ALTER TABLE `security` ADD `quote_exchange` text;--> statement-breakpoint
ALTER TABLE `security` ADD `prices_enabled` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `security` ADD `quote_adjusted` integer DEFAULT false NOT NULL;