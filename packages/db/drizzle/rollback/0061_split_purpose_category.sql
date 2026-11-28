-- Disposable-copy rollback only. Caller wraps this complete script in a transaction.
-- Refuse retained data: a recorded purpose of an advance would be lost.
CREATE TEMP TABLE split_purpose_category_rollback_guard (n INTEGER CHECK (n = 0));
-- An older rollback must never cross a later applied migration.
INSERT INTO split_purpose_category_rollback_guard SELECT count(*) FROM __drizzle_migrations WHERE created_at > 1795856781404;
INSERT INTO split_purpose_category_rollback_guard SELECT count(*) FROM booking_split WHERE purpose_category_id IS NOT NULL;
ALTER TABLE `booking_split` DROP COLUMN `purpose_category_id`;
DELETE FROM __drizzle_migrations WHERE created_at = 1795856781404;
DROP TABLE split_purpose_category_rollback_guard;
