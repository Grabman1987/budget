CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`institution_id` text,
	`contact_id` text,
	`currency` text DEFAULT 'EUR' NOT NULL,
	`opening_balance_cents` integer DEFAULT 0 NOT NULL,
	`opening_date` text NOT NULL,
	`credit_limit_cents` integer,
	`overdraft_limit_cents` integer,
	`interest_rate_bp` integer,
	`term_end` text,
	`monthly_fee_cents` integer,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`closed_at` text,
	`note` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`institution_id`) REFERENCES `institution`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`contact_id`) REFERENCES `contact`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "account_role_chk" CHECK("account"."role" IN ('budget', 'reserve', 'investment', 'debt', 'receivable'))
);
--> statement-breakpoint
CREATE INDEX `account_role_idx` ON `account` (`role`);--> statement-breakpoint
CREATE TABLE `contact` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`note` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE TABLE `institution` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text DEFAULT 'bank' NOT NULL,
	`note` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`deleted_at` text,
	CONSTRAINT "institution_kind_chk" CHECK("institution"."kind" IN ('bank', 'broker', 'platform', 'insurer', 'other'))
);
--> statement-breakpoint
CREATE TABLE `category` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`group_id` text NOT NULL,
	`class` text NOT NULL,
	`kind` text DEFAULT 'variable' NOT NULL,
	`stage` integer,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`hidden_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`group_id`) REFERENCES `category_group`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "category_class_chk" CHECK("category"."class" IN ('need', 'want', 'future')),
	CONSTRAINT "category_kind_chk" CHECK("category"."kind" IN ('fixed', 'variable', 'periodic', 'project', 'saving'))
);
--> statement-breakpoint
CREATE INDEX `category_group_idx` ON `category` (`group_id`);--> statement-breakpoint
CREATE TABLE `category_group` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE TABLE `envelope_month` (
	`category_id` text NOT NULL,
	`month` text NOT NULL,
	`assigned_cents` integer DEFAULT 0 NOT NULL,
	`note` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`deleted_at` text,
	PRIMARY KEY(`category_id`, `month`),
	FOREIGN KEY (`category_id`) REFERENCES `category`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `expected_payment` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text DEFAULT 'outflow' NOT NULL,
	`account_id` text,
	`payee_id` text,
	`category_id` text,
	`rhythm` text DEFAULT 'monthly' NOT NULL,
	`due_day` integer DEFAULT 1 NOT NULL,
	`due_month` integer,
	`start_date` text,
	`end_date` text,
	`note` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`payee_id`) REFERENCES `payee`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `category`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "expected_kind_chk" CHECK("expected_payment"."kind" IN ('outflow', 'inflow')),
	CONSTRAINT "expected_rhythm_chk" CHECK("expected_payment"."rhythm" IN ('monthly', 'quarterly', 'semiannual', 'yearly'))
);
--> statement-breakpoint
CREATE TABLE `expected_payment_version` (
	`id` text PRIMARY KEY NOT NULL,
	`expected_payment_id` text NOT NULL,
	`valid_from` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`currency` text DEFAULT 'EUR' NOT NULL,
	`original_amount_cents` integer,
	`note` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`expected_payment_id`) REFERENCES `expected_payment`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `expected_version_uq` ON `expected_payment_version` (`expected_payment_id`,`valid_from`);--> statement-breakpoint
CREATE TABLE `payee` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`contact_id` text,
	`default_category_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`contact_id`) REFERENCES `contact`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`default_category_id`) REFERENCES `category`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `planned_event` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`date` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`account_id` text,
	`category_id` text,
	`enabled` integer DEFAULT true NOT NULL,
	`note` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `category`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `savings_goal` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`target_cents` integer NOT NULL,
	`target_date` text,
	`category_id` text,
	`account_id` text,
	`note` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`category_id`) REFERENCES `category`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `booking` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`date` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`payee_id` text,
	`memo` text,
	`status` text DEFAULT 'confirmed' NOT NULL,
	`transfer_id` text,
	`currency` text DEFAULT 'EUR' NOT NULL,
	`original_amount_cents` integer,
	`original_currency` text,
	`fx_rate_micro` integer,
	`fx_fee_cents` integer,
	`project_id` text,
	`source` text DEFAULT 'manual' NOT NULL,
	`import_key` text,
	`receipt_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`payee_id`) REFERENCES `payee`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`transfer_id`) REFERENCES `transfer`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`receipt_id`) REFERENCES `receipt`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "booking_status_chk" CHECK("booking"."status" IN ('pending', 'confirmed', 'reconciled')),
	CONSTRAINT "booking_source_chk" CHECK("booking"."source" IN ('manual', 'bank', 'import', 'migration', 'system'))
);
--> statement-breakpoint
CREATE INDEX `booking_account_date_idx` ON `booking` (`account_id`,`date`);--> statement-breakpoint
CREATE INDEX `booking_date_idx` ON `booking` (`date`);--> statement-breakpoint
CREATE INDEX `booking_transfer_idx` ON `booking` (`transfer_id`);--> statement-breakpoint
CREATE INDEX `booking_payee_idx` ON `booking` (`payee_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `booking_import_key_uq` ON `booking` (`account_id`,`import_key`) WHERE "booking"."import_key" IS NOT NULL;--> statement-breakpoint
CREATE TABLE `booking_split` (
	`id` text PRIMARY KEY NOT NULL,
	`booking_id` text NOT NULL,
	`category_id` text,
	`amount_cents` integer NOT NULL,
	`memo` text,
	`contact_id` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`booking_id`) REFERENCES `booking`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `category`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`contact_id`) REFERENCES `contact`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `split_booking_idx` ON `booking_split` (`booking_id`);--> statement-breakpoint
