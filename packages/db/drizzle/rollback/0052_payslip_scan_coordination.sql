-- Disposable-copy rollback only. Stop the lease-aware worker before applying in a transaction.
CREATE TEMP TABLE `payslip_scan_rollback_guard` (`empty` integer CHECK (`empty` = 0));
INSERT INTO `payslip_scan_rollback_guard`
  SELECT count(*) FROM `__drizzle_migrations` WHERE `created_at` > 1792560000000;
INSERT INTO `payslip_scan_rollback_guard`
  SELECT count(*) FROM `payslip_scan`
  WHERE `request_at` IS NOT NULL OR `lease_token` IS NOT NULL
    OR `lease_until` IS NOT NULL OR `full_scan_key` IS NOT NULL;
DROP TABLE `payslip_scan_rollback_guard`;
ALTER TABLE `payslip_scan` DROP COLUMN `full_scan_key`;
ALTER TABLE `payslip_scan` DROP COLUMN `lease_until`;
ALTER TABLE `payslip_scan` DROP COLUMN `lease_token`;
ALTER TABLE `payslip_scan` DROP COLUMN `request_at`;
