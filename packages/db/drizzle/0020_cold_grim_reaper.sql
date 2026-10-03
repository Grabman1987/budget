PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_payslip_line` (
	`id` text PRIMARY KEY NOT NULL,
	`deleted_at` text,
	`payslip_id` text NOT NULL,
	`section` text NOT NULL,
	`label` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`payslip_id`) REFERENCES `payslip`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "payslip_section_chk" CHECK("__new_payslip_line"."section" IN ('earning', 'deduction', 'reimbursement'))
);
--> statement-breakpoint
INSERT INTO `__new_payslip_line`("id", "deleted_at", "payslip_id", "section", "label", "amount_cents", "sort_order") SELECT "id", "deleted_at", "payslip_id", "section", "label", "amount_cents", "sort_order" FROM `payslip_line`;--> statement-breakpoint
DROP TABLE `payslip_line`;--> statement-breakpoint
ALTER TABLE `__new_payslip_line` RENAME TO `payslip_line`;--> statement-breakpoint
PRAGMA foreign_keys=ON;