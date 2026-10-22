-- Refuse metadata loss while any FX provenance remains (including soft-deleted/undoable pairs).
CREATE TEMP TABLE `fx_rollback_guard` (`empty` integer CHECK (`empty` = 0));
INSERT INTO `fx_rollback_guard` SELECT count(*) FROM `transfer_fx`;
DROP TABLE `fx_rollback_guard`;
DROP TABLE `transfer_fx`;
