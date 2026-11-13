-- Disposable-copy rollback only. Caller wraps this complete script in a transaction.
-- Refuse retained wage data (also soft-deleted rows and audited intent): dropping would lose it.
-- 0053 only created these three tables; no existing table, row or value is touched.
CREATE TEMP TABLE payslip_wage_rollback_guard (n INTEGER CHECK (n = 0));
-- An older rollback must never cross a later applied migration.
INSERT INTO payslip_wage_rollback_guard SELECT count(*) FROM __drizzle_migrations WHERE created_at > 1794603105236;
INSERT INTO payslip_wage_rollback_guard SELECT count(*) FROM payslip_wage_line;
INSERT INTO payslip_wage_rollback_guard SELECT count(*) FROM payslip_wage_read;
INSERT INTO payslip_wage_rollback_guard SELECT count(*) FROM wage_component_mapping;
INSERT INTO payslip_wage_rollback_guard SELECT count(*) FROM audit_log WHERE entity_type IN ('payslip_wage_line', 'payslip_wage_read', 'wage_component_mapping');
DROP TABLE payslip_wage_line;
DROP TABLE payslip_wage_read;
DROP TABLE wage_component_mapping;
DELETE FROM __drizzle_migrations WHERE created_at = 1794603105236;
DROP TABLE payslip_wage_rollback_guard;
