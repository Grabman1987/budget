PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_category_target` (
	`id` text PRIMARY KEY NOT NULL,
	`category_id` text NOT NULL,
	`kind` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`every_months` integer DEFAULT 1 NOT NULL,
	`target_date` text,
	`due_day` integer,
	`valid_from` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`category_id`) REFERENCES `category`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "category_target_kind_chk" CHECK("__new_category_target"."kind" IN ('monthly', 'by_date', 'keep_balance')),
	CONSTRAINT "category_target_amount_chk" CHECK("__new_category_target"."amount_cents" >= 0),
	CONSTRAINT "category_target_every_chk" CHECK("__new_category_target"."every_months" BETWEEN 1 AND 120),
	CONSTRAINT "category_target_due_day_chk" CHECK("__new_category_target"."due_day" BETWEEN 1 AND 31),
	CONSTRAINT "category_target_date_chk" CHECK("__new_category_target"."kind" <> 'by_date' OR "__new_category_target"."target_date" IS NOT NULL),
	CONSTRAINT "category_target_target_date_chk" CHECK("__new_category_target"."target_date" GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
	CONSTRAINT "category_target_valid_from_chk" CHECK("__new_category_target"."valid_from" GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]')
);
--> statement-breakpoint
INSERT INTO `__new_category_target`("id", "category_id", "kind", "amount_cents", "every_months", "target_date", "due_day", "valid_from", "created_at", "updated_at", "deleted_at") SELECT "id", "category_id", "kind", "amount_cents", "every_months", "target_date", NULL, "valid_from", "created_at", "updated_at", "deleted_at" FROM `category_target`;--> statement-breakpoint
DROP TABLE `category_target`;--> statement-breakpoint
ALTER TABLE `__new_category_target` RENAME TO `category_target`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `category_target_uq` ON `category_target` (`category_id`,`valid_from`);--> statement-breakpoint
ALTER TABLE `category` ADD `icon` text;