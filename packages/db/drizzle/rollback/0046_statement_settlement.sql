-- Disposable-copy rollback only. Caller wraps the complete script in a transaction.
-- Refuse even soft-deleted/history-only financial use; delivery replay must not be lost.
CREATE TEMP TABLE statement_settlement_rollback_guard (n INTEGER CHECK (n = 0));
INSERT INTO statement_settlement_rollback_guard SELECT count(*) FROM statement_settlement_config;
INSERT INTO statement_settlement_rollback_guard SELECT count(*) FROM statement_settlement;
INSERT INTO statement_settlement_rollback_guard SELECT count(*) FROM statement_bonus;
INSERT INTO statement_settlement_rollback_guard SELECT count(*) FROM statement_settlement_delivery;
INSERT INTO statement_settlement_rollback_guard SELECT count(*) FROM audit_log WHERE entity_type IN ('statement_settlement_config','statement_settlement','statement_bonus');
DROP TABLE statement_settlement_delivery;
DROP TABLE statement_bonus;
DROP TABLE statement_settlement;
DROP TABLE statement_settlement_config;
DELETE FROM __drizzle_migrations WHERE created_at = 1792500000000;
DROP TABLE statement_settlement_rollback_guard;
