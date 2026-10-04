PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_trade` (
	`id` text PRIMARY KEY NOT NULL,
	`security_id` text NOT NULL,
	`account_id` text NOT NULL,
	`date` text NOT NULL,
	`kind` text NOT NULL,
	`units_e8` integer DEFAULT 0 NOT NULL,
	`amount_cents` integer NOT NULL,
	`fee_cents` integer DEFAULT 0 NOT NULL,
	`tax_cents` integer DEFAULT 0 NOT NULL,
	`booking_id` text,
	`import_key` text,
	`savings_plan_id` text,
	`savings_month` text,
	`note` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`security_id`) REFERENCES `security`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`booking_id`) REFERENCES `booking`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`savings_plan_id`) REFERENCES `savings_plan`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "trade_kind_chk" CHECK("__new_trade"."kind" IN ('buy', 'sell', 'delivery_in', 'delivery_out', 'split', 'dividend', 'interest', 'fee', 'tax')),
	CONSTRAINT "trade_units_chk" CHECK(CASE
        WHEN "__new_trade"."kind" IN ('buy', 'delivery_in') THEN "__new_trade"."units_e8" > 0
        WHEN "__new_trade"."kind" IN ('sell', 'delivery_out') THEN "__new_trade"."units_e8" < 0
        WHEN "__new_trade"."kind" = 'split' THEN "__new_trade"."units_e8" <> 0
        ELSE "__new_trade"."units_e8" = 0 END),
	CONSTRAINT "trade_amounts_chk" CHECK("__new_trade"."amount_cents" >= 0 AND "__new_trade"."fee_cents" >= 0 AND "__new_trade"."tax_cents" >= 0),
	CONSTRAINT "trade_date_chk" CHECK("__new_trade"."date" GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
	CONSTRAINT "trade_savings_link_chk" CHECK(("__new_trade"."savings_plan_id" IS NULL AND "__new_trade"."savings_month" IS NULL) OR ("__new_trade"."savings_plan_id" IS NOT NULL AND "__new_trade"."savings_month" IS NOT NULL AND "__new_trade"."savings_month" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]' AND substr("__new_trade"."savings_month", 6, 2) BETWEEN '01' AND '12' AND "__new_trade"."kind" = 'buy'))
);
--> statement-breakpoint
INSERT INTO `__new_trade`("id", "security_id", "account_id", "date", "kind", "units_e8", "amount_cents", "fee_cents", "tax_cents", "booking_id", "import_key", "savings_plan_id", "savings_month", "note", "created_at", "updated_at", "deleted_at") SELECT "id", "security_id", "account_id", "date", "kind", "units_e8", "amount_cents", "fee_cents", "tax_cents", "booking_id", "import_key", "savings_plan_id", "savings_month", "note", "created_at", "updated_at", "deleted_at" FROM `trade`;--> statement-breakpoint
DROP TABLE `trade`;--> statement-breakpoint
ALTER TABLE `__new_trade` RENAME TO `trade`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `trade_security_date_idx` ON `trade` (`security_id`,`date`);--> statement-breakpoint
CREATE INDEX `trade_account_date_idx` ON `trade` (`account_id`,`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `trade_import_key_uq` ON `trade` (`account_id`,`import_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `trade_savings_month_uq` ON `trade` (`account_id`,`security_id`,`savings_month`) WHERE "trade"."deleted_at" IS NULL;