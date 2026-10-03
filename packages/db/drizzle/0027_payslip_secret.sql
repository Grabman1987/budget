CREATE TABLE `payslip_secret` (
	`id` text PRIMARY KEY NOT NULL,
	`ciphertext` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
