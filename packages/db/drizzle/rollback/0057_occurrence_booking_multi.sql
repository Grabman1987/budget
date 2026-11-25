-- Disposable-copy rollback only. Caller wraps this complete script in a transaction.
-- Refuse retained data: a booking linked to several live occurrences cannot satisfy the unique index.
-- 0057 only dropped the partial unique index occurrence_booking_uq; no data changed.
CREATE TEMP TABLE occurrence_multi_rollback_guard (n INTEGER CHECK (n = 0));
-- An older rollback must never cross a later applied migration.
INSERT INTO occurrence_multi_rollback_guard SELECT count(*) FROM __drizzle_migrations WHERE created_at > 1795609241217;
INSERT INTO occurrence_multi_rollback_guard SELECT count(*) FROM (SELECT booking_id FROM expected_occurrence WHERE booking_id IS NOT NULL AND deleted_at IS NULL GROUP BY booking_id HAVING count(*) > 1);
CREATE UNIQUE INDEX `occurrence_booking_uq` ON `expected_occurrence` (`booking_id`) WHERE "expected_occurrence"."booking_id" IS NOT NULL AND "expected_occurrence"."deleted_at" IS NULL;
DELETE FROM __drizzle_migrations WHERE created_at = 1795609241217;
DROP TABLE occurrence_multi_rollback_guard;
