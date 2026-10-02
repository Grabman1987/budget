ALTER TABLE `project` ADD `archived_at` text;--> statement-breakpoint
ALTER TABLE `payslip` ADD `sv_cents` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `payslip` ADD `tax_cents` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `payslip` ADD `special_type` text;--> statement-breakpoint
ALTER TABLE `payslip_line` ADD `deleted_at` text;