-- Disposable-copy rollback only. Caller wraps this complete script in a transaction.
-- Refuse retained alias data (also soft-deleted ones and audited intent): dropping would lose it.
CREATE TEMP TABLE contact_alias_rollback_guard (n INTEGER CHECK (n = 0));
-- An older rollback must never cross a later applied migration.
INSERT INTO contact_alias_rollback_guard SELECT count(*) FROM __drizzle_migrations WHERE created_at > 1794295951645;
INSERT INTO contact_alias_rollback_guard SELECT count(*) FROM contact_alias;
INSERT INTO contact_alias_rollback_guard SELECT count(*) FROM audit_log WHERE entity_type='contact_alias';
DROP TABLE contact_alias;
DELETE FROM __drizzle_migrations WHERE created_at = 1794295951645;
DROP TABLE contact_alias_rollback_guard;
