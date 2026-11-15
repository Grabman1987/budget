-- Disposable-copy rollback only. Caller wraps this complete script in a transaction.
-- Refuse any archived contact and any audited archive intent (including reopened or undone ones).
CREATE TEMP TABLE contact_archive_rollback_guard (n INTEGER CHECK (n = 0));
-- An older rollback must never cross a later applied migration.
INSERT INTO contact_archive_rollback_guard SELECT count(*) FROM __drizzle_migrations WHERE created_at > 1794295981357;
INSERT INTO contact_archive_rollback_guard SELECT count(*) FROM contact WHERE archived_at IS NOT NULL;
INSERT INTO contact_archive_rollback_guard SELECT count(*) FROM audit_log WHERE entity_type='contact' AND (
 json_extract(before_json,'$.archived_at') IS NOT NULL OR json_extract(after_json,'$.archived_at') IS NOT NULL
);
ALTER TABLE contact DROP COLUMN archived_at;
DELETE FROM __drizzle_migrations WHERE created_at = 1794295981357;
DROP TABLE contact_archive_rollback_guard;
