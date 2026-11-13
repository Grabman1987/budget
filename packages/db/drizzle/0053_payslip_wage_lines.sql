CREATE TABLE `payslip_wage_line` (
	`id` text PRIMARY KEY NOT NULL,
	`read_id` text NOT NULL,
	`payslip_id` text NOT NULL,
	`line_order` integer NOT NULL,
	`wage_code` text,
	`label` text NOT NULL,
	`section` text NOT NULL,
	`reference_month` text,
	`quantity_text` text,
	`rate_text` text,
	`amount_cents` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`read_id`) REFERENCES `payslip_wage_read`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`payslip_id`) REFERENCES `payslip`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "payslip_wage_line_section_chk" CHECK("payslip_wage_line"."section" IN ('earning', 'benefit_in_kind', 'reimbursement', 'deduction', 'tax_adjustment', 'sv_adjustment', 'memo', 'unknown')),
	CONSTRAINT "payslip_wage_line_month_chk" CHECK("payslip_wage_line"."reference_month" GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]'),
	CONSTRAINT "payslip_wage_line_order_chk" CHECK("payslip_wage_line"."line_order" >= 0),
	CONSTRAINT "payslip_wage_line_label_chk" CHECK(length("payslip_wage_line"."label") BETWEEN 1 AND 160)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payslip_wage_line_order_active_uq` ON `payslip_wage_line` (`read_id`,`line_order`) WHERE "payslip_wage_line"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `payslip_wage_line_payslip_idx` ON `payslip_wage_line` (`payslip_id`);--> statement-breakpoint
CREATE TABLE `payslip_wage_read` (
	`id` text PRIMARY KEY NOT NULL,
	`payslip_id` text NOT NULL,
	`receipt_id` text,
	`origin` text NOT NULL,
	`parser_version` integer NOT NULL,
	`line_check` text NOT NULL,
	`sv_current_cents` integer,
	`sv_special_cents` integer,
	`tax_current_cents` integer,
	`tax_other_cents` integer,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`payslip_id`) REFERENCES `payslip`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`receipt_id`) REFERENCES `receipt`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "payslip_wage_read_origin_chk" CHECK("payslip_wage_read"."origin" IN ('intake', 'reread')),
	CONSTRAINT "payslip_wage_read_check_chk" CHECK("payslip_wage_read"."line_check" IN ('ok', 'gross_mismatch', 'no_gross')),
	CONSTRAINT "payslip_wage_read_split_chk" CHECK(("payslip_wage_read"."sv_current_cents" IS NULL) = ("payslip_wage_read"."sv_special_cents" IS NULL) AND ("payslip_wage_read"."sv_current_cents" IS NULL) = ("payslip_wage_read"."tax_current_cents" IS NULL) AND ("payslip_wage_read"."sv_current_cents" IS NULL) = ("payslip_wage_read"."tax_other_cents" IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payslip_wage_read_payslip_active_uq` ON `payslip_wage_read` (`payslip_id`) WHERE "payslip_wage_read"."deleted_at" IS NULL;--> statement-breakpoint
CREATE TABLE `wage_component_mapping` (
	`id` text PRIMARY KEY NOT NULL,
	`employer_contact_id` text,
	`wage_code` text,
	`label_norm` text,
	`mapping_key` text NOT NULL,
	`component` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`employer_contact_id`) REFERENCES `contact`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "wage_component_mapping_component_chk" CHECK("wage_component_mapping"."component" IN ('base', 'special', 'variable', 'benefit_in_kind', 'reimbursement')),
	CONSTRAINT "wage_component_mapping_key_chk" CHECK("wage_component_mapping"."wage_code" IS NOT NULL OR "wage_component_mapping"."label_norm" IS NOT NULL),
	CONSTRAINT "wage_component_mapping_identity_chk" CHECK("wage_component_mapping"."mapping_key" = coalesce("wage_component_mapping"."employer_contact_id", '') || '|' || coalesce("wage_component_mapping"."wage_code", '') || '|' || coalesce("wage_component_mapping"."label_norm", ''))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wage_component_mapping_active_uq` ON `wage_component_mapping` (`mapping_key`) WHERE "wage_component_mapping"."deleted_at" IS NULL;