CREATE TABLE `security_asset_exposure` (
	`id` text PRIMARY KEY NOT NULL,
	`version_id` text NOT NULL,
	`security_id` text NOT NULL,
	`asset_class_id` text NOT NULL,
	`weight_bp` integer NOT NULL,
	`valid_from` text NOT NULL,
	`source` text NOT NULL,
	`audit_group_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`version_id`) REFERENCES `security_exposure_version`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`security_id`) REFERENCES `security`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`asset_class_id`) REFERENCES `asset_class`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "security_asset_exposure_day_chk" CHECK("security_asset_exposure"."valid_from" GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
	CONSTRAINT "security_asset_exposure_weight_chk" CHECK("security_asset_exposure"."weight_bp" BETWEEN 1 AND 10000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `security_asset_exposure_member_uq` ON `security_asset_exposure` (`version_id`,`asset_class_id`);--> statement-breakpoint
CREATE INDEX `security_asset_exposure_day_idx` ON `security_asset_exposure` (`security_id`,`valid_from`);--> statement-breakpoint
CREATE TABLE `security_exposure_version` (
	`id` text PRIMARY KEY NOT NULL,
	`security_id` text NOT NULL,
	`valid_from` text NOT NULL,
	`complete` integer NOT NULL,
	`source` text NOT NULL,
	`audit_group_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`security_id`) REFERENCES `security`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "security_exposure_version_day_chk" CHECK("security_exposure_version"."valid_from" GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
	CONSTRAINT "security_exposure_version_complete_chk" CHECK("security_exposure_version"."complete" IN (0, 1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `security_exposure_version_uq` ON `security_exposure_version` (`security_id`,`valid_from`);
--> statement-breakpoint
-- Legacy compatibility policy: assume the existing class from the first stored trade/holding,
-- otherwise the security creation day. This is NOT evidence of the historical classification.
INSERT INTO security_exposure_version (id, security_id, valid_from, complete, source)
SELECT 'legacy:' || s.id, s.id,
  COALESCE((SELECT MIN(day) FROM (
    SELECT date AS day FROM trade WHERE security_id = s.id
    UNION ALL SELECT as_of AS day FROM holding WHERE security_id = s.id
  )), substr(s.created_at, 1, 10)), 1, 'legacy_assumed_from_first_record'
FROM security s WHERE s.asset_class_id IS NOT NULL;
--> statement-breakpoint
INSERT INTO security_asset_exposure
  (id, version_id, security_id, asset_class_id, weight_bp, valid_from, source)
SELECT 'legacy:' || s.id, v.id, s.id, s.asset_class_id, 10000, v.valid_from, v.source
FROM security s JOIN security_exposure_version v ON v.id = 'legacy:' || s.id
WHERE s.asset_class_id IS NOT NULL;
