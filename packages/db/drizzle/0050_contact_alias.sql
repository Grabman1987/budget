CREATE TABLE `contact_alias` (
	`id` text PRIMARY KEY NOT NULL,
	`contact_id` text NOT NULL,
	`alias` text NOT NULL,
	`alias_norm` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`contact_id`) REFERENCES `contact`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `contact_alias_norm_active_uq` ON `contact_alias` (`alias_norm`) WHERE "contact_alias"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `contact_alias_contact_idx` ON `contact_alias` (`contact_id`);