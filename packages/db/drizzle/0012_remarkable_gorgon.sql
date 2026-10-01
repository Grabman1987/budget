CREATE TABLE `contact_allocation` (
	`id` text PRIMARY KEY NOT NULL,
	`settlement_id` text NOT NULL,
	`outlay_split_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`settlement_id`) REFERENCES `contact_settlement`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "contact_allocation_amount_chk" CHECK("contact_allocation"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE INDEX `contact_allocation_settlement_idx` ON `contact_allocation` (`settlement_id`);--> statement-breakpoint
CREATE TABLE `contact_settlement` (
	`id` text PRIMARY KEY NOT NULL,
	`contact_id` text NOT NULL,
	`booking_id` text NOT NULL,
	`receipt_split_id` text NOT NULL,
	`credit_cents` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`contact_id`) REFERENCES `contact`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`booking_id`) REFERENCES `booking`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "contact_credit_chk" CHECK("contact_settlement"."credit_cents" >= 0)
);
--> statement-breakpoint
CREATE INDEX `contact_settlement_booking_idx` ON `contact_settlement` (`booking_id`);