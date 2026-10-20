-- Copy-only rollback. Caller must wrap this complete script in a transaction.
CREATE TEMP TABLE statement_rollback_guard (n INTEGER CHECK (n = 0));
INSERT INTO statement_rollback_guard SELECT count(*) FROM statement_intake;
INSERT INTO statement_rollback_guard SELECT count(*) FROM audit_log WHERE entity_type = 'statement_intake';
DROP TABLE statement_intake;
DELETE FROM __drizzle_migrations WHERE created_at = 1792490000000;
DROP TABLE statement_rollback_guard;
