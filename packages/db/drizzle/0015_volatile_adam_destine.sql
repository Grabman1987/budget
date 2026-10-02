CREATE TABLE `consumer_price_index` (
	`series` text NOT NULL,
	`month` text NOT NULL,
	`index_micro` integer NOT NULL,
	`source` text DEFAULT 'statistik_austria' NOT NULL,
	`fetched_at` text NOT NULL,
	PRIMARY KEY(`series`, `month`),
	CONSTRAINT "cpi_month_chk" CHECK("consumer_price_index"."month" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]'),
	CONSTRAINT "cpi_index_positive_chk" CHECK("consumer_price_index"."index_micro" > 0)
);
