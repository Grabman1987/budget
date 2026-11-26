-- Disposable-copy rollback only. Caller wraps this complete script in a transaction.
-- Refuse retained data: a moved occurrence would lose its rule date (and be planned twice).
CREATE TEMP TABLE occurrence_moved_rollback_guard (n INTEGER CHECK (n = 0));
-- An older rollback must never cross a later applied migration.
INSERT INTO occurrence_moved_rollback_guard SELECT count(*) FROM __drizzle_migrations WHERE created_at > 1795670511356;
INSERT INTO occurrence_moved_rollback_guard SELECT count(*) FROM expected_occurrence WHERE planned_due_date IS NOT NULL;
ALTER TABLE `expected_occurrence` DROP COLUMN `planned_due_date`;
DELETE FROM __drizzle_migrations WHERE created_at = 1795670511356;
DROP TABLE occurrence_moved_rollback_guard;
