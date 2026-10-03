CREATE TABLE `payslip_intake` (
	`id` text PRIMARY KEY NOT NULL,
	`sha256` text NOT NULL,
	`content_hash` text,
	`source` text NOT NULL,
	`receipt_id` text NOT NULL,
	`parsed_json` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`payslip_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`receipt_id`) REFERENCES `receipt`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`payslip_id`) REFERENCES `payslip`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "payslip_intake_status_chk" CHECK("payslip_intake"."status" IN ('pending', 'confirmed', 'rejected')),
	CONSTRAINT "payslip_intake_source_chk" CHECK("payslip_intake"."source" IN ('manual', 'dropbox'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payslip_intake_sha256_uq` ON `payslip_intake` (`sha256`);--> statement-breakpoint
CREATE UNIQUE INDEX `payslip_intake_content_uq` ON `payslip_intake` (`content_hash`);--> statement-breakpoint
CREATE TABLE `payslip_scan` (
	`id` text PRIMARY KEY NOT NULL,
	`root` text NOT NULL,
	`cursor` text,
	`last_scan_at` text,
	`next_run_at` text NOT NULL,
	`files_found` integer DEFAULT 0 NOT NULL,
	`errors` integer DEFAULT 0 NOT NULL,
	`error_code` text
);
