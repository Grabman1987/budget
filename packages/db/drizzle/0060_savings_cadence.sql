ALTER TABLE `savings_plan` ADD `cadence` text DEFAULT 'monthly' NOT NULL CHECK (`cadence` IN ('monthly', 'days', 'weeks'));--> statement-breakpoint
ALTER TABLE `savings_plan` ADD `days_of_month` text CHECK ((`days_of_month` IS NOT NULL) = (`cadence` = 'days'));--> statement-breakpoint
ALTER TABLE `savings_plan` ADD `interval_weeks` integer CHECK ((`interval_weeks` IS NOT NULL) = (`cadence` = 'weeks') AND (`interval_weeks` IS NULL OR `interval_weeks` BETWEEN 1 AND 4));
