PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_expected_occurrence` (
	`id` text PRIMARY KEY NOT NULL,
	`expected_payment_id` text NOT NULL,
	`due_date` text NOT NULL,
	`expected_amount_cents` integer NOT NULL,
	`contact_share_cents` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'expected' NOT NULL,
	`booking_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`expected_payment_id`) REFERENCES `expected_payment`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`booking_id`) REFERENCES `booking`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "occurrence_status_chk" CHECK("__new_expected_occurrence"."status" IN ('expected', 'received', 'deviating', 'missed', 'skipped')),
	CONSTRAINT "occurrence_due_date_chk" CHECK("__new_expected_occurrence"."due_date" GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
	CONSTRAINT "occurrence_booking_chk" CHECK(("__new_expected_occurrence"."status" IN ('received', 'deviating')) = ("__new_expected_occurrence"."booking_id" IS NOT NULL))
);
--> statement-breakpoint
INSERT INTO `__new_expected_occurrence`("id", "expected_payment_id", "due_date", "expected_amount_cents", "contact_share_cents", "status", "booking_id", "created_at", "updated_at", "deleted_at") SELECT "id", "expected_payment_id", "due_date", "expected_amount_cents", "contact_share_cents", "status", "booking_id", "created_at", "updated_at", "deleted_at" FROM `expected_occurrence`;--> statement-breakpoint
DROP TABLE `expected_occurrence`;--> statement-breakpoint
ALTER TABLE `__new_expected_occurrence` RENAME TO `expected_occurrence`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `occurrence_uq` ON `expected_occurrence` (`expected_payment_id`,`due_date`);--> statement-breakpoint
CREATE INDEX `occurrence_booking_idx` ON `expected_occurrence` (`booking_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `occurrence_booking_uq` ON `expected_occurrence` (`booking_id`) WHERE "expected_occurrence"."booking_id" IS NOT NULL AND "expected_occurrence"."deleted_at" IS NULL;