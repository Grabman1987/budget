-- Disposable copy only; caller runs this entire script in a transaction.
-- Refuse retained, soft-deleted, or subsequently undone pause intent.
CREATE TEMP TABLE expected_pause_rollback_guard (n INTEGER CHECK (n = 0));
INSERT INTO expected_pause_rollback_guard SELECT count(*) FROM expected_payment_pause;
INSERT INTO expected_pause_rollback_guard SELECT count(*) FROM audit_log WHERE entity_type='expected_payment_pause';
-- This downgrade must still be the last migration; never remove a middle journal entry.
INSERT INTO expected_pause_rollback_guard SELECT count(*) FROM __drizzle_migrations WHERE created_at > 1792530000000;
DROP TABLE expected_payment_pause;
DELETE FROM __drizzle_migrations WHERE created_at = 1792530000000;
DROP TABLE expected_pause_rollback_guard;