CREATE INDEX `split_category_idx` ON `booking_split` (`category_id`);--> statement-breakpoint
CREATE TABLE `project` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`note` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE TABLE `receipt` (
	`id` text PRIMARY KEY NOT NULL,
	`storage_key` text NOT NULL,
	`mime` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`booking_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE TABLE `transfer` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `asset_class` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`target_share_bp` integer,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE TABLE `fx_rate` (
	`date` text NOT NULL,
	`currency` text NOT NULL,
	`rate_micro` integer NOT NULL,
	`source` text DEFAULT 'ecb' NOT NULL,
	PRIMARY KEY(`date`, `currency`)
);
--> statement-breakpoint
CREATE TABLE `holding` (
	`id` text PRIMARY KEY NOT NULL,
	`security_id` text NOT NULL,
	`account_id` text NOT NULL,
	`as_of` text NOT NULL,
	`units_e8` integer NOT NULL,
	`cost_basis_cents` integer,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`security_id`) REFERENCES `security`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `holding_uq` ON `holding` (`security_id`,`account_id`,`as_of`);--> statement-breakpoint
CREATE TABLE `price` (
	`security_id` text NOT NULL,
	`date` text NOT NULL,
	`price_micro` integer NOT NULL,
	`currency` text DEFAULT 'EUR' NOT NULL,
	`source` text NOT NULL,
	PRIMARY KEY(`security_id`, `date`),
	FOREIGN KEY (`security_id`) REFERENCES `security`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "price_source_chk" CHECK("price"."source" IN ('yfinance', 'ariva', 'manual', 'import'))
);
--> statement-breakpoint
CREATE TABLE `security` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`symbol` text,
	`isin` text,
	`currency` text DEFAULT 'EUR' NOT NULL,
	`ter_bp` integer DEFAULT 0 NOT NULL,
	`asset_class_id` text,
	`institution_id` text,
	`regions_json` text,
	`benchmark` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`asset_class_id`) REFERENCES `asset_class`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`institution_id`) REFERENCES `institution`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "security_kind_chk" CHECK("security"."kind" IN ('etf', 'stock', 'crypto', 'p2p', 'fund', 'other'))
);
--> statement-breakpoint
CREATE TABLE `trade` (
	`id` text PRIMARY KEY NOT NULL,
	`security_id` text NOT NULL,
	`account_id` text NOT NULL,
	`date` text NOT NULL,
	`kind` text NOT NULL,
	`units_e8` integer DEFAULT 0 NOT NULL,
	`amount_cents` integer NOT NULL,
	`fee_cents` integer DEFAULT 0 NOT NULL,
	`booking_id` text,
	`import_key` text,
	`note` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`security_id`) REFERENCES `security`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`booking_id`) REFERENCES `booking`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "trade_kind_chk" CHECK("trade"."kind" IN ('buy', 'sell', 'dividend', 'fee'))
);
--> statement-breakpoint
CREATE INDEX `trade_security_date_idx` ON `trade` (`security_id`,`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `trade_import_key_uq` ON `trade` (`account_id`,`import_key`);--> statement-breakpoint
CREATE TABLE `assignment_rule` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`match_json` text NOT NULL,
	`payee_id` text,
	`category_id` text,
	`priority` integer DEFAULT 0 NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`payee_id`) REFERENCES `payee`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `category`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`ts` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`actor` text DEFAULT 'system' NOT NULL,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`before_json` text,
	`after_json` text,
	`group_id` text,
	`undo_of_id` text,
	CONSTRAINT "audit_action_chk" CHECK("audit_log"."action" IN ('create', 'update', 'delete', 'restore', 'undo'))
);
--> statement-breakpoint
CREATE INDEX `audit_entity_idx` ON `audit_log` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `audit_group_idx` ON `audit_log` (`group_id`);--> statement-breakpoint
CREATE INDEX `audit_ts_idx` ON `audit_log` (`ts`);--> statement-breakpoint
CREATE TABLE `bank_connection` (
	`id` text PRIMARY KEY NOT NULL,
	`institution_id` text,
	`account_id` text,
	`provider` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`consent_until` text,
	`last_sync_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`institution_id`) REFERENCES `institution`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `inbox_item` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`detail` text,
	`ref_type` text,
	`ref_id` text,
	`urgent` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`resolved_at` text,
	`resolution` text,
	CONSTRAINT "inbox_kind_chk" CHECK("inbox_item"."kind" IN ('uncategorized', 'revision', 'import', 'stale_value', 'consent', 'overspent', 'other'))
);
--> statement-breakpoint
CREATE INDEX `inbox_open_idx` ON `inbox_item` (`resolved_at`);--> statement-breakpoint
CREATE TABLE `payslip` (
	`id` text PRIMARY KEY NOT NULL,
	`month` text NOT NULL,
	`kind` text DEFAULT 'regular' NOT NULL,
	`gross_cents` integer NOT NULL,
	`net_cents` integer NOT NULL,
	`receipt_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE TABLE `payslip_line` (
	`id` text PRIMARY KEY NOT NULL,
	`payslip_id` text NOT NULL,
	`section` text NOT NULL,
	`label` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`payslip_id`) REFERENCES `payslip`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "payslip_section_chk" CHECK("payslip_line"."section" IN ('earning', 'deduction'))
);
--> statement-breakpoint
CREATE TABLE `rule` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`stage` integer,
	`goal` text,
	`params_json` text,
	`action` text,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rule_code_unique` ON `rule` (`code`);--> statement-breakpoint
CREATE TABLE `rule_result` (
	`id` text PRIMARY KEY NOT NULL,
	`rule_id` text NOT NULL,
	`as_of` text NOT NULL,
	`status` text NOT NULL,
	`value_text` text,
	`detail_json` text,
	`action_needed` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`rule_id`) REFERENCES `rule`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "rule_result_status_chk" CHECK("rule_result"."status" IN ('ok', 'warn', 'bad'))
);
--> statement-breakpoint
CREATE INDEX `rule_result_idx` ON `rule_result` (`rule_id`,`as_of`);