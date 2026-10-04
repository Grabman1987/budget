PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_account` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`role` text NOT NULL,
	`allocation_scope` text DEFAULT 'default' NOT NULL,
	`allocation_asset_class_id` text,
	`on_budget` integer NOT NULL,
	`institution_id` text,
	`contact_id` text,
	`reference_account_id` text,
	`currency` text DEFAULT 'EUR' NOT NULL,
	`opening_balance_cents` integer DEFAULT 0 NOT NULL,
	`opening_date` text NOT NULL,
	`credit_limit_cents` integer,
	`overdraft_limit_cents` integer,
	`interest_rate_bp` integer,
	`term_end` text,
	`monthly_fee_cents` integer,
	`interest_kind` text,
	`installment_cents` integer,
	`term_start` text,
	`original_amount_cents` integer,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`closed_at` text,
	`note` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`allocation_asset_class_id`) REFERENCES `asset_class`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`institution_id`) REFERENCES `institution`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`contact_id`) REFERENCES `contact`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reference_account_id`) REFERENCES `account`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "account_allocation_scope_chk" CHECK("__new_account"."allocation_scope" IN ('default', 'included', 'excluded')),
	CONSTRAINT "account_type_chk" CHECK("__new_account"."type" IN ('checking', 'cash', 'savings', 'credit_card', 'loan', 'brokerage', 'crypto', 'p2p', 'receivable', 'other_asset', 'other_liability')),
	CONSTRAINT "account_role_chk" CHECK("__new_account"."role" IN ('budget', 'reserve', 'investment', 'debt', 'receivable')),
	CONSTRAINT "account_on_budget_chk" CHECK("__new_account"."on_budget" = 0 OR "__new_account"."type" NOT IN ('loan', 'brokerage', 'crypto', 'p2p', 'receivable')),
	CONSTRAINT "account_opening_date_chk" CHECK("__new_account"."opening_date" GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
	CONSTRAINT "account_term_end_chk" CHECK("__new_account"."term_end" GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
	CONSTRAINT "account_term_start_chk" CHECK("__new_account"."term_start" GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
	CONSTRAINT "account_interest_kind_chk" CHECK("__new_account"."interest_kind" IN ('fixed', 'variable')),
	CONSTRAINT "account_installment_chk" CHECK("__new_account"."installment_cents" >= 0),
	CONSTRAINT "account_original_amount_chk" CHECK("__new_account"."original_amount_cents" >= 0)
);
--> statement-breakpoint
INSERT INTO `__new_account`("id", "name", "type", "role", "allocation_scope", "allocation_asset_class_id", "on_budget", "institution_id", "contact_id", "reference_account_id", "currency", "opening_balance_cents", "opening_date", "credit_limit_cents", "overdraft_limit_cents", "interest_rate_bp", "term_end", "monthly_fee_cents", "interest_kind", "installment_cents", "term_start", "original_amount_cents", "sort_order", "closed_at", "note", "created_at", "updated_at", "deleted_at") SELECT "id", "name", "type", "role", 'default', NULL, "on_budget", "institution_id", "contact_id", "reference_account_id", "currency", "opening_balance_cents", "opening_date", "credit_limit_cents", "overdraft_limit_cents", "interest_rate_bp", "term_end", "monthly_fee_cents", "interest_kind", "installment_cents", "term_start", "original_amount_cents", "sort_order", "closed_at", "note", "created_at", "updated_at", "deleted_at" FROM `account`;--> statement-breakpoint
DROP TABLE `account`;--> statement-breakpoint
ALTER TABLE `__new_account` RENAME TO `account`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `account_role_idx` ON `account` (`role`);--> statement-breakpoint
ALTER TABLE `security` ADD `allocation_included` integer DEFAULT true NOT NULL;
--> statement-breakpoint
-- Freeze the initial policy universe from structured type and settlement links, never names.
UPDATE account SET allocation_scope = CASE
  WHEN type IN ('brokerage', 'crypto', 'p2p') THEN 'included'
  WHEN type NOT IN ('credit_card', 'loan', 'other_liability', 'receivable')
    AND id IN (SELECT reference_account_id FROM account WHERE type IN ('brokerage', 'crypto', 'p2p') AND deleted_at IS NULL)
    THEN 'included'
  ELSE 'excluded' END;
