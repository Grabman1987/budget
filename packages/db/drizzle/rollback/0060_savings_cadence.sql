-- Disposable-copy rollback only. Caller wraps this complete script in a transaction.
-- Refuse retained data: a weekly or multi-day plan cannot be expressed as one day per month.
CREATE TEMP TABLE savings_cadence_rollback_guard (n INTEGER CHECK (n = 0));
-- An older rollback must never cross a later applied migration.
INSERT INTO savings_cadence_rollback_guard SELECT count(*) FROM __drizzle_migrations WHERE created_at > 1795804481524;
INSERT INTO savings_cadence_rollback_guard SELECT count(*) FROM savings_plan WHERE cadence <> 'monthly';
ALTER TABLE `savings_plan` DROP COLUMN `interval_weeks`;
ALTER TABLE `savings_plan` DROP COLUMN `days_of_month`;
ALTER TABLE `savings_plan` DROP COLUMN `cadence`;
DELETE FROM __drizzle_migrations WHERE created_at = 1795804481524;
DROP TABLE savings_cadence_rollback_guard;
