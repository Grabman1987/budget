-- Additive, explicit manual FX only. No historical pairing or native amount rewrite.
CREATE TABLE `transfer_fx` (
  `id` text PRIMARY KEY NOT NULL REFERENCES `transfer`(`id`),
  `from_booking_id` text NOT NULL,
  `to_booking_id` text NOT NULL,
  `fee_booking_id` text,
  `facts_json` text NOT NULL,
  `valuation_json` text NOT NULL,
  `created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  `updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  `deleted_at` text,
  CONSTRAINT `transfer_fx_distinct_chk` CHECK (`from_booking_id` <> `to_booking_id` AND
    (`fee_booking_id` IS NULL OR (`fee_booking_id` <> `from_booking_id` AND `fee_booking_id` <> `to_booking_id`))),
  CONSTRAINT `transfer_fx_json_chk` CHECK (json_valid(`facts_json`) AND json_valid(`valuation_json`))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transfer_fx_from_uq` ON `transfer_fx` (`from_booking_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `transfer_fx_to_uq` ON `transfer_fx` (`to_booking_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `transfer_fx_fee_uq` ON `transfer_fx` (`fee_booking_id`);
