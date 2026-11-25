-- Ledger version (perf): cache validity follows ledger changes only. One counter row is bumped by triggers
-- on every table a read model can read; auth/session and market run logs are left out.
-- Idempotent, no data change. `migrateDatabase` re-checks the triggers after every migration.
CREATE TABLE IF NOT EXISTS `ledger_version` (`id` integer PRIMARY KEY NOT NULL CHECK (`id` = 1), `version` integer NOT NULL);
--> statement-breakpoint
INSERT OR IGNORE INTO `ledger_version` (`id`, `version`) VALUES (1, 0);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_account_ai` AFTER INSERT ON `account` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_account_au` AFTER UPDATE ON `account` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_account_ad` AFTER DELETE ON `account` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_account_reconciliation_ai` AFTER INSERT ON `account_reconciliation` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_account_reconciliation_au` AFTER UPDATE ON `account_reconciliation` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_account_reconciliation_ad` AFTER DELETE ON `account_reconciliation` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_app_setting_ai` AFTER INSERT ON `app_setting` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_app_setting_au` AFTER UPDATE ON `app_setting` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_app_setting_ad` AFTER DELETE ON `app_setting` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_asset_class_ai` AFTER INSERT ON `asset_class` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_asset_class_au` AFTER UPDATE ON `asset_class` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_asset_class_ad` AFTER DELETE ON `asset_class` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_asset_class_target_ai` AFTER INSERT ON `asset_class_target` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_asset_class_target_au` AFTER UPDATE ON `asset_class_target` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_asset_class_target_ad` AFTER DELETE ON `asset_class_target` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_asset_target_version_ai` AFTER INSERT ON `asset_target_version` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_asset_target_version_au` AFTER UPDATE ON `asset_target_version` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_asset_target_version_ad` AFTER DELETE ON `asset_target_version` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_assignment_rule_ai` AFTER INSERT ON `assignment_rule` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_assignment_rule_au` AFTER UPDATE ON `assignment_rule` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_assignment_rule_ad` AFTER DELETE ON `assignment_rule` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_audit_log_ai` AFTER INSERT ON `audit_log` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_audit_log_au` AFTER UPDATE ON `audit_log` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_audit_log_ad` AFTER DELETE ON `audit_log` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_bank_connection_ai` AFTER INSERT ON `bank_connection` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_bank_connection_au` AFTER UPDATE ON `bank_connection` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_bank_connection_ad` AFTER DELETE ON `bank_connection` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_bank_payee_alias_ai` AFTER INSERT ON `bank_payee_alias` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_bank_payee_alias_au` AFTER UPDATE ON `bank_payee_alias` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_bank_payee_alias_ad` AFTER DELETE ON `bank_payee_alias` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_bank_payee_cleanup_ai` AFTER INSERT ON `bank_payee_cleanup` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_bank_payee_cleanup_au` AFTER UPDATE ON `bank_payee_cleanup` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_bank_payee_cleanup_ad` AFTER DELETE ON `bank_payee_cleanup` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_bank_sync_account_ai` AFTER INSERT ON `bank_sync_account` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_bank_sync_account_au` AFTER UPDATE ON `bank_sync_account` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_bank_sync_account_ad` AFTER DELETE ON `bank_sync_account` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_bank_sync_candidate_ai` AFTER INSERT ON `bank_sync_candidate` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_bank_sync_candidate_au` AFTER UPDATE ON `bank_sync_candidate` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_bank_sync_candidate_ad` AFTER DELETE ON `bank_sync_candidate` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_bank_sync_consent_ai` AFTER INSERT ON `bank_sync_consent` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_bank_sync_consent_au` AFTER UPDATE ON `bank_sync_consent` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_bank_sync_consent_ad` AFTER DELETE ON `bank_sync_consent` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_booking_ai` AFTER INSERT ON `booking` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_booking_au` AFTER UPDATE ON `booking` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_booking_ad` AFTER DELETE ON `booking` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_booking_delivery_ai` AFTER INSERT ON `booking_delivery` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_booking_delivery_au` AFTER UPDATE ON `booking_delivery` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_booking_delivery_ad` AFTER DELETE ON `booking_delivery` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_booking_receipt_ai` AFTER INSERT ON `booking_receipt` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_booking_receipt_au` AFTER UPDATE ON `booking_receipt` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_booking_receipt_ad` AFTER DELETE ON `booking_receipt` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_booking_split_ai` AFTER INSERT ON `booking_split` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_booking_split_au` AFTER UPDATE ON `booking_split` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_booking_split_ad` AFTER DELETE ON `booking_split` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_budget_month_ai` AFTER INSERT ON `budget_month` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_budget_month_au` AFTER UPDATE ON `budget_month` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_budget_month_ad` AFTER DELETE ON `budget_month` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_category_ai` AFTER INSERT ON `category` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_category_au` AFTER UPDATE ON `category` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_category_ad` AFTER DELETE ON `category` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_category_group_ai` AFTER INSERT ON `category_group` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_category_group_au` AFTER UPDATE ON `category_group` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_category_group_ad` AFTER DELETE ON `category_group` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_category_target_ai` AFTER INSERT ON `category_target` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_category_target_au` AFTER UPDATE ON `category_target` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_category_target_ad` AFTER DELETE ON `category_target` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_consumer_price_index_ai` AFTER INSERT ON `consumer_price_index` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_consumer_price_index_au` AFTER UPDATE ON `consumer_price_index` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_consumer_price_index_ad` AFTER DELETE ON `consumer_price_index` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_contact_ai` AFTER INSERT ON `contact` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_contact_au` AFTER UPDATE ON `contact` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_contact_ad` AFTER DELETE ON `contact` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_contact_alias_ai` AFTER INSERT ON `contact_alias` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_contact_alias_au` AFTER UPDATE ON `contact_alias` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_contact_alias_ad` AFTER DELETE ON `contact_alias` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_contact_allocation_ai` AFTER INSERT ON `contact_allocation` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_contact_allocation_au` AFTER UPDATE ON `contact_allocation` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_contact_allocation_ad` AFTER DELETE ON `contact_allocation` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_contact_settlement_ai` AFTER INSERT ON `contact_settlement` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_contact_settlement_au` AFTER UPDATE ON `contact_settlement` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_contact_settlement_ad` AFTER DELETE ON `contact_settlement` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_employer_pension_ai` AFTER INSERT ON `employer_pension` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_employer_pension_au` AFTER UPDATE ON `employer_pension` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_employer_pension_ad` AFTER DELETE ON `employer_pension` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_envelope_month_ai` AFTER INSERT ON `envelope_month` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_envelope_month_au` AFTER UPDATE ON `envelope_month` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_envelope_month_ad` AFTER DELETE ON `envelope_month` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_expected_occurrence_ai` AFTER INSERT ON `expected_occurrence` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_expected_occurrence_au` AFTER UPDATE ON `expected_occurrence` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_expected_occurrence_ad` AFTER DELETE ON `expected_occurrence` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_expected_payment_ai` AFTER INSERT ON `expected_payment` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_expected_payment_au` AFTER UPDATE ON `expected_payment` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_expected_payment_ad` AFTER DELETE ON `expected_payment` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_expected_payment_pause_ai` AFTER INSERT ON `expected_payment_pause` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_expected_payment_pause_au` AFTER UPDATE ON `expected_payment_pause` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_expected_payment_pause_ad` AFTER DELETE ON `expected_payment_pause` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_expected_payment_version_ai` AFTER INSERT ON `expected_payment_version` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_expected_payment_version_au` AFTER UPDATE ON `expected_payment_version` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_expected_payment_version_ad` AFTER DELETE ON `expected_payment_version` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_fx_rate_ai` AFTER INSERT ON `fx_rate` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_fx_rate_au` AFTER UPDATE ON `fx_rate` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_fx_rate_ad` AFTER DELETE ON `fx_rate` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_holding_ai` AFTER INSERT ON `holding` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_holding_au` AFTER UPDATE ON `holding` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_holding_ad` AFTER DELETE ON `holding` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_import_file_ai` AFTER INSERT ON `import_file` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_import_file_au` AFTER UPDATE ON `import_file` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_import_file_ad` AFTER DELETE ON `import_file` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_import_mapping_ai` AFTER INSERT ON `import_mapping` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_import_mapping_au` AFTER UPDATE ON `import_mapping` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_import_mapping_ad` AFTER DELETE ON `import_mapping` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_import_price_change_ai` AFTER INSERT ON `import_price_change` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_import_price_change_au` AFTER UPDATE ON `import_price_change` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_import_price_change_ad` AFTER DELETE ON `import_price_change` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_import_run_ai` AFTER INSERT ON `import_run` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_import_run_au` AFTER UPDATE ON `import_run` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_import_run_ad` AFTER DELETE ON `import_run` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_inbox_item_ai` AFTER INSERT ON `inbox_item` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_inbox_item_au` AFTER UPDATE ON `inbox_item` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_inbox_item_ad` AFTER DELETE ON `inbox_item` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_income_pause_ai` AFTER INSERT ON `income_pause` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_income_pause_au` AFTER UPDATE ON `income_pause` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_income_pause_ad` AFTER DELETE ON `income_pause` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_income_type_ai` AFTER INSERT ON `income_type` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_income_type_au` AFTER UPDATE ON `income_type` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_income_type_ad` AFTER DELETE ON `income_type` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_institution_ai` AFTER INSERT ON `institution` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_institution_au` AFTER UPDATE ON `institution` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_institution_ad` AFTER DELETE ON `institution` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_investment_preference_ai` AFTER INSERT ON `investment_preference` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_investment_preference_au` AFTER UPDATE ON `investment_preference` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_investment_preference_ad` AFTER DELETE ON `investment_preference` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_loan_rate_change_ai` AFTER INSERT ON `loan_rate_change` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_loan_rate_change_au` AFTER UPDATE ON `loan_rate_change` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_loan_rate_change_ad` AFTER DELETE ON `loan_rate_change` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_loan_scenario_ai` AFTER INSERT ON `loan_scenario` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_loan_scenario_au` AFTER UPDATE ON `loan_scenario` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_loan_scenario_ad` AFTER DELETE ON `loan_scenario` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_payee_ai` AFTER INSERT ON `payee` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_payee_au` AFTER UPDATE ON `payee` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_payee_ad` AFTER DELETE ON `payee` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_payslip_ai` AFTER INSERT ON `payslip` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_payslip_au` AFTER UPDATE ON `payslip` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_payslip_ad` AFTER DELETE ON `payslip` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_payslip_intake_ai` AFTER INSERT ON `payslip_intake` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_payslip_intake_au` AFTER UPDATE ON `payslip_intake` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_payslip_intake_ad` AFTER DELETE ON `payslip_intake` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_payslip_line_ai` AFTER INSERT ON `payslip_line` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_payslip_line_au` AFTER UPDATE ON `payslip_line` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_payslip_line_ad` AFTER DELETE ON `payslip_line` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_payslip_scan_ai` AFTER INSERT ON `payslip_scan` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_payslip_scan_au` AFTER UPDATE ON `payslip_scan` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_payslip_scan_ad` AFTER DELETE ON `payslip_scan` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_payslip_wage_line_ai` AFTER INSERT ON `payslip_wage_line` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_payslip_wage_line_au` AFTER UPDATE ON `payslip_wage_line` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_payslip_wage_line_ad` AFTER DELETE ON `payslip_wage_line` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_payslip_wage_read_ai` AFTER INSERT ON `payslip_wage_read` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_payslip_wage_read_au` AFTER UPDATE ON `payslip_wage_read` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_payslip_wage_read_ad` AFTER DELETE ON `payslip_wage_read` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_plan_snapshot_ai` AFTER INSERT ON `plan_snapshot` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_plan_snapshot_au` AFTER UPDATE ON `plan_snapshot` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_plan_snapshot_ad` AFTER DELETE ON `plan_snapshot` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_plan_snapshot_gap_ai` AFTER INSERT ON `plan_snapshot_gap` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_plan_snapshot_gap_au` AFTER UPDATE ON `plan_snapshot_gap` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_plan_snapshot_gap_ad` AFTER DELETE ON `plan_snapshot_gap` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_planned_event_ai` AFTER INSERT ON `planned_event` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_planned_event_au` AFTER UPDATE ON `planned_event` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_planned_event_ad` AFTER DELETE ON `planned_event` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_price_ai` AFTER INSERT ON `price` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_price_au` AFTER UPDATE ON `price` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_price_ad` AFTER DELETE ON `price` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_price_audit_ai` AFTER INSERT ON `price_audit` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_price_audit_au` AFTER UPDATE ON `price_audit` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_price_audit_ad` AFTER DELETE ON `price_audit` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_project_ai` AFTER INSERT ON `project` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_project_au` AFTER UPDATE ON `project` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_project_ad` AFTER DELETE ON `project` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_receipt_ai` AFTER INSERT ON `receipt` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_receipt_au` AFTER UPDATE ON `receipt` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_receipt_ad` AFTER DELETE ON `receipt` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_receipt_delivery_ai` AFTER INSERT ON `receipt_delivery` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_receipt_delivery_au` AFTER UPDATE ON `receipt_delivery` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_receipt_delivery_ad` AFTER DELETE ON `receipt_delivery` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_receipt_split_ai` AFTER INSERT ON `receipt_split` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_receipt_split_au` AFTER UPDATE ON `receipt_split` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_receipt_split_ad` AFTER DELETE ON `receipt_split` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_rule_ai` AFTER INSERT ON `rule` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_rule_au` AFTER UPDATE ON `rule` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_rule_ad` AFTER DELETE ON `rule` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_rule_result_ai` AFTER INSERT ON `rule_result` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_rule_result_au` AFTER UPDATE ON `rule_result` WHEN old.`rule_id` IS NOT new.`rule_id` OR old.`as_of` IS NOT new.`as_of` OR old.`status` IS NOT new.`status` OR old.`value_text` IS NOT new.`value_text` OR old.`detail_json` IS NOT new.`detail_json` OR old.`action_needed` IS NOT new.`action_needed` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_rule_result_ad` AFTER DELETE ON `rule_result` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_savings_goal_ai` AFTER INSERT ON `savings_goal` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_savings_goal_au` AFTER UPDATE ON `savings_goal` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_savings_goal_ad` AFTER DELETE ON `savings_goal` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_savings_plan_ai` AFTER INSERT ON `savings_plan` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_savings_plan_au` AFTER UPDATE ON `savings_plan` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_savings_plan_ad` AFTER DELETE ON `savings_plan` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_security_ai` AFTER INSERT ON `security` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_security_au` AFTER UPDATE ON `security` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_security_ad` AFTER DELETE ON `security` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_security_asset_exposure_ai` AFTER INSERT ON `security_asset_exposure` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_security_asset_exposure_au` AFTER UPDATE ON `security_asset_exposure` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_security_asset_exposure_ad` AFTER DELETE ON `security_asset_exposure` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_security_exposure_version_ai` AFTER INSERT ON `security_exposure_version` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_security_exposure_version_au` AFTER UPDATE ON `security_exposure_version` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_security_exposure_version_ad` AFTER DELETE ON `security_exposure_version` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_statement_automation_config_ai` AFTER INSERT ON `statement_automation_config` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_statement_automation_config_au` AFTER UPDATE ON `statement_automation_config` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_statement_automation_config_ad` AFTER DELETE ON `statement_automation_config` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_statement_automation_row_ai` AFTER INSERT ON `statement_automation_row` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_statement_automation_row_au` AFTER UPDATE ON `statement_automation_row` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_statement_automation_row_ad` AFTER DELETE ON `statement_automation_row` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_statement_automation_run_ai` AFTER INSERT ON `statement_automation_run` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_statement_automation_run_au` AFTER UPDATE ON `statement_automation_run` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_statement_automation_run_ad` AFTER DELETE ON `statement_automation_run` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_statement_bonus_ai` AFTER INSERT ON `statement_bonus` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_statement_bonus_au` AFTER UPDATE ON `statement_bonus` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_statement_bonus_ad` AFTER DELETE ON `statement_bonus` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_statement_intake_ai` AFTER INSERT ON `statement_intake` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_statement_intake_au` AFTER UPDATE ON `statement_intake` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_statement_intake_ad` AFTER DELETE ON `statement_intake` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_statement_settlement_ai` AFTER INSERT ON `statement_settlement` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_statement_settlement_au` AFTER UPDATE ON `statement_settlement` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_statement_settlement_ad` AFTER DELETE ON `statement_settlement` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_statement_settlement_config_ai` AFTER INSERT ON `statement_settlement_config` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_statement_settlement_config_au` AFTER UPDATE ON `statement_settlement_config` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_statement_settlement_config_ad` AFTER DELETE ON `statement_settlement_config` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_statement_settlement_delivery_ai` AFTER INSERT ON `statement_settlement_delivery` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_statement_settlement_delivery_au` AFTER UPDATE ON `statement_settlement_delivery` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_statement_settlement_delivery_ad` AFTER DELETE ON `statement_settlement_delivery` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_trade_ai` AFTER INSERT ON `trade` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_trade_au` AFTER UPDATE ON `trade` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_trade_ad` AFTER DELETE ON `trade` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_transfer_ai` AFTER INSERT ON `transfer` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_transfer_au` AFTER UPDATE ON `transfer` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_transfer_ad` AFTER DELETE ON `transfer` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_valuation_ai` AFTER INSERT ON `valuation` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_valuation_au` AFTER UPDATE ON `valuation` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_valuation_ad` AFTER DELETE ON `valuation` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_wage_component_mapping_ai` AFTER INSERT ON `wage_component_mapping` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_wage_component_mapping_au` AFTER UPDATE ON `wage_component_mapping` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ledger_version_wage_component_mapping_ad` AFTER DELETE ON `wage_component_mapping` BEGIN UPDATE `ledger_version` SET `version` = `version` + 1 WHERE `id` = 1; END;
