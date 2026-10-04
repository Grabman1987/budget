ALTER TABLE `trade` ADD `savings_plan_id` text;--> statement-breakpoint
ALTER TABLE `trade` ADD `savings_month` text;--> statement-breakpoint
CREATE UNIQUE INDEX `trade_savings_month_uq` ON `trade` (`account_id`,`security_id`,`savings_month`) WHERE "trade"."deleted_at" IS NULL;