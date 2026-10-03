ALTER TABLE `account` ADD `interest_kind` text CONSTRAINT "account_interest_kind_chk" CHECK(`interest_kind` IN ('fixed', 'variable'));--> statement-breakpoint
ALTER TABLE `account` ADD `installment_cents` integer CONSTRAINT "account_installment_chk" CHECK(`installment_cents` >= 0);--> statement-breakpoint
ALTER TABLE `account` ADD `term_start` text CONSTRAINT "account_term_start_chk" CHECK(`term_start` GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]');--> statement-breakpoint
ALTER TABLE `account` ADD `original_amount_cents` integer CONSTRAINT "account_original_amount_chk" CHECK(`original_amount_cents` >= 0);
