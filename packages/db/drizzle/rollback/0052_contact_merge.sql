-- Disposable-copy rollback only. Caller wraps this complete script in a transaction.
-- Refuse any merged contact and any audited merge intent (including undone ones): dropping would lose it.
CREATE TEMP TABLE contact_merge_rollback_guard (n INTEGER CHECK (n = 0));
-- An older rollback must never cross a later applied migration.
INSERT INTO contact_merge_rollback_guard SELECT count(*) FROM __drizzle_migrations WHERE created_at > 1794345491773;
INSERT INTO contact_merge_rollback_guard SELECT count(*) FROM contact WHERE merged_into_id IS NOT NULL;
INSERT INTO contact_merge_rollback_guard SELECT count(*) FROM audit_log WHERE entity_type='contact' AND (
 json_extract(before_json,'$.merged_into_id') IS NOT NULL OR json_extract(after_json,'$.merged_into_id') IS NOT NULL
);
ALTER TABLE contact DROP COLUMN merged_into_id;
DELETE FROM __drizzle_migrations WHERE created_at = 1794345491773;
DROP TABLE contact_merge_rollback_guard;
