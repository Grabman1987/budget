-- Disposable-copy rollback only. Caller wraps this complete script in a transaction.
-- Refuse retained or audited intent, including deleted goals and subsequently undone changes.
CREATE TEMP TABLE goal_lifecycle_rollback_guard (n INTEGER CHECK (n = 0));
-- An older rollback must never cross a later applied migration.
INSERT INTO goal_lifecycle_rollback_guard SELECT count(*) FROM __drizzle_migrations WHERE created_at > 1792520000000;
INSERT INTO goal_lifecycle_rollback_guard SELECT count(*) FROM savings_goal WHERE start_month IS NOT NULL OR manual_completed_on IS NOT NULL OR lifecycle_anchor_json IS NOT NULL;
INSERT INTO goal_lifecycle_rollback_guard SELECT count(*) FROM audit_log WHERE entity_type='savings_goal' AND (
 json_extract(before_json,'$.start_month') IS NOT NULL OR json_extract(after_json,'$.start_month') IS NOT NULL OR
 json_extract(before_json,'$.lifecycle_anchor_json') IS NOT NULL OR json_extract(after_json,'$.lifecycle_anchor_json') IS NOT NULL OR
 json_extract(before_json,'$.manual_completed_on') IS NOT NULL OR json_extract(after_json,'$.manual_completed_on') IS NOT NULL
);
ALTER TABLE savings_goal DROP COLUMN lifecycle_anchor_json;
ALTER TABLE savings_goal DROP COLUMN manual_completed_on;
ALTER TABLE savings_goal DROP COLUMN start_month;
DELETE FROM __drizzle_migrations WHERE created_at = 1792520000000;
DROP TABLE goal_lifecycle_rollback_guard;
