-- Explicit security-transfer lineage only; no historical deliveries are inferred or rewritten.
CREATE TABLE `security_transfer_pair` (
  `id` text PRIMARY KEY NOT NULL,
  `security_id` text NOT NULL REFERENCES `security`(`id`),
  `out_trade_id` text NOT NULL REFERENCES `trade`(`id`),
  `in_trade_id` text NOT NULL REFERENCES `trade`(`id`),
  `creation_order` integer NOT NULL,
  `source_reference` text,
  `intent_key` text NOT NULL,
  `intent_hash` text NOT NULL,
  `audit_group_id` text NOT NULL,
  `created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  `updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  `deleted_at` text,
  CONSTRAINT `security_transfer_pair_legs_chk` CHECK (`out_trade_id` <> `in_trade_id`),
  CONSTRAINT `security_transfer_pair_order_chk` CHECK (`creation_order` > 0),
  CONSTRAINT `security_transfer_pair_reference_chk` CHECK (`source_reference` IS NULL OR length(`source_reference`) BETWEEN 1 AND 200)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `security_transfer_pair_out_uq` ON `security_transfer_pair` (`out_trade_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `security_transfer_pair_in_uq` ON `security_transfer_pair` (`in_trade_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `security_transfer_pair_order_uq` ON `security_transfer_pair` (`creation_order`);
--> statement-breakpoint
CREATE UNIQUE INDEX `security_transfer_pair_intent_uq` ON `security_transfer_pair` (`intent_key`);
--> statement-breakpoint
CREATE INDEX `security_transfer_pair_security_idx` ON `security_transfer_pair` (`security_id`);
--> statement-breakpoint
CREATE TRIGGER `security_transfer_pair_leg_membership_insert` BEFORE INSERT ON `security_transfer_pair`
WHEN EXISTS (SELECT 1 FROM `security_transfer_pair` WHERE
  `in_trade_id` = NEW.`out_trade_id` OR `out_trade_id` = NEW.`in_trade_id`)
BEGIN SELECT RAISE(ABORT, 'security transfer leg already paired'); END;
--> statement-breakpoint
CREATE TRIGGER `security_transfer_pair_leg_membership_update` BEFORE UPDATE OF `out_trade_id`, `in_trade_id` ON `security_transfer_pair`
WHEN EXISTS (SELECT 1 FROM `security_transfer_pair` WHERE `id` <> NEW.`id` AND
  (`in_trade_id` = NEW.`out_trade_id` OR `out_trade_id` = NEW.`in_trade_id`))
BEGIN SELECT RAISE(ABORT, 'security transfer leg already paired'); END;
--> statement-breakpoint
CREATE TRIGGER `security_transfer_pair_identity_immutable` BEFORE UPDATE ON `security_transfer_pair`
WHEN NEW.`security_id` IS NOT OLD.`security_id` OR
  NEW.`out_trade_id` IS NOT OLD.`out_trade_id` OR
  NEW.`in_trade_id` IS NOT OLD.`in_trade_id` OR
  NEW.`creation_order` IS NOT OLD.`creation_order` OR
  NEW.`source_reference` IS NOT OLD.`source_reference` OR
  NEW.`intent_key` IS NOT OLD.`intent_key` OR
  NEW.`intent_hash` IS NOT OLD.`intent_hash` OR
  NEW.`audit_group_id` IS NOT OLD.`audit_group_id` OR
  NEW.`created_at` IS NOT OLD.`created_at`
BEGIN SELECT RAISE(ABORT, 'security transfer pair identity is immutable'); END;
