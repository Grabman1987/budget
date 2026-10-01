ALTER TABLE `rule` ADD `kind` text DEFAULT 'rule' NOT NULL;--> statement-breakpoint
ALTER TABLE `rule` ADD `sort_order` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `rule` ADD `confirmed_at` text;--> statement-breakpoint
CREATE UNIQUE INDEX `rule_result_uq` ON `rule_result` (`rule_id`,`as_of`);