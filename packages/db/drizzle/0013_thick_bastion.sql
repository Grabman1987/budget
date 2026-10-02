CREATE TABLE `import_file` (
	`import_run_id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`sha256` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`bytes` blob NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`import_run_id`) REFERENCES `import_run`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `import_price_change` (
	`import_run_id` text NOT NULL,
	`security_id` text NOT NULL,
	`date` text NOT NULL,
	`old_price_micro` integer,
	`old_currency` text,
	`old_source` text,
	PRIMARY KEY(`import_run_id`, `security_id`, `date`),
	FOREIGN KEY (`import_run_id`) REFERENCES `import_run`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `account` ADD `reference_account_id` text REFERENCES account(id);