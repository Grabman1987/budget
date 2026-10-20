CREATE TABLE `statement_intake` (
 `id` text PRIMARY KEY NOT NULL,
 `sha256` text NOT NULL CHECK(length(`sha256`) = 64 AND `sha256` NOT GLOB '*[^0-9a-f]*'),
 `receipt_id` text NOT NULL REFERENCES `receipt`(`id`),
 `account_id` text NOT NULL REFERENCES `account`(`id`),
 `status` text DEFAULT 'pending' NOT NULL CHECK(`status` IN ('pending','reviewed','rejected')),
 `proposal_json` text NOT NULL,
 `reviewed_json` text,
 `created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
 `updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
 `deleted_at` text,
 CHECK ((`status` = 'reviewed' AND `reviewed_json` IS NOT NULL) OR (`status` != 'reviewed' AND `reviewed_json` IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `statement_intake_sha256_uq` ON `statement_intake` (`sha256`);
