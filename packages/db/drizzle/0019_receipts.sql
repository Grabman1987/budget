CREATE TABLE `booking_receipt` (
	`booking_id` text NOT NULL,
	`receipt_id` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`deleted_at` text,
	PRIMARY KEY(`booking_id`, `receipt_id`),
	FOREIGN KEY (`booking_id`) REFERENCES `booking`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`receipt_id`) REFERENCES `receipt`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `booking_receipt_receipt_idx` ON `booking_receipt` (`receipt_id`);--> statement-breakpoint
ALTER TABLE `receipt` ADD `sha256` text;--> statement-breakpoint
ALTER TABLE `receipt` ADD `original_filename` text;--> statement-breakpoint
ALTER TABLE `receipt` ADD `created_by` text;