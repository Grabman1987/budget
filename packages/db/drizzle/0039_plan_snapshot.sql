CREATE TABLE `plan_snapshot` (
	`id` text PRIMARY KEY NOT NULL,
	`month` text NOT NULL,
	`day` integer NOT NULL,
	`category_id` text,
	`planned_cents` integer NOT NULL,
	`spent_cents` integer NOT NULL,
	`projected_cents` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `category`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "plan_snapshot_month_chk" CHECK("plan_snapshot"."month" GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]'),
	CONSTRAINT "plan_snapshot_day_chk" CHECK("plan_snapshot"."day" = 15),
	CONSTRAINT "plan_snapshot_money_chk" CHECK(typeof("plan_snapshot"."planned_cents") = 'integer' AND typeof("plan_snapshot"."spent_cents") = 'integer' AND typeof("plan_snapshot"."projected_cents") = 'integer')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plan_snapshot_category_uq` ON `plan_snapshot` (`month`,`day`,`category_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `plan_snapshot_total_uq` ON `plan_snapshot` (`month`,`day`) WHERE "plan_snapshot"."category_id" IS NULL;