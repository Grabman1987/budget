-- Operational request/lease state for the existing Dropbox payslip worker.
-- Nullable columns preserve existing rows. This migration is source-only, not applied here.
ALTER TABLE `payslip_scan` ADD COLUMN `request_at` text;
--> statement-breakpoint
ALTER TABLE `payslip_scan` ADD COLUMN `lease_token` text;
--> statement-breakpoint
ALTER TABLE `payslip_scan` ADD COLUMN `lease_until` text;
--> statement-breakpoint
ALTER TABLE `payslip_scan` ADD COLUMN `full_scan_key` text;
