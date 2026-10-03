CREATE TABLE `asset_target_tier` (
	`id` text PRIMARY KEY NOT NULL,
	`up_to_cents` integer,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`deleted_at` text,
	CONSTRAINT "asset_target_tier_up_to_chk" CHECK("asset_target_tier"."up_to_cents" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `asset_target_tier_up_to_uq` ON `asset_target_tier` (`up_to_cents`) WHERE "asset_target_tier"."up_to_cents" IS NOT NULL AND "asset_target_tier"."deleted_at" IS NULL;--> statement-breakpoint
CREATE TABLE `asset_target_tier_share` (
	`id` text PRIMARY KEY NOT NULL,
	`tier_id` text NOT NULL,
	`asset_class_id` text NOT NULL,
	`target_share_bp` integer NOT NULL,
	`band_bp` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`tier_id`) REFERENCES `asset_target_tier`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`asset_class_id`) REFERENCES `asset_class`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "asset_target_tier_share_share_chk" CHECK("asset_target_tier_share"."target_share_bp" BETWEEN 0 AND 10000),
	CONSTRAINT "asset_target_tier_share_band_chk" CHECK("asset_target_tier_share"."band_bp" BETWEEN 0 AND 10000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `asset_target_tier_share_uq` ON `asset_target_tier_share` (`tier_id`,`asset_class_id`);--> statement-breakpoint
ALTER TABLE `account` ADD `interest_kind` text CONSTRAINT "account_interest_kind_chk" CHECK(`interest_kind` IN ('fixed', 'variable'));--> statement-breakpoint
ALTER TABLE `account` ADD `installment_cents` integer CONSTRAINT "account_installment_chk" CHECK(`installment_cents` >= 0);--> statement-breakpoint
ALTER TABLE `account` ADD `term_start` text CONSTRAINT "account_term_start_chk" CHECK(`term_start` GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]');--> statement-breakpoint
ALTER TABLE `account` ADD `original_amount_cents` integer CONSTRAINT "account_original_amount_chk" CHECK(`original_amount_cents` >= 0);
