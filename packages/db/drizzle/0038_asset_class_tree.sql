ALTER TABLE `asset_class` ADD `parent_id` text REFERENCES asset_class(id);--> statement-breakpoint
ALTER TABLE `asset_class` ADD `is_group` integer DEFAULT false NOT NULL;