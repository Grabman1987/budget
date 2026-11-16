-- Disposable-copy rollback only. Caller wraps this complete script in a transaction.
-- Refuse retained data: converted prices, attempt history and owner conversion choices would be lost.
-- 0055 only added three nullable price columns, one nullable security column (no default) and one table.
CREATE TEMP TABLE quote_fx_rollback_guard (n INTEGER CHECK (n = 0));
-- An older rollback must never cross a later applied migration.
INSERT INTO quote_fx_rollback_guard SELECT count(*) FROM __drizzle_migrations WHERE created_at > 1794866027438;
INSERT INTO quote_fx_rollback_guard SELECT count(*) FROM market_attempt;
INSERT INTO quote_fx_rollback_guard SELECT count(*) FROM price WHERE source_currency IS NOT NULL OR source_price_micro IS NOT NULL OR fx_rate_micro IS NOT NULL;
INSERT INTO quote_fx_rollback_guard SELECT count(*) FROM security WHERE quote_fx_currency IS NOT NULL;
DROP TABLE market_attempt;
ALTER TABLE price DROP COLUMN source_currency;
ALTER TABLE price DROP COLUMN source_price_micro;
ALTER TABLE price DROP COLUMN fx_rate_micro;
ALTER TABLE security DROP COLUMN quote_fx_currency;
DELETE FROM __drizzle_migrations WHERE created_at = 1794866027438;
DROP TABLE quote_fx_rollback_guard;
