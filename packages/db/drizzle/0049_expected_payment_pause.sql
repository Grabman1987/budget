-- Hand-authored source migration; disposable-copy execution remains a delivery gate.
CREATE TABLE `expected_payment_pause` (
  `id` text PRIMARY KEY NOT NULL,
  `expected_payment_id` text NOT NULL,
  `from_date` text NOT NULL,
  `through_date` text NOT NULL,
  `created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  `updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  `deleted_at` text,
  FOREIGN KEY (`expected_payment_id`) REFERENCES `expected_payment`(`id`) ON UPDATE no action ON DELETE no action,
  CONSTRAINT `expected_pause_from_chk` CHECK (`from_date` GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
  CONSTRAINT `expected_pause_through_chk` CHECK (`through_date` GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
  CONSTRAINT `expected_pause_order_chk` CHECK (`from_date` <= `through_date`)
);
--> statement-breakpoint
CREATE INDEX `expected_pause_payment_range_idx` ON `expected_payment_pause` (`expected_payment_id`,`from_date`,`through_date`);
