-- Disposable-copy rollback only. Never discard live or tombstoned audited lineage.
CREATE TEMP TABLE `security_transfer_pair_rollback_guard` (`empty` integer CHECK (`empty` = 0));
INSERT INTO `security_transfer_pair_rollback_guard`
  SELECT count(*) FROM `__drizzle_migrations` WHERE `created_at` > 1792570000000;
INSERT INTO `security_transfer_pair_rollback_guard` SELECT count(*) FROM `security_transfer_pair`;
DROP TABLE `security_transfer_pair_rollback_guard`;
DROP TABLE `security_transfer_pair`;
