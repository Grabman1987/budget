-- Disposable-copy rollback only. Caller wraps this complete script in a transaction.
-- Refuse retained data: a fixed euro share would be lost (and the share silently become 0).
CREATE TEMP TABLE contact_share_cents_rollback_guard (n INTEGER CHECK (n = 0));
-- An older rollback must never cross a later applied migration.
INSERT INTO contact_share_cents_rollback_guard SELECT count(*) FROM __drizzle_migrations WHERE created_at > 1795692446797;
INSERT INTO contact_share_cents_rollback_guard SELECT count(*) FROM expected_payment WHERE contact_share_cents IS NOT NULL;
ALTER TABLE `expected_payment` DROP COLUMN `contact_share_cents`;
DELETE FROM __drizzle_migrations WHERE created_at = 1795692446797;
DROP TABLE contact_share_cents_rollback_guard;
