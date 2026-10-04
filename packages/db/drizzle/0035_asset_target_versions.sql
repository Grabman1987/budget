CREATE TABLE `asset_target_version` (
	`id` text PRIMARY KEY NOT NULL,
	`valid_from` text NOT NULL,
	`label` text,
	`reason` text,
	`policy_json` text NOT NULL,
	`audit_group_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`deleted_at` text,
	CONSTRAINT "asset_target_version_day_chk" CHECK("asset_target_version"."valid_from" GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `asset_target_version_valid_from_unique` ON `asset_target_version` (`valid_from`);