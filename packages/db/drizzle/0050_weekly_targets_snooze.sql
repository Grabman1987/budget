-- Additive source migration; execution and rollback remain unvalidated.
ALTER TABLE `category_target` ADD `weekly_day` integer CONSTRAINT `category_target_weekly_chk` CHECK (
  `weekly_day` IS NULL OR (typeof(`weekly_day`) = 'integer' AND `weekly_day` BETWEEN 1 AND 7
  AND typeof(`amount_cents`) = 'integer' AND `amount_cents` BETWEEN 0 AND 1801439850948198
  AND `kind` = 'monthly' AND `every_months` = 1 AND `target_date` IS NULL AND `due_day` IS NULL)
);
--> statement-breakpoint
CREATE TABLE `category_target_snooze` (
  `id` text PRIMARY KEY NOT NULL,
  `category_id` text NOT NULL,
  `month` text NOT NULL,
  `created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  `updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  `deleted_at` text,
  FOREIGN KEY (`category_id`) REFERENCES `category`(`id`) ON UPDATE no action ON DELETE no action,
  CONSTRAINT `category_target_snooze_month_chk` CHECK (`month` GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]'),
  CONSTRAINT `category_target_snooze_month_range_chk` CHECK (substr(`month`, 6, 2) BETWEEN '01' AND '12')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `category_target_snooze_uq` ON `category_target_snooze` (`category_id`,`month`);
