PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_expected_payment` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text DEFAULT 'outflow' NOT NULL,
	`account_id` text,
	`payee_id` text,
	`contact_id` text,
	`category_id` text,
	`income_type_id` text,
	`contact_share_bp` integer DEFAULT 0 NOT NULL,
	`amount_tolerance_cents` integer DEFAULT 0 NOT NULL,
	`date_window_days` integer DEFAULT 3 NOT NULL,
	`rhythm` text DEFAULT 'monthly' NOT NULL,
	`due_day` integer DEFAULT 1 NOT NULL,
	`due_month` integer,
	`date_shift` text DEFAULT 'none' NOT NULL,
	`start_date` text,
	`end_date` text,
	`note` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`payee_id`) REFERENCES `payee`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`contact_id`) REFERENCES `contact`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `category`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`income_type_id`) REFERENCES `income_type`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "expected_kind_chk" CHECK("__new_expected_payment"."kind" IN ('outflow', 'inflow')),
	CONSTRAINT "expected_rhythm_chk" CHECK("__new_expected_payment"."rhythm" IN ('monthly', 'quarterly', 'semiannual', 'yearly')),
	CONSTRAINT "expected_date_shift_chk" CHECK("__new_expected_payment"."date_shift" IN ('none', 'before', 'after')),
	CONSTRAINT "expected_due_day_chk" CHECK("__new_expected_payment"."due_day" BETWEEN 1 AND 31),
	CONSTRAINT "expected_due_month_chk" CHECK("__new_expected_payment"."due_month" BETWEEN 1 AND 12),
	CONSTRAINT "expected_share_chk" CHECK("__new_expected_payment"."contact_share_bp" BETWEEN 0 AND 10000),
	CONSTRAINT "expected_share_contact_chk" CHECK("__new_expected_payment"."contact_share_bp" = 0 OR "__new_expected_payment"."contact_id" IS NOT NULL),
	CONSTRAINT "expected_category_or_income_chk" CHECK("__new_expected_payment"."category_id" IS NULL OR "__new_expected_payment"."income_type_id" IS NULL),
	CONSTRAINT "expected_tolerance_chk" CHECK("__new_expected_payment"."amount_tolerance_cents" >= 0),
	CONSTRAINT "expected_window_chk" CHECK("__new_expected_payment"."date_window_days" BETWEEN 0 AND 31),
	CONSTRAINT "expected_start_chk" CHECK("__new_expected_payment"."start_date" GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
	CONSTRAINT "expected_end_chk" CHECK("__new_expected_payment"."end_date" GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]')
);
--> statement-breakpoint
INSERT INTO `__new_expected_payment`("id", "name", "kind", "account_id", "payee_id", "contact_id", "category_id", "income_type_id", "contact_share_bp", "amount_tolerance_cents", "date_window_days", "rhythm", "due_day", "due_month", "start_date", "end_date", "note", "created_at", "updated_at", "deleted_at") SELECT "id", "name", "kind", "account_id", "payee_id", "contact_id", "category_id", "income_type_id", "contact_share_bp", "amount_tolerance_cents", "date_window_days", "rhythm", "due_day", "due_month", "start_date", "end_date", "note", "created_at", "updated_at", "deleted_at" FROM `expected_payment`;--> statement-breakpoint
DROP TABLE `expected_payment`;--> statement-breakpoint
ALTER TABLE `__new_expected_payment` RENAME TO `expected_payment`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `occurrence_booking_uq` ON `expected_occurrence` (`booking_id`) WHERE "expected_occurrence"."booking_id" IS NOT NULL AND "expected_occurrence"."deleted_at" IS NULL;